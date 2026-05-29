import type { ConfidenceScore } from "./confidence-score";
import type { DocumentTunnel } from "./document-tunnel";
import type { DocumentType } from "./document-type";

export type ClassificationCandidate = {
  documentType: DocumentType;
  score: ConfidenceScore;
  /** Pattern or model identifier that produced this candidate */
  source: string;
  matchedSignals: string[];
};

/**
 * Outcome of the classification stage — explainable and auditable.
 */
export type ClassificationResult = {
  documentType: DocumentType;
  confidence: ConfidenceScore;
  candidates: ClassificationCandidate[];
  tunnel: DocumentTunnel | null;
  needsReview: boolean;
  /** Short keyword reasons for UI and learning cases */
  explainability: string[];
  schemaVersion: string;
};
