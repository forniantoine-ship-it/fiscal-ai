import type { ExtractionResult } from "../types/extraction-result";
import type { ValidationStageResult } from "../types/pipeline-context";
import type { DocumentType } from "../types/document-type";
import { runFieldValidators } from "./field-validators";
import type { DocumentValidationRule, FieldValidator } from "./validator.types";

const VALIDATION_RULES: Partial<Record<DocumentType, FieldValidator[]>> = {
  inpi: [],
  p0i: [],
  offre_pret: [],
  facture_travaux: [],
  facture_mobilier: [],
};

export function registerValidationRules(rules: DocumentValidationRule[]): void {
  for (const rule of rules) {
    VALIDATION_RULES[rule.documentType] = rule.validators;
  }
}

/**
 * Validates extracted fields against per-document-type rules.
 */
export function validateExtraction(extraction: ExtractionResult): ValidationStageResult {
  console.log("[runtime] validateExtraction read-only", {
    documentType: extraction.documentType,
    extractorId: extraction.extractorId,
    inputFieldCount: extraction.fields.length,
    inputFieldKeys: extraction.fields.map((f) => f.key),
    note: "validateExtraction returns a new result; extraction object is not mutated",
  });

  const validators = VALIDATION_RULES[extraction.documentType] ?? [];
  const fieldErrors = runFieldValidators(extraction.fields, validators).map((issue) => ({
    fieldKey: issue.fieldKey,
    message: issue.message,
    code: issue.code,
  }));

  const warnings: string[] = [];
  if (extraction.needsReview) {
    warnings.push("extraction_flagged_for_review");
  }

  return {
    valid: fieldErrors.length === 0,
    fieldErrors,
    warnings,
  };
}
