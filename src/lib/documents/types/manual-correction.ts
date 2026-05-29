import type { DocumentType } from "./document-type";

/**
 * Human correction applied after AI extraction or classification.
 * Feeds the learning loop without mutating historical pipeline runs.
 */
export type ManualCorrection = {
  id: string;
  documentId: string;
  fieldKey: string;
  previousValue: unknown;
  correctedValue: unknown;
  documentType: DocumentType;
  correctedAt: string;
  correctedBy: string | null;
  reason?: string;
};
