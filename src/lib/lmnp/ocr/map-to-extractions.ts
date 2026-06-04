import {
  detectDocumentInconsistencies,
  getPrimaryAmountField,
  inconsistencyAffectsTrust,
  resolveDocumentType,
} from "./coherence";
import type { DocumentCategory, DocumentType, Extraction } from "../types";
import type { FieldKey } from "../types/field-keys";
import { moneyFromEuros, textValue } from "../types/values";
import type { DocumentInconsistency } from "./coherence";
import type { OcrDocumentResult, OcrFieldKey, OcrFieldRegion } from "./schema";
import { sanitizeOcrResult, type SanitizedOcrResult } from "./validate";

const DOCUMENT_TYPE_TO_CATEGORY: Record<DocumentType, DocumentCategory> = {
  lease_contract: "bail",
  rent_receipt: "bail",
  rent_bank_statement: "revenus",
  bank_statement: "revenus",
  property_tax: "charges",
  insurance_invoice: "charges",
  condo_charges: "charges",
  works_invoice: "charges",
  furniture_invoice: "amortissement",
  loan_interest_certificate: "emprunt",
  loan_schedule: "emprunt",
  notary_deed: "amortissement",
  unknown: "autre",
};

const AMOUNT_FIELD_BY_DOCUMENT_TYPE: Partial<Record<DocumentType, FieldKey>> = {
  lease_contract: "income.annualRent",
  rent_receipt: "income.annualRent",
  rent_bank_statement: "income.annualRent",
  bank_statement: "income.annualRent",
  property_tax: "expense.propertyTax",
  insurance_invoice: "expense.insurance",
  condo_charges: "expense.condo",
  works_invoice: "expense.worksDeductible",
  furniture_invoice: "amort.furnitureAnnual",
  loan_interest_certificate: "loan.annualInterest",
  loan_schedule: "loan.annualInterest",
  notary_deed: "amort.buildingAnnual",
};

export interface DocumentOcrMeta {
  documentTypeConfidence: number;
  amountPeriod: SanitizedOcrResult["amountPeriod"];
  amountKind: SanitizedOcrResult["amountKind"];
  warnings: string[];
  inconsistencies: DocumentInconsistency[];
  fieldsDetected: number;
  fieldsRejected: number;
  trustedForAutoSync: boolean;
  usedHeuristicFallback: boolean;
}

export interface DocumentAnalysisResult {
  documentType: DocumentType;
  category: DocumentCategory;
  extractions: Omit<Extraction, "validationItemId">[];
  ocr?: OcrDocumentResult;
  ocrMeta?: DocumentOcrMeta;
  /** Embedded PDF + OCR field text for deterministic charge parsers. */
  chargeParserCorpus?: string;
}

function clampConfidence(n: number): number {
  return Math.min(99, Math.max(0, Math.round(n)));
}

function makeExtraction(
  doc: { id: string; fiscalYearId: string },
  fieldKey: FieldKey,
  rawValue: string,
  normalizedValue: Extraction["normalizedValue"],
  confidence: number,
  options?: {
    displayLabel?: string;
    ocrFieldKey?: OcrFieldKey;
    region?: OcrFieldRegion;
    warnings?: string[];
  },
): Omit<Extraction, "validationItemId"> {
  return {
    id: crypto.randomUUID(),
    documentId: doc.id,
    fiscalYearId: doc.fiscalYearId,
    fieldKey,
    rawValue,
    normalizedValue,
    confidence: clampConfidence(confidence),
    status: "pending_validation",
    displayLabel: options?.displayLabel,
    ocrFieldKey: options?.ocrFieldKey,
    region: options?.region,
    warnings: options?.warnings,
  };
}

export function categoryFromDocumentType(documentType: DocumentType): DocumentCategory {
  return DOCUMENT_TYPE_TO_CATEGORY[documentType] ?? "autre";
}

function applyAnnualConversion(
  euros: number,
  confidence: number,
  documentType: DocumentType,
  amountPeriod: SanitizedOcrResult["amountPeriod"],
): { euros: number; confidence: number; warnings: string[] } {
  const rentTypes: DocumentType[] = [
    "lease_contract",
    "rent_receipt",
    "rent_bank_statement",
  ];

  if (amountPeriod !== "monthly" || !rentTypes.includes(documentType)) {
    return { euros, confidence, warnings: [] };
  }

  return {
    euros: euros * 12,
    confidence: Math.max(0, confidence - 18),
    warnings: ["Montant mensuel converti en loyer annuel (×12) — à vérifier impérativement."],
  };
}

export function buildAnalysisResult(params: {
  doc: { id: string; fiscalYearId: string; fileName: string; category: DocumentCategory };
  ocr: OcrDocumentResult;
  userCategory: DocumentCategory;
  suggestedType?: DocumentType;
  fiscalYear?: number;
}): DocumentAnalysisResult {
  const { doc, ocr, userCategory, suggestedType, fiscalYear } = params;

  const resolvedType = resolveDocumentType({
    ocrType: ocr.documentType,
    ocrConfidence: ocr.documentTypeConfidence ?? 50,
    userCategory,
    suggestedType: suggestedType ?? "unknown",
  });

  const targetField = getPrimaryAmountField(resolvedType);
  const sanitized = sanitizeOcrResult(
    { ...ocr, documentType: resolvedType },
    { targetAmountFieldKey: targetField, fiscalYear },
  );

  const inconsistencies = detectDocumentInconsistencies({
    userCategory,
    sanitized,
    suggestedType,
  });

  const trustPenalty = inconsistencyAffectsTrust(inconsistencies);
  const trustedForAutoSync = sanitized.trustedForAutoSync && !trustPenalty;

  const extractions = sanitizedToExtractions(
    doc,
    resolvedType,
    sanitized,
    inconsistencies,
  );

  const fieldsDetected = countDetectedFields(sanitized);
  const fieldsRejected =
    fieldsDetected -
    extractions.length +
    (sanitized.totalAmount?.rejected ? 1 : 0);

  const warnings = [
    ...sanitized.globalWarnings,
    ...inconsistencies.filter((i) => i.severity === "warning").map((i) => i.message),
  ];

  return {
    documentType: resolvedType,
    category:
      resolvedType === "unknown" ? userCategory : categoryFromDocumentType(resolvedType),
    extractions,
    ocr,
    ocrMeta: {
      documentTypeConfidence: sanitized.documentTypeConfidence,
      amountPeriod: sanitized.amountPeriod,
      amountKind: sanitized.amountKind,
      warnings,
      inconsistencies,
      fieldsDetected,
      fieldsRejected: Math.max(0, fieldsRejected),
      trustedForAutoSync,
      usedHeuristicFallback: false,
    },
  };
}

function countDetectedFields(sanitized: SanitizedOcrResult): number {
  let count = 0;
  if (sanitized.totalAmount) count++;
  if (sanitized.vatAmount) count++;
  if (sanitized.supplierName) count++;
  if (sanitized.invoiceDate) count++;
  if (sanitized.address) count++;
  return count;
}

function sanitizedToExtractions(
  doc: { id: string; fiscalYearId: string },
  documentType: DocumentType,
  sanitized: SanitizedOcrResult,
  inconsistencies: DocumentInconsistency[],
): Omit<Extraction, "validationItemId">[] {
  const extractions: Omit<Extraction, "validationItemId">[] = [];
  const amountField = AMOUNT_FIELD_BY_DOCUMENT_TYPE[documentType];
  const inconsistencyWarnings = inconsistencies.map((i) => i.message);

  if (sanitized.totalAmount && !sanitized.totalAmount.rejected && amountField) {
    const converted = applyAnnualConversion(
      sanitized.totalAmount.value,
      sanitized.totalAmount.confidence,
      documentType,
      sanitized.amountPeriod,
    );

    const allWarnings = [
      ...sanitized.totalAmount.warnings,
      ...converted.warnings,
      ...inconsistencyWarnings,
    ];

    extractions.push(
      makeExtraction(
        doc,
        amountField,
        `${converted.euros.toFixed(2)} EUR${sanitized.amountPeriod === "monthly" ? " (×12)" : ""}`,
        moneyFromEuros(converted.euros),
        converted.confidence,
        {
          ocrFieldKey: "totalAmount",
          region: sanitized.totalAmount.region,
          warnings: allWarnings.length > 0 ? allWarnings : undefined,
        },
      ),
    );
  }

  if (
    sanitized.vatAmount &&
    !sanitized.vatAmount.rejected &&
    sanitized.vatAmount.value > 0
  ) {
    extractions.push(
      makeExtraction(
        doc,
        "expense.other",
        `TVA ${sanitized.vatAmount.value.toFixed(2)} EUR`,
        moneyFromEuros(sanitized.vatAmount.value),
        sanitized.vatAmount.confidence,
        {
          displayLabel: "TVA",
          ocrFieldKey: "vatAmount",
          region: sanitized.vatAmount.region,
          warnings: sanitized.vatAmount.warnings,
        },
      ),
    );
  }

  if (sanitized.supplierName && !sanitized.supplierName.rejected) {
    extractions.push(
      makeExtraction(
        doc,
        "property.label",
        sanitized.supplierName.value,
        textValue(sanitized.supplierName.value),
        sanitized.supplierName.confidence,
        {
          displayLabel: "Émetteur / fournisseur",
          ocrFieldKey: "supplierName",
          region: sanitized.supplierName.region,
          warnings: sanitized.supplierName.warnings,
        },
      ),
    );
  }

  if (sanitized.address && !sanitized.address.rejected) {
    extractions.push(
      makeExtraction(
        doc,
        "property.address",
        sanitized.address.value,
        textValue(sanitized.address.value),
        sanitized.address.confidence,
        {
          displayLabel: "Adresse du bien",
          ocrFieldKey: "address",
          region: sanitized.address.region,
          warnings: sanitized.address.warnings,
        },
      ),
    );
  }

  if (sanitized.invoiceDate && !sanitized.invoiceDate.rejected) {
    extractions.push(
      makeExtraction(
        doc,
        "expense.other",
        sanitized.invoiceDate.value,
        { type: "date", date: sanitized.invoiceDate.value },
        sanitized.invoiceDate.confidence,
        {
          displayLabel: "Date du document",
          ocrFieldKey: "invoiceDate",
          region: sanitized.invoiceDate.region,
          warnings: sanitized.invoiceDate.warnings,
        },
      ),
    );
  }

  return extractions;
}

export function buildEmptyAnalysisResult(params: {
  documentType: DocumentType;
  warnings: string[];
  inconsistencies?: DocumentInconsistency[];
  usedHeuristicFallback?: boolean;
}): DocumentAnalysisResult {
  const { documentType, warnings, inconsistencies = [], usedHeuristicFallback = false } =
    params;

  return {
    documentType,
    category: categoryFromDocumentType(documentType),
    extractions: [],
    ocrMeta: {
      documentTypeConfidence: 0,
      amountPeriod: "unknown",
      amountKind: "unknown",
      warnings,
      inconsistencies,
      fieldsDetected: 0,
      fieldsRejected: 0,
      trustedForAutoSync: false,
      usedHeuristicFallback: usedHeuristicFallback ?? false,
    },
  };
}

/** @deprecated Use buildAnalysisResult — kept for heuristic fallback path. */
export function ocrResultToExtractions(
  doc: { id: string; fiscalYearId: string },
  ocr: OcrDocumentResult,
): Omit<Extraction, "validationItemId">[] {
  const result = buildAnalysisResult({
    doc: { ...doc, fileName: "", category: "autre" },
    ocr,
    userCategory: "autre",
  });
  return result.extractions;
}
