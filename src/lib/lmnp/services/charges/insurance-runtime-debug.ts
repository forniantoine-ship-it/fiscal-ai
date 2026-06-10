/**
 * Temporary runtime checkpoints for insurance charge extraction tracing.
 * Remove once the 6000 € regression root cause is confirmed fixed.
 */

export type InsuranceRuntimeStage =
  | "insurance_document_classification"
  | "parseInsuranceDocument_entry"
  | "extractAmountTTC_candidates"
  | "extractAmountTTC_result"
  | "selectBestInsuranceCandidate_invocation"
  | "rankInsuranceAmountCandidates_invocation"
  | "parseDocumentToRawTransactions"
  | "fallback_ocr_amount"
  | "buildChargesExtraction_insurance_lines"
  | "chargesFromDraft_insurance_lines"
  | "ui_formatCurrency_insurance";

export function logInsuranceRuntime(
  _stage: InsuranceRuntimeStage,
  _payload: Record<string, unknown>,
): void {}
