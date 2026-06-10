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
  _stage: TaxeFonciereRuntimeStage,
  _payload: Record<string, unknown>,
): void {}
