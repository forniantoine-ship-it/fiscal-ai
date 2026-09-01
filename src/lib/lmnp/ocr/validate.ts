import type { DocumentType } from "../types";
import type { FieldKey } from "../types/field-keys";
import type {
  OcrAmountKind,
  OcrAmountPeriod,
  OcrDocumentResult,
  OcrFieldKey,
  OcrFieldRegion,
} from "./schema";

export const MIN_EXTRACTION_CONFIDENCE = 70;
export const MIN_AUTO_SYNC_CONFIDENCE = 95;
export const MIN_DOCUMENT_TYPE_CONFIDENCE = 65;

/** Plausible annual EUR ranges per fiscal field. */
const AMOUNT_RANGES: Partial<Record<FieldKey, { min: number; max: number }>> = {
  "income.annualRent": { min: 600, max: 360_000 },
  "expense.propertyTax": { min: 50, max: 25_000 },
  "expense.insurance": { min: 30, max: 8_000 },
  "expense.condo": { min: 50, max: 40_000 },
  "expense.worksDeductible": { min: 20, max: 200_000 },
  "expense.other": { min: 1, max: 50_000 },
  "loan.annualInterest": { min: 50, max: 80_000 },
  "amort.furnitureAnnual": { min: 50, max: 100_000 },
  "amort.buildingAnnual": { min: 500, max: 500_000 },
};

const NO_VAT_TYPES: DocumentType[] = [
  "lease_contract",
  "rent_receipt",
  "rent_bank_statement",
  "bank_statement",
  "property_tax",
  "loan_interest_certificate",
  "loan_schedule",
];

export interface ValidatedOcrField<T> {
  value: T;
  confidence: number;
  region?: OcrFieldRegion;
  warnings: string[];
  rejected: boolean;
  rejectReason?: string;
}

export interface SanitizedOcrResult {
  raw: OcrDocumentResult;
  documentType: DocumentType;
  documentTypeConfidence: number;
  amountPeriod: OcrAmountPeriod;
  amountKind: OcrAmountKind;
  totalAmount: ValidatedOcrField<number> | null;
  vatAmount: ValidatedOcrField<number> | null;
  supplierName: ValidatedOcrField<string> | null;
  invoiceDate: ValidatedOcrField<string> | null;
  address: ValidatedOcrField<string> | null;
  globalWarnings: string[];
  trustedForAutoSync: boolean;
}

function clampConfidence(n: number): number {
  return Math.min(99, Math.max(0, Math.round(n)));
}

function isSuspiciousRoundAmount(euros: number): boolean {
  return euros >= 1000 && euros % 100 === 0 && euros % 1000 === 0;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function validateRegion(region: unknown): OcrFieldRegion | undefined {
  if (!region || typeof region !== "object") return undefined;
  const r = region as Record<string, unknown>;
  const x = Number(r.x);
  const y = Number(r.y);
  const width = Number(r.width);
  const height = Number(r.height);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return undefined;
  if (x < 0 || y < 0 || width <= 0 || height <= 0) return undefined;
  if (x + width > 105 || y + height > 105) return undefined;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function validateMoneyField(
  euros: number | undefined,
  confidence: number | undefined,
  region: unknown,
  fieldKey: OcrFieldKey,
  documentType: DocumentType,
  targetFieldKey: FieldKey | null,
  amountPeriod: OcrAmountPeriod,
): ValidatedOcrField<number> | null {
  if (euros === undefined || euros === null || !Number.isFinite(euros)) return null;

  const warnings: string[] = [];
  let conf = clampConfidence(confidence ?? 0);
  let rejected = false;
  let rejectReason: string | undefined;

  if (euros <= 0) {
    return {
      value: euros,
      confidence: 0,
      warnings: [],
      rejected: true,
      rejectReason: "Montant nul ou négatif — ignoré.",
    };
  }

  if (euros > 10_000_000) {
    rejected = true;
    rejectReason = "Montant aberrant (> 10 M€) — probable erreur de lecture.";
  }

  if (targetFieldKey) {
    const range = AMOUNT_RANGES[targetFieldKey];
    if (range && (euros < range.min || euros > range.max)) {
      conf = Math.max(0, conf - 35);
      warnings.push(
        `Montant hors plage habituelle pour ${targetFieldKey} (${range.min}–${range.max} €).`,
      );
      if (conf < MIN_EXTRACTION_CONFIDENCE) {
        rejected = true;
        rejectReason = "Montant improbable pour ce type de document.";
      }
    }
  }

  if (isSuspiciousRoundAmount(euros)) {
    conf = Math.max(0, conf - 10);
    warnings.push("Montant très rond — vérifiez qu'il s'agit bien du bon total.");
  }

  if (fieldKey === "totalAmount" && amountPeriod === "monthly") {
    conf = Math.max(0, conf - 8);
    warnings.push("Montant identifié comme mensuel — conversion annuelle nécessaire pour les loyers.");
  }

  if (NO_VAT_TYPES.includes(documentType) && fieldKey === "vatAmount") {
    rejected = true;
    rejectReason = "TVA non applicable sur ce type de document.";
  }

  if (conf < MIN_EXTRACTION_CONFIDENCE && !rejected) {
    rejected = true;
    rejectReason = `Confiance insuffisante (${conf} % < ${MIN_EXTRACTION_CONFIDENCE} %).`;
  }

  return {
    value: euros,
    confidence: conf,
    region: validateRegion(region),
    warnings,
    rejected,
    rejectReason,
  };
}

function validateTextField(
  text: string | undefined,
  confidence: number | undefined,
  region: unknown,
  minLength: number,
  fieldLabel: string,
): ValidatedOcrField<string> | null {
  const trimmed = text?.trim();
  if (!trimmed || trimmed.length < minLength) return null;

  let conf = clampConfidence(confidence ?? 0);
  const warnings: string[] = [];
  let rejected = false;
  let rejectReason: string | undefined;

  if (/^\d+$/.test(trimmed) && trimmed.length <= 6) {
    conf = Math.max(0, conf - 40);
    warnings.push(`${fieldLabel} ressemble à un numéro, pas à un texte attendu.`);
  }

  if (conf < MIN_EXTRACTION_CONFIDENCE) {
    rejected = true;
    rejectReason = `Confiance insuffisante (${conf} %).`;
  }

  return {
    value: trimmed,
    confidence: conf,
    region: validateRegion(region),
    warnings,
    rejected,
    rejectReason,
  };
}

function validateDateField(
  value: string | undefined,
  confidence: number | undefined,
  region: unknown,
  fiscalYear?: number,
): ValidatedOcrField<string> | null {
  if (!value?.trim()) return null;

  const warnings: string[] = [];
  let conf = clampConfidence(confidence ?? 0);
  let rejected = false;
  let rejectReason: string | undefined;

  if (!isValidIsoDate(value)) {
    return {
      value,
      confidence: 0,
      warnings: ["Format de date invalide."],
      rejected: true,
      rejectReason: "Date illisible ou format incorrect.",
    };
  }

  if (fiscalYear) {
    const year = Number.parseInt(value.slice(0, 4), 10);
    if (year < fiscalYear - 2 || year > fiscalYear + 1) {
      conf = Math.max(0, conf - 20);
      warnings.push(`Date (${year}) peu cohérente avec l'exercice ${fiscalYear}.`);
    }
  }

  if (conf < MIN_EXTRACTION_CONFIDENCE) {
    rejected = true;
    rejectReason = `Confiance insuffisante (${conf} %).`;
  }

  return {
    value,
    confidence: conf,
    region: validateRegion(region),
    warnings,
    rejected,
    rejectReason,
  };
}

export function sanitizeOcrResult(
  raw: OcrDocumentResult,
  options: {
    targetAmountFieldKey: FieldKey | null;
    fiscalYear?: number;
  },
): SanitizedOcrResult {
  const globalWarnings: string[] = [];
  const documentTypeConfidence = clampConfidence(raw.documentTypeConfidence ?? 50);

  if (documentTypeConfidence < MIN_DOCUMENT_TYPE_CONFIDENCE) {
    globalWarnings.push(
      `Type de document incertain (${documentTypeConfidence} %) — vérifiez la classification.`,
    );
  }

  const totalAmount = validateMoneyField(
    raw.totalAmount?.euros,
    raw.totalAmount?.confidence,
    raw.totalAmount?.region,
    "totalAmount",
    raw.documentType,
    options.targetAmountFieldKey,
    raw.amountPeriod ?? "unknown",
  );

  const vatAmount = validateMoneyField(
    raw.vatAmount?.euros,
    raw.vatAmount?.confidence,
    raw.vatAmount?.region,
    "vatAmount",
    raw.documentType,
    "expense.other",
    "one_time",
  );

  if (
    totalAmount &&
    vatAmount &&
    !totalAmount.rejected &&
    !vatAmount.rejected &&
    vatAmount.value >= totalAmount.value
  ) {
    vatAmount.rejected = true;
    vatAmount.rejectReason = "TVA supérieure ou égale au montant total.";
    globalWarnings.push("Incohérence TVA / montant total détectée.");
  }

  if (NO_VAT_TYPES.includes(raw.documentType) && raw.vatAmount?.euros) {
    globalWarnings.push("TVA détectée sur un document sans TVA habituelle — ignorée.");
  }

  const supplierName = validateTextField(
    raw.supplierName?.text,
    raw.supplierName?.confidence,
    raw.supplierName?.region,
    2,
    "Fournisseur",
  );

  const invoiceDate = validateDateField(
    raw.invoiceDate?.value,
    raw.invoiceDate?.confidence,
    raw.invoiceDate?.region,
    options.fiscalYear,
  );

  const address = validateTextField(
    raw.address?.text,
    raw.address?.confidence,
    raw.address?.region,
    8,
    "Adresse",
  );

  if (address && address.value.length < 12) {
    address.confidence = Math.max(0, address.confidence - 15);
    address.warnings.push("Adresse courte — vérifiez qu'elle est complète.");
    if (address.confidence < MIN_EXTRACTION_CONFIDENCE) {
      address.rejected = true;
      address.rejectReason = "Adresse trop courte ou incomplète.";
    }
  }

  const hasTrustedAmount =
    totalAmount !== null && !totalAmount.rejected && totalAmount.confidence >= MIN_AUTO_SYNC_CONFIDENCE;

  const trustedForAutoSync =
    documentTypeConfidence >= MIN_DOCUMENT_TYPE_CONFIDENCE &&
    hasTrustedAmount &&
    globalWarnings.length === 0 &&
    (totalAmount?.warnings.length ?? 0) === 0;

  return {
    raw,
    documentType: raw.documentType,
    documentTypeConfidence,
    amountPeriod: raw.amountPeriod ?? "unknown",
    amountKind: raw.amountKind ?? "unknown",
    totalAmount,
    vatAmount: NO_VAT_TYPES.includes(raw.documentType) ? null : vatAmount,
    supplierName,
    invoiceDate,
    address,
    globalWarnings,
    trustedForAutoSync,
  };
}
