/**
 * Runtime checkpoints for taxe foncière charge extraction tracing.
 */

export type TaxeFonciereRuntimeStage =
  | "taxe_fonciere_document_classification"
  | "parseTaxeFonciereDocument_entry"
  | "extractPayableAmount_candidates"
  | "extractPayableAmount_result"
  | "rankTaxeFonciereAmountCandidates_invocation"
  | "parseDocumentToRawTransactions"
  | "fallback_ocr_amount"
  | "buildChargesExtraction_taxe_fonciere_lines";

export function logTaxeFonciereRuntime(
  stage: TaxeFonciereRuntimeStage,
  payload: Record<string, unknown>,
): void {
  console.log("[taxe-fonciere-runtime-debug]", { stage, ...payload });
}
