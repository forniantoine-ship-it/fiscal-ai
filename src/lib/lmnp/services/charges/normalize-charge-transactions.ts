/**
 * Deterministic LMNP charge transaction normalizer.
 * Sits after specialized parsers and before UI / accounting integration.
 *
 * Pipeline: PDF → OCR → classifier → parser → raw[] → normalizeChargeTransactions() → UI
 */

import type { ExpenseCategory } from "@/lib/lmnp/types/domain";
import {
  logChargeParserTraces,
  normalizeChargeDateValue,
  parseFrenchCurrencyAmount,
  type ChargeParseTrace,
} from "./charge-parse-utils";
import type { CoproParsedTransaction } from "./parse-copropriete-document";
import type { InsuranceChargeDocument } from "./parse-insurance-document";

export const CHARGE_TRANSACTION_CATEGORIES = [
  "assurance_habitation",
  "charges_copro",
  "fonds_travaux",
  "avance_tresorerie",
  "taxe_fonciere",
  "facture_artisan",
  "facture_energie",
] as const;

export type ChargeTransactionCategory = (typeof CHARGE_TRANSACTION_CATEGORIES)[number];

/** Alias map from classifier / legacy parser category strings. */
const CATEGORY_ALIASES: Record<string, ChargeTransactionCategory> = {
  assurance_habitation: "assurance_habitation",
  insurance_habitation: "assurance_habitation",
  charges_copro: "charges_copro",
  charges_copropriete: "charges_copro",
  fonds_travaux: "fonds_travaux",
  avance_tresorerie: "avance_tresorerie",
  taxe_fonciere: "taxe_fonciere",
  facture_artisan: "facture_artisan",
  facture_energie: "facture_energie",
};

const PARSER_ID = "charge-normalizer";

/** Default fiscal flags when parser did not set explicit flags. */
const DEFAULT_FISCAL_BY_CATEGORY: Record<
  ChargeTransactionCategory,
  { deductible: boolean; amortizable: boolean; expenseCategory: ExpenseCategory }
> = {
  assurance_habitation: { deductible: true, amortizable: false, expenseCategory: "insurance" },
  charges_copro: { deductible: true, amortizable: false, expenseCategory: "condo" },
  fonds_travaux: { deductible: false, amortizable: false, expenseCategory: "condo" },
  avance_tresorerie: { deductible: false, amortizable: false, expenseCategory: "condo" },
  taxe_fonciere: { deductible: true, amortizable: false, expenseCategory: "property_tax" },
  facture_artisan: { deductible: true, amortizable: false, expenseCategory: "works_deductible" },
  facture_energie: { deductible: true, amortizable: false, expenseCategory: "other" },
};

/** Default extraction confidence when parser omits a score (0–100). */
const DEFAULT_CONFIDENCE_BY_CATEGORY: Record<ChargeTransactionCategory, number> = {
  assurance_habitation: 78,
  charges_copro: 82,
  fonds_travaux: 80,
  avance_tresorerie: 80,
  taxe_fonciere: 76,
  facture_artisan: 72,
  facture_energie: 74,
};

const ARTISAN_AMORTIZABLE_LABEL =
  /réfection|refection|rénovation|renovation|agencement|parquet|carrelage|climatisation|clim\b|fenêtre|fenetre|chaudière|chaudiere|isolation|structure|salle\s+de\s+bain|sanitaire|menuiserie|cuisine\s+équip|cuisine\s+equip|mobilier|meuble|ameublement|électroménager|electromenager|climatiseur|pompe\s+à\s+chaleur|vmc|chauffe[-\s]?eau/i;

const ARTISAN_NON_AMORTIZABLE_LABEL =
  /retouche|petit\s+trav|reparation\s+simple|réparation\s+simple|debouchage|joint|entretien\s+courant/i;

export type RawChargeTransaction = {
  category: string;
  label?: string;
  amount?: number | string;
  montantTTC?: number | string;
  date?: string;
  periodeDebut?: string;
  periodeFin?: string;
  deductible?: boolean;
  amortizable?: boolean;
  sourceDocument: string;
  lineIndex?: number;
  rawLine?: string;
  extractionConfidence?: number;
  fournisseur?: string;
  adresseBien?: string;
};

export type ChargeFiscalMetadata = {
  lmnpDeductible: boolean;
  amortizable: boolean;
  expenseCategory: ExpenseCategory;
  fournisseur?: string;
  adresseBien?: string;
};

export type ChargeSourceTrace = {
  sourceDocument: string;
  lineIndex?: number;
  rawLine?: string;
};

export type NormalizedChargeTransaction = {
  category: ChargeTransactionCategory;
  label: string;
  amount: number;
  date?: string;
  periodeDebut?: string;
  periodeFin?: string;
  deductible: boolean;
  amortizable: boolean;
  sourceDocument: string;
  extractionConfidence: number;
  fiscalMetadata: ChargeFiscalMetadata;
  sourceTrace: ChargeSourceTrace;
};

export type RejectedChargeTransaction = {
  input: RawChargeTransaction;
  reason: string;
};

export type NormalizeChargeTransactionsResult = {
  transactions: NormalizedChargeTransaction[];
  rejected: RejectedChargeTransaction[];
  traces: ChargeParseTrace[];
  errors: string[];
};

function pushTrace(
  traces: ChargeParseTrace[],
  step: string,
  detail: string,
  value?: string | number | boolean | null,
): void {
  traces.push({ step, detail, value });
}

export function resolveChargeCategory(raw: string): ChargeTransactionCategory | null {
  const key = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return CATEGORY_ALIASES[key] ?? null;
}

function normalizeAmountValue(
  value: number | string | undefined,
  traces: ChargeParseTrace[],
  context: string,
): number | null {
  if (value === undefined || value === null || value === "") {
    pushTrace(traces, "amount-reject", `${context}: missing amount`, null);
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      pushTrace(traces, "amount-reject", `${context}: invalid number`, value);
      return null;
    }
    return Math.round(value * 100) / 100;
  }
  const parsed = parseFrenchCurrencyAmount(String(value));
  if (parsed === null) {
    pushTrace(traces, "amount-reject", `${context}: malformed string`, String(value));
    return null;
  }
  return parsed;
}

function resolveLabel(input: RawChargeTransaction, category: ChargeTransactionCategory): string {
  const label = input.label?.trim();
  if (label) return label;
  if (input.fournisseur?.trim()) return input.fournisseur.trim();
  const fallbacks: Record<ChargeTransactionCategory, string> = {
    assurance_habitation: "Assurance habitation",
    charges_copro: "Charges copropriété",
    fonds_travaux: "Fonds de travaux",
    avance_tresorerie: "Avance de trésorerie",
    taxe_fonciere: "Taxe foncière",
    facture_artisan: "Facture artisan",
    facture_energie: "Facture énergie",
  };
  return fallbacks[category];
}

function assessArtisanAmortizable(label: string, amount: number): boolean {
  if (ARTISAN_NON_AMORTIZABLE_LABEL.test(label)) return false;
  if (ARTISAN_AMORTIZABLE_LABEL.test(label)) return amount >= 600;
  return false;
}

function clampConfidence(value: number | undefined, category: ChargeTransactionCategory): number {
  const base = value ?? DEFAULT_CONFIDENCE_BY_CATEGORY[category];
  if (!Number.isFinite(base)) return DEFAULT_CONFIDENCE_BY_CATEGORY[category];
  return Math.min(100, Math.max(0, Math.round(base)));
}

function computeFiscalFlags(
  category: ChargeTransactionCategory,
  label: string,
  amount: number,
  input: RawChargeTransaction,
): { deductible: boolean; amortizable: boolean; expenseCategory: ExpenseCategory } {
  const defaults = DEFAULT_FISCAL_BY_CATEGORY[category];

  let amortizable = input.amortizable ?? defaults.amortizable;
  if (category === "facture_artisan") {
    amortizable = input.amortizable ?? assessArtisanAmortizable(label, amount);
  }

  let deductible = input.deductible ?? defaults.deductible;
  if (category === "avance_tresorerie" || category === "fonds_travaux") {
    deductible = false;
  }

  return {
    deductible,
    amortizable,
    expenseCategory: defaults.expenseCategory,
  };
}

/**
 * Normalizes a single raw charge transaction. Returns null when validation fails.
 */
export function normalizeChargeTransaction(
  input: RawChargeTransaction,
  traces?: ChargeParseTrace[],
): NormalizedChargeTransaction | null {
  const localTraces = traces ?? [];
  const category = resolveChargeCategory(input.category);
  if (!category) {
    pushTrace(localTraces, "reject", "Unknown category", input.category);
    return null;
  }

  const sourceDocument = input.sourceDocument?.trim();
  if (!sourceDocument) {
    pushTrace(localTraces, "reject", "Missing sourceDocument", null);
    return null;
  }

  const amount =
    normalizeAmountValue(input.amount, localTraces, "amount") ??
    normalizeAmountValue(input.montantTTC, localTraces, "montantTTC");
  if (amount === null) return null;

  const label = resolveLabel(input, category);
  const date = input.date ? normalizeChargeDateValue(input.date) ?? undefined : undefined;
  const periodeDebut = input.periodeDebut
    ? normalizeChargeDateValue(input.periodeDebut) ?? undefined
    : undefined;
  const periodeFin = input.periodeFin
    ? normalizeChargeDateValue(input.periodeFin) ?? undefined
    : undefined;

  if (input.date && !date) {
    pushTrace(localTraces, "date-reject", "Malformed date", input.date);
    return null;
  }
  if (input.periodeDebut && !periodeDebut) {
    pushTrace(localTraces, "date-reject", "Malformed periodeDebut", input.periodeDebut);
    return null;
  }
  if (input.periodeFin && !periodeFin) {
    pushTrace(localTraces, "date-reject", "Malformed periodeFin", input.periodeFin);
    return null;
  }

  const fiscal = computeFiscalFlags(category, label, amount, input);
  const explicitConfidence =
    input.extractionConfidence !== undefined &&
    Number.isFinite(input.extractionConfidence);
  let extractionConfidence = clampConfidence(input.extractionConfidence, category);
  if (!explicitConfidence) {
    if (periodeDebut && periodeFin) extractionConfidence = Math.min(100, extractionConfidence + 4);
    if (input.lineIndex !== undefined) extractionConfidence = Math.min(100, extractionConfidence + 2);
  }

  pushTrace(localTraces, "normalize", `OK ${category}`, amount);

  return {
    category,
    label,
    amount,
    date,
    periodeDebut,
    periodeFin,
    deductible: fiscal.deductible,
    amortizable: fiscal.amortizable,
    sourceDocument,
    extractionConfidence,
    fiscalMetadata: {
      lmnpDeductible: fiscal.deductible,
      amortizable: fiscal.amortizable,
      expenseCategory: fiscal.expenseCategory,
      fournisseur: input.fournisseur?.trim() || undefined,
      adresseBien: input.adresseBien?.trim() || undefined,
    },
    sourceTrace: {
      sourceDocument,
      lineIndex: input.lineIndex,
      rawLine: input.rawLine,
    },
  };
}

export type NormalizeChargeTransactionsOptions = {
  logTraces?: boolean;
};

/**
 * Normalizes an array of raw parser transactions for UI and accounting.
 */
export function normalizeChargeTransactions(
  rawTransactions: RawChargeTransaction[],
  options?: NormalizeChargeTransactionsOptions,
): NormalizeChargeTransactionsResult {
  const traces: ChargeParseTrace[] = [];
  const errors: string[] = [];
  const transactions: NormalizedChargeTransaction[] = [];
  const rejected: RejectedChargeTransaction[] = [];
  const logTraces = options?.logTraces !== false;

  console.log("[charges-normalizer-input]", { rawTransactions });

  pushTrace(traces, "batch", "Normalize charge transactions", rawTransactions.length);

  if (!Array.isArray(rawTransactions) || rawTransactions.length === 0) {
    errors.push("empty_raw_transactions");
  }

  for (let i = 0; i < rawTransactions.length; i++) {
    const input = rawTransactions[i]!;
    const normalized = normalizeChargeTransaction(input, traces);
    if (normalized) {
      transactions.push(normalized);
    } else {
      const reason =
        !resolveChargeCategory(input.category)
          ? "unknown_category"
          : !input.sourceDocument?.trim()
            ? "missing_source_document"
            : "invalid_amount_or_date";
      console.log("[charges-normalizer-rejection]", {
        reason,
        transaction: input,
        validationState: {
          categoryResolved: resolveChargeCategory(input.category),
          hasSourceDocument: Boolean(input.sourceDocument?.trim()),
          amountRaw: input.amount,
          montantTTCRaw: input.montantTTC,
          dateRaw: input.date,
          periodeDebutRaw: input.periodeDebut,
          periodeFinRaw: input.periodeFin,
        },
      });
      rejected.push({ input, reason });
      errors.push(`rejected_${i}:${reason}`);
      pushTrace(traces, "reject", `Index ${i}`, reason);
    }
  }

  console.log("[charges-normalizer-output]", {
    normalizedTransactions: transactions,
    beforeCount: rawTransactions.length,
    afterCount: transactions.length,
    rejectedCount: rejected.length,
  });
  if (rejected.length > 0) {
    console.log("[charges-normalizer-filter]", {
      beforeCount: rawTransactions.length,
      afterCount: transactions.length,
      removedTransactions: rejected,
    });
  }

  pushTrace(traces, "result", "Batch complete", transactions.length);

  if (logTraces) {
    logChargeParserTraces(PARSER_ID, traces, {
      inputCount: rawTransactions.length,
      accepted: transactions.length,
      rejected: rejected.length,
      errors,
      byCategory: transactions.reduce(
        (acc, t) => {
          acc[t.category] = (acc[t.category] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    });
  }

  return { transactions, rejected, traces, errors };
}

/** Maps insurance parser output to raw transactions (single premium line). */
export function rawTransactionsFromInsurance(
  doc: InsuranceChargeDocument,
  sourceDocument: string,
  extractionConfidence?: number,
): RawChargeTransaction[] {
  return [
    {
      category: "assurance_habitation",
      label: doc.fournisseur,
      fournisseur: doc.fournisseur,
      montantTTC: doc.montantTTC,
      periodeDebut: doc.periodeDebut,
      periodeFin: doc.periodeFin,
      adresseBien: doc.adresseBien,
      deductible: doc.deductible,
      amortizable: false,
      sourceDocument,
      extractionConfidence,
    },
  ];
}

/** Maps copropriété parser lines to raw transactions. */
export function rawTransactionsFromCopro(
  items: CoproParsedTransaction[],
): RawChargeTransaction[] {
  return items.map((item) => ({
    category: item.category,
    label: item.label,
    amount: item.amount,
    deductible: item.deductible,
    amortizable: item.amortizable,
    sourceDocument: item.sourceDocument,
  }));
}
