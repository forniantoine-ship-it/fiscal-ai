import type { ClassificationResult } from "../types/classification-result";
import type { DocumentType } from "../types/document-type";
import { isPipelineDocumentType } from "../types/document-type";

/**
 * Ensures classification payloads are safe for downstream consumers.
 */
export function normalizeClassificationResult(
  partial: Partial<ClassificationResult> & Pick<ClassificationResult, "confidence">,
): ClassificationResult {
  const documentType: DocumentType = isPipelineDocumentType(partial.documentType)
    ? partial.documentType
    : "unknown";

  return {
    documentType,
    confidence: partial.confidence,
    candidates: partial.candidates ?? [],
    tunnel: partial.tunnel ?? null,
    needsReview: partial.needsReview ?? documentType === "unknown",
    explainability: (partial.explainability ?? []).filter((s) => s.trim().length > 0).slice(0, 12),
    schemaVersion: partial.schemaVersion ?? "documents.classification.v1",
  };
}
