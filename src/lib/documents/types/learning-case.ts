import type { ClassificationResult } from "./classification-result";
import type { DocumentTunnel } from "./document-tunnel";
import type { DocumentType } from "./document-type";
import type { ExtractionResult } from "./extraction-result";
import type { ManualCorrection } from "./manual-correction";

export type LearningCaseStatus = "open" | "reviewed" | "promoted" | "archived";

/**
 * Persisted snapshot for improving patterns, extractors, and models.
 */
export type LearningCase = {
  id: string;
  documentId: string;
  tunnel: DocumentTunnel;
  documentType: DocumentType;
  classification: ClassificationResult;
  extraction: ExtractionResult | null;
  corrections: ManualCorrection[];
  ocrTextHash: string;
  status: LearningCaseStatus;
  createdAt: string;
  notes?: string;
};
