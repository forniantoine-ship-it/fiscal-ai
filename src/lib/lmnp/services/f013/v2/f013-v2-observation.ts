/**
 * F013 v2 — observation documentaire canonique : paiement ≠ période économique.
 *
 * Une observation conserve SÉPARÉMENT : la date réelle de paiement, la période économique de location, la nature, le
 * bien, le montant (centimes), la provenance et l'historique de correction. Elle ne porte aucune autorité fiscale :
 * elle propose, l'utilisateur corrige/valide, le rapprochement annuel validé (moteur V2.1) décide.
 *
 * Réutilise `RevenueTransaction` (pipeline v1, inchangé) comme entrée — aucun second pipeline d'extraction.
 * Module pur.
 */
import { parseEventDate } from "../../revenue-aggregation";
import type { RevenueTransaction, RevenueTransactionCategory } from "../../../types";

/** UNKNOWN < PROPOSED (déduit) < EXPLICIT (énoncé par la source) < VALIDATED (confirmé par l'utilisateur). */
export type ObservationFieldStatus = "PROPOSED" | "EXPLICIT" | "VALIDATED";
export type ObservationField<T> =
  | { status: "UNKNOWN" }
  | { status: ObservationFieldStatus; value: T; confidence?: number; basis?: string; evidenceText?: string };

/** Période économique : une ou plusieurs mensualités `YYYY-MM` (triées, uniques). Jamais dérivée de la date de paiement. */
export interface RentalPeriodValue {
  months: readonly string[];
}

export type RentObservationNature = "rent" | "deposit" | "platform_payout" | "reimbursement" | "indemnity" | "other";

export interface PeriodAllocation {
  month: string;
  amountCents: number;
}

export interface ObservationEvidence {
  documentId: string;
  sourceType?: string;
  sourceLocation?: string;
  /** Identifiant (instable) du transaction v1 d'origine — trace seulement, jamais identité. */
  rawTransactionId?: string;
  extractedBy: "deterministic_parser" | "ocr_gpt" | "spreadsheet" | "structured_table" | "unknown";
}

export type CorrectableField = "paymentDate" | "rentalPeriod" | "nature" | "propertyId" | "allocations";

/** Audit d'une correction : valeur extraite ORIGINALE, valeur proposée juste avant, valeur retenue. */
export interface ObservationCorrection {
  field: CorrectableField;
  original: unknown;
  proposed: unknown;
  retained: unknown;
  correctedAt: string;
  by: "user";
}

export type ObservationFlag = "insufficient_for_rent_reconciliation";

export interface ExtractedSnapshot {
  paymentDate: ObservationField<string>;
  rentalPeriod: ObservationField<RentalPeriodValue>;
  nature: ObservationField<RentObservationNature>;
  propertyId: ObservationField<string>;
}

export interface RentObservation {
  observationId: string;
  evidence: ObservationEvidence;
  sourceLabel: string;
  amountCents: number;
  direction: "incoming" | "outgoing";
  paymentDate: ObservationField<string>;
  rentalPeriod: ObservationField<RentalPeriodValue>;
  /** Ventilation EXPLICITE d'un paiement multi-périodes ; absente si non documentée (jamais une répartition égale devinée). */
  allocations?: readonly PeriodAllocation[];
  nature: ObservationField<RentObservationNature>;
  propertyId: ObservationField<string>;
  /** Valeurs telles qu'extraites à la création — jamais réécrites par une correction. */
  extracted: ExtractedSnapshot;
  corrections: readonly ObservationCorrection[];
  flags: readonly ObservationFlag[];
}

// ---------------------------------------------------------------------------------------------------------------
// Période économique depuis un libellé (proposition déterministe — jamais une validation)
// ---------------------------------------------------------------------------------------------------------------

const MONTH_WORDS: ReadonlyArray<{ re: string; month: number }> = [
  { re: "janvier|janv|jan", month: 1 },
  { re: "fevrier|fevr|fev", month: 2 },
  { re: "mars", month: 3 },
  { re: "avril|avr", month: 4 },
  { re: "mai", month: 5 },
  { re: "juin", month: 6 },
  { re: "juillet|juil", month: 7 },
  { re: "aout", month: 8 },
  { re: "septembre|sept|sep", month: 9 },
  { re: "octobre|oct", month: 10 },
  { re: "novembre|nov", month: 11 },
  { re: "decembre|dec", month: 12 },
];

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

export interface ParsedRentalPeriod {
  months: string[];
  matchedText: string;
}

/**
 * Lit les mois nommés d'un libellé (« décembre 2025 », « DEC 25 », « novembre + décembre 2025 + janvier 2026 »,
 * « de septembre à novembre 2025 »). Un mois sans année hérite de l'année du prochain jalon daté à sa droite ; sans
 * année déterminable : `null` (aucune année devinée, jamais l'exercice courant).
 */
export function parseRentalPeriodFromLabel(label: string): ParsedRentalPeriod | null {
  const text = stripAccents(label).toLowerCase();
  const alternatives = MONTH_WORDS.map((m) => m.re).join("|");
  const token = new RegExp(`(?<![a-z])(${alternatives})(?![a-z])\\.?(?:\\s*(\\d{4}|\\d{2})(?!\\d))?`, "g");
  const rangeConnector = /^\s*(?:a|au|jusqu'?a)\s*$/;

  type Hit = { month: number; year: number | null; start: number; end: number };
  const hits: Hit[] = [];
  for (const match of text.matchAll(token)) {
    const word = match[1]!;
    const month = MONTH_WORDS.find((m) => new RegExp(`^(?:${m.re})$`).test(word))?.month;
    if (!month) continue;
    const yearText = match[2];
    const year = yearText === undefined ? null : yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    hits.push({ month, year, start: match.index!, end: match.index! + match[0].length });
  }
  if (hits.length === 0) return null;

  // Héritage d'année : de droite à gauche, un mois sans année prend l'année du jalon daté suivant.
  let nextYear: number | null = null;
  const resolved: Array<{ month: number; year: number | null; start: number; end: number }> = [];
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    const hit = hits[i]!;
    if (hit.year !== null) nextYear = hit.year;
    resolved.unshift({ ...hit, year: hit.year ?? nextYear });
  }
  if (resolved.some((hit) => hit.year === null)) return null;

  const months = new Set<string>();
  for (let i = 0; i < resolved.length; i += 1) {
    const hit = resolved[i]!;
    months.add(monthKey(hit.year!, hit.month));
    const following = resolved[i + 1];
    if (following && rangeConnector.test(text.slice(hit.end, following.start))) {
      let year = hit.year!;
      let month = hit.month;
      let guard = 0;
      while ((year !== following.year || month !== following.month) && guard < 12) {
        month += 1;
        if (month > 12) { month = 1; year += 1; }
        months.add(monthKey(year, month));
        guard += 1;
      }
    }
  }
  return { months: [...months].sort(), matchedText: label.trim() };
}

// ---------------------------------------------------------------------------------------------------------------
// Identité stable
// ---------------------------------------------------------------------------------------------------------------

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Identité stable : même document, même ligne, même contenu → même identifiant (ré-import idempotent). */
export function stableObservationId(parts: {
  documentId: string;
  sourceLabel: string;
  amountCents: number;
  dateText: string;
  ordinal: number;
}): string {
  const key = [parts.documentId, stripAccents(parts.sourceLabel).toLowerCase().replace(/\s+/g, " ").trim(), parts.amountCents, parts.dateText, parts.ordinal].join("|");
  return `obs_${fnv1a(key)}${fnv1a(`${key}#`)}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Construction depuis une transaction v1
// ---------------------------------------------------------------------------------------------------------------

export type ObservationPropertyAttribution =
  | { kind: "property"; propertyId: string; via?: string }
  | { kind: "common" }
  | { kind: "unresolved" };

export interface BuildObservationContext {
  fiscalYear: number;
  attribution: ObservationPropertyAttribution;
  /** Rang d'une ligne strictement identique au sein du même document (évite la collision d'identité). */
  ordinal?: number;
  extractedBy?: ObservationEvidence["extractedBy"];
}

export type BuildObservationResult =
  | { ok: true; observation: RentObservation }
  | { ok: false; reason: "invalid_amount" | "unsupported_direction" };

const NATURE_FROM_CATEGORY: Partial<Record<RevenueTransactionCategory, RentObservationNature>> = {
  rent: "rent",
  deposit: "deposit",
  platform_payout: "platform_payout",
  reimbursement: "reimbursement",
  insurance_indemnity: "indemnity",
  additional_income: "other",
  caf_subsidy: "other",
  charges: "other",
  fee: "other",
  internal_transfer: "other",
  owner_contribution: "other",
  owner_transfer: "other",
};

function isoDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function natureFromTransaction(tx: RevenueTransaction): ObservationField<RentObservationNature> {
  const label = stripAccents(tx.label ?? tx.description ?? "").toLowerCase();
  const mapped = NATURE_FROM_CATEGORY[tx.category];
  if (mapped) {
    return {
      status: mapped === "rent" && tx.explicitlyMarkedAsRent ? "EXPLICIT" : "PROPOSED",
      value: mapped,
      ...(tx.confidence !== undefined ? { confidence: tx.confidence } : {}),
      basis: "pipeline_category",
    };
  }
  // Catégorie inconnue : un libellé « loyer » est une proposition (jamais un fait), un dépôt n'est jamais un loyer.
  if (/\bdepot\b.*garantie|\bcaution\b/.test(label)) return { status: "PROPOSED", value: "deposit", basis: "label_keyword", evidenceText: tx.label };
  if (/\bloyers?\b/.test(label)) {
    return { status: "PROPOSED", value: "rent", ...(tx.confidence !== undefined ? { confidence: tx.confidence } : {}), basis: "label_keyword", evidenceText: tx.label };
  }
  return { status: "UNKNOWN" };
}

/** Construit une observation depuis une transaction du pipeline v1. N'utilise JAMAIS une ligne de grille. */
export function observationFromRevenueTransaction(tx: RevenueTransaction, context: BuildObservationContext): BuildObservationResult {
  if (tx.direction !== "credit" && tx.direction !== "debit") return { ok: false, reason: "unsupported_direction" };
  const cents = Math.round(Math.abs(tx.amount) * 100);
  if (!Number.isFinite(tx.amount) || cents <= 0 || Math.abs(Math.abs(tx.amount) * 100 - cents) > 1e-6) {
    return { ok: false, reason: "invalid_amount" };
  }
  const sourceLabel = (tx.label ?? tx.description ?? "").trim();
  const documentId = tx.sourceDocumentId ?? "unknown_document";

  const parsedDate = parseEventDate(tx.date);
  const paymentDate: ObservationField<string> = parsedDate
    ? { status: "EXPLICIT", value: isoDate(parsedDate), basis: "source_date", evidenceText: tx.date ?? undefined }
    : { status: "UNKNOWN" };

  let rentalPeriod: ObservationField<RentalPeriodValue> = { status: "UNKNOWN" };
  const fromLabel = parseRentalPeriodFromLabel(sourceLabel);
  if (fromLabel) {
    rentalPeriod = { status: "PROPOSED", value: { months: fromLabel.months }, basis: "label_text", evidenceText: fromLabel.matchedText };
  } else if (!parsedDate && tx.monthLabel && tx.structuredMapping) {
    const monthNumber = parseRentalPeriodFromLabel(`${tx.monthLabel} ${context.fiscalYear}`);
    if (monthNumber) {
      rentalPeriod = {
        status: "PROPOSED",
        value: { months: monthNumber.months },
        basis: "structured_table_month_label",
        evidenceText: tx.monthLabel,
      };
    }
  }

  const nature = natureFromTransaction(tx);
  const propertyId: ObservationField<string> =
    context.attribution.kind === "property"
      ? { status: "EXPLICIT", value: context.attribution.propertyId, basis: context.attribution.via ?? "document_scope" }
      : { status: "UNKNOWN" };

  const dateText = tx.date ?? "";
  const extracted: ExtractedSnapshot = JSON.parse(JSON.stringify({ paymentDate, rentalPeriod, nature, propertyId })) as ExtractedSnapshot;
  const flags: ObservationFlag[] = nature.status !== "UNKNOWN" && nature.value === "platform_payout" ? ["insufficient_for_rent_reconciliation"] : [];

  return {
    ok: true,
    observation: {
      observationId: stableObservationId({ documentId, sourceLabel, amountCents: cents, dateText, ordinal: context.ordinal ?? 0 }),
      evidence: {
        documentId,
        ...(tx.sourceType ? { sourceType: tx.sourceType } : {}),
        rawTransactionId: tx.id,
        extractedBy: context.extractedBy ?? (tx.structuredMapping ? "structured_table" : "unknown"),
      },
      sourceLabel,
      amountCents: cents,
      direction: tx.direction === "credit" ? "incoming" : "outgoing",
      paymentDate,
      rentalPeriod,
      nature,
      propertyId,
      extracted,
      corrections: [],
      flags,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Corrections utilisateur (audit conservé)
// ---------------------------------------------------------------------------------------------------------------

export type ObservationCorrectionInput =
  | { field: "paymentDate"; value: string }
  | { field: "rentalPeriod"; value: RentalPeriodValue }
  | { field: "nature"; value: RentObservationNature }
  | { field: "propertyId"; value: string }
  | { field: "allocations"; value: readonly PeriodAllocation[] };

export type CorrectionResult = { ok: true; observation: RentObservation } | { ok: false; reason: "invalid_value" | "allocations_sum_mismatch" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Applique une correction : le champ devient VALIDATED, `extracted` n'est jamais modifié, et la correction conserve
 * (valeur extraite originale, valeur proposée avant correction, valeur retenue).
 */
export function applyObservationCorrection(observation: RentObservation, input: ObservationCorrectionInput, correctedAtIso: string): CorrectionResult {
  const corrections = (field: CorrectableField, proposed: unknown, retained: unknown): ObservationCorrection => ({
    field,
    original: field === "allocations" ? null : (observation.extracted as unknown as Record<string, unknown>)[field],
    proposed,
    retained,
    correctedAt: correctedAtIso,
    by: "user",
  });
  switch (input.field) {
    case "paymentDate":
      if (!ISO_DATE.test(input.value) || parseEventDate(input.value) === null) return { ok: false, reason: "invalid_value" };
      return { ok: true, observation: { ...observation, paymentDate: { status: "VALIDATED", value: input.value }, corrections: [...observation.corrections, corrections("paymentDate", observation.paymentDate, input.value)] } };
    case "rentalPeriod": {
      const months = [...new Set(input.value.months)].sort();
      if (months.length === 0 || !months.every((m) => MONTH_KEY.test(m))) return { ok: false, reason: "invalid_value" };
      return { ok: true, observation: { ...observation, rentalPeriod: { status: "VALIDATED", value: { months } }, corrections: [...observation.corrections, corrections("rentalPeriod", observation.rentalPeriod, { months })] } };
    }
    case "nature":
      return { ok: true, observation: { ...observation, nature: { status: "VALIDATED", value: input.value }, flags: input.value === "platform_payout" ? observation.flags : observation.flags.filter((f) => f !== "insufficient_for_rent_reconciliation"), corrections: [...observation.corrections, corrections("nature", observation.nature, input.value)] } };
    case "propertyId":
      if (!input.value) return { ok: false, reason: "invalid_value" };
      return { ok: true, observation: { ...observation, propertyId: { status: "VALIDATED", value: input.value }, corrections: [...observation.corrections, corrections("propertyId", observation.propertyId, input.value)] } };
    case "allocations": {
      const valid = input.value.length > 0 && input.value.every((a) => MONTH_KEY.test(a.month) && Number.isSafeInteger(a.amountCents) && a.amountCents > 0);
      if (!valid) return { ok: false, reason: "invalid_value" };
      if (input.value.reduce((s, a) => s + a.amountCents, 0) !== observation.amountCents) return { ok: false, reason: "allocations_sum_mismatch" };
      const months = [...new Set(input.value.map((a) => a.month))].sort();
      return {
        ok: true,
        observation: {
          ...observation,
          allocations: input.value.map((a) => ({ ...a })),
          rentalPeriod: { status: "VALIDATED", value: { months } },
          corrections: [...observation.corrections, corrections("allocations", observation.allocations ?? null, input.value)],
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Restauration défensive (jamais de promotion PROPOSED → VALIDATED)
// ---------------------------------------------------------------------------------------------------------------

const FIELD_STATUSES = new Set(["UNKNOWN", "PROPOSED", "EXPLICIT", "VALIDATED"]);
const NATURES = new Set<string>(["rent", "deposit", "platform_payout", "reimbursement", "indemnity", "other"]);

function validField(field: unknown, valueOk: (v: unknown) => boolean): boolean {
  if (typeof field !== "object" || field === null) return false;
  const f = field as { status?: unknown; value?: unknown };
  if (typeof f.status !== "string" || !FIELD_STATUSES.has(f.status)) return false;
  return f.status === "UNKNOWN" ? f.value === undefined : valueOk(f.value);
}
const periodOk = (v: unknown) => typeof v === "object" && v !== null && Array.isArray((v as RentalPeriodValue).months) && (v as RentalPeriodValue).months.length > 0 && (v as RentalPeriodValue).months.every((m) => typeof m === "string" && MONTH_KEY.test(m));

/**
 * Valide la forme d'une observation persistée. Un champ `VALIDATED` doit être justifié par une correction utilisateur
 * de ce champ portant la même valeur retenue : sinon l'observation est rejetée (`null`), jamais promue ni corrigée.
 */
export function parseRentObservation(raw: unknown): RentObservation | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as RentObservation;
  if (typeof o.observationId !== "string" || !o.observationId || typeof o.sourceLabel !== "string") return null;
  if (!Number.isSafeInteger(o.amountCents) || o.amountCents <= 0) return null;
  if (o.direction !== "incoming" && o.direction !== "outgoing") return null;
  if (typeof o.evidence?.documentId !== "string") return null;
  if (!validField(o.paymentDate, (v) => typeof v === "string" && ISO_DATE.test(v))) return null;
  if (!validField(o.rentalPeriod, periodOk)) return null;
  if (!validField(o.nature, (v) => typeof v === "string" && NATURES.has(v))) return null;
  if (!validField(o.propertyId, (v) => typeof v === "string" && v.length > 0)) return null;
  if (typeof o.extracted !== "object" || o.extracted === null || !Array.isArray(o.corrections) || !Array.isArray(o.flags)) return null;
  const fieldOf: Record<string, { status: string; value?: unknown }> = {
    paymentDate: o.paymentDate, rentalPeriod: o.rentalPeriod, nature: o.nature, propertyId: o.propertyId,
  };
  for (const [name, field] of Object.entries(fieldOf)) {
    if (field.status !== "VALIDATED") continue;
    const justified = o.corrections.some((c) => (c.field === name || (name === "rentalPeriod" && c.field === "allocations")) && c.by === "user"
      && (c.field === "allocations" ? true : JSON.stringify(c.retained) === JSON.stringify(field.value)));
    if (!justified) return null;
  }
  if (o.allocations !== undefined) {
    const total = o.allocations.reduce((s, a) => s + a.amountCents, 0);
    if (total !== o.amountCents) return null;
  }
  return raw as RentObservation;
}
