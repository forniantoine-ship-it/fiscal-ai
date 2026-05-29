import { z } from "zod";

/**
 * Logement acte notarié — GPT extraction schema (V1).
 *
 * Minimal, business-oriented payload for initializing the Logement tunnel and
 * optionally prefilling Crédit hints from the same document.
 *
 * ## Scope
 *
 * We do NOT extract the full acte notarié. Only LMNP-useful fields are kept.
 *
 * ## Property address (critical disambiguation)
 *
 * `propertyAddress`, `propertyPostalCode`, and `propertyCity` refer ONLY to the
 * purchased asset (the bien immobilier). They must NOT be confused with:
 * - buyer / acquéreur correspondence address
 * - seller / vendeur address
 * - notary office address
 * - domicile électif or personal domicile
 *
 * ## Credit fields (informational, cross-tunnel prefill later)
 *
 * Loan fields may appear in the acte under a financing / prêt / hypothèque section,
 * or mirror figures from an attached loan offer. They are informational only at this
 * stage — the Crédit tunnel remains the source of truth for loan data.
 *
 * ## Intentionally ignored (out of V1 scope)
 *
 * - indivision complexity, ownership shares, usufruit
 * - tax details (TVA, plus-value, droits)
 * - cadastral references, multi-lot decomposition
 * - seller identity, notary metadata, parties beyond the asset
 *
 * This schema stays SMALL on purpose to maximize GPT extraction reliability.
 */

const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();

export const LogementActeExtractionSchema = z.object({
  // — Property (Logement tunnel) —
  /** Physical address of the purchased property — NOT buyer/seller/notary address. */
  propertyAddress: nullableString,
  propertyPostalCode: nullableString,
  propertyCity: nullableString,
  /** e.g. appartement, maison, studio, immeuble */
  propertyType: nullableString,
  /** Acquisition date — normalized to YYYY-MM-DD when possible. */
  acquisitionDate: nullableString,
  /** Purchase price — numeric only, no currency symbol. */
  acquisitionPrice: nullableNumber,
  /** Notary fees (frais de notaire) — numeric only. */
  notaryFees: nullableNumber,
  /** Living surface in m² — numeric only. */
  surfaceM2: nullableNumber,

  // — Loan / credit hints (informational — Crédit tunnel prefill later) —
  /** Principal borrowed amount — may come from financing section or loan offer annex. */
  loanAmount: nullableNumber,
  bankName: nullableString,
  loanDurationMonths: nullableNumber,
  monthlyPayment: nullableNumber,
  /** Annual or nominal rate as a plain number (e.g. 2.5 for 2,5 %). */
  interestRate: nullableNumber,
});

export type LogementActeExtractionRaw = z.infer<typeof LogementActeExtractionSchema>;

/** Normalized extraction — absent fields are omitted (undefined), never null or "". */
export type LogementActeExtraction = {
  propertyAddress?: string;
  propertyPostalCode?: string;
  propertyCity?: string;
  propertyType?: string;
  acquisitionDate?: string;
  acquisitionPrice?: number;
  notaryFees?: number;
  surfaceM2?: number;
  loanAmount?: number;
  bankName?: string;
  loanDurationMonths?: number;
  monthlyPayment?: number;
  interestRate?: number;
};

const LOGEMENT_ACTE_FIELD_KEYS = [
  "propertyAddress",
  "propertyPostalCode",
  "propertyCity",
  "propertyType",
  "acquisitionDate",
  "acquisitionPrice",
  "notaryFees",
  "surfaceM2",
  "loanAmount",
  "bankName",
  "loanDurationMonths",
  "monthlyPayment",
  "interestRate",
] as const satisfies readonly (keyof LogementActeExtraction)[];

const CURRENCY_NOISE = /[€$£]/g;
const CURRENCY_WORDS = /\b(EUR|eur|euros?)\b/gi;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Trim strings; empty string and null become undefined.
 */
export function normalizeString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Parse numeric values from GPT output or OCR fragments.
 * Strips currency symbols, normalizes French decimals, collapses spaces.
 * Returns undefined for impossible or non-finite values.
 */
export function normalizeNumber(value: unknown): number | undefined {
  if (value == null) return undefined;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== "string") return undefined;

  let raw = value
    .replace(CURRENCY_NOISE, "")
    .replace(CURRENCY_WORDS, "")
    .replace(/%/g, "")
    .replace(/\s/g, "")
    .trim();

  if (!raw) return undefined;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  if (hasComma && hasDot) {
    if (raw.lastIndexOf(",") > raw.lastIndexOf(".")) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  } else if (hasComma) {
    raw = raw.replace(",", ".");
  }

  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Normalize dates to YYYY-MM-DD when a reliable parse is possible.
 * Accepts ISO dates and common French DD/MM/YYYY (or DD-MM-YYYY) formats.
 */
export function normalizeDate(value: unknown): string | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;

  if (ISO_DATE.test(raw)) {
    return isValidIsoDate(raw) ? raw : undefined;
  }

  const slash = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slash) {
    const day = slash[1].padStart(2, "0");
    const month = slash[2].padStart(2, "0");
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    const iso = `${year}-${month}-${day}`;
    return isValidIsoDate(iso) ? iso : undefined;
  }

  const isoLike = raw.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (isoLike) {
    const iso = `${isoLike[1]}-${isoLike[2].padStart(2, "0")}-${isoLike[3].padStart(2, "0")}`;
    return isValidIsoDate(iso) ? iso : undefined;
  }

  return undefined;
}

function isValidIsoDate(iso: string): boolean {
  if (!ISO_DATE.test(iso)) return false;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizePropertyType(value: unknown): string | undefined {
  const raw = normalizeString(value);
  return raw ? raw.toLowerCase() : undefined;
}

function normalizePostalCode(value: unknown): string | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 5 ? digits : raw;
}

function assignIfDefined<T extends LogementActeExtraction, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

/**
 * Validate raw GPT JSON, normalize every field, and return a clean extraction object.
 * Missing or invalid values are omitted — never returned as null or empty strings.
 */
export function normalizeLogementActeExtraction(raw: unknown): LogementActeExtraction {
  const parsed = LogementActeExtractionSchema.safeParse(raw);
  const source: Record<string, unknown> =
    parsed.success && parsed.data && typeof parsed.data === "object"
      ? (parsed.data as Record<string, unknown>)
      : raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};

  const normalized: LogementActeExtraction = {};

  assignIfDefined(normalized, "propertyAddress", normalizeString(source.propertyAddress));
  assignIfDefined(normalized, "propertyPostalCode", normalizePostalCode(source.propertyPostalCode));
  assignIfDefined(normalized, "propertyCity", normalizeString(source.propertyCity));
  assignIfDefined(normalized, "propertyType", normalizePropertyType(source.propertyType));
  assignIfDefined(normalized, "acquisitionDate", normalizeDate(source.acquisitionDate));
  assignIfDefined(normalized, "acquisitionPrice", normalizeNumber(source.acquisitionPrice));
  assignIfDefined(normalized, "notaryFees", normalizeNumber(source.notaryFees));
  assignIfDefined(normalized, "surfaceM2", normalizeNumber(source.surfaceM2));
  assignIfDefined(normalized, "loanAmount", normalizeNumber(source.loanAmount));
  assignIfDefined(normalized, "bankName", normalizeString(source.bankName));
  assignIfDefined(
    normalized,
    "loanDurationMonths",
    normalizeNumber(source.loanDurationMonths),
  );
  assignIfDefined(normalized, "monthlyPayment", normalizeNumber(source.monthlyPayment));
  assignIfDefined(normalized, "interestRate", normalizeNumber(source.interestRate));

  return normalized;
}

export const LOGEMENT_ACTE_EXTRACTION_FIELD_KEYS = LOGEMENT_ACTE_FIELD_KEYS;

export type LogementActeExtractionFieldKey = (typeof LOGEMENT_ACTE_FIELD_KEYS)[number];
