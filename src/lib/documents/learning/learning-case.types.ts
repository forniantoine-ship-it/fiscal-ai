import type { ClassificationResult } from "../types/classification-result";
import type { DocumentTunnel } from "../types/document-tunnel";
import type { ExtractionResult } from "../types/extraction-result";
import type { LearningCase } from "../types/learning-case";
import type { ManualCorrection } from "../types/manual-correction";

export type CreateLearningCaseInput = {
  documentId: string;
  tunnel: DocumentTunnel;
  classification: ClassificationResult;
  extraction: ExtractionResult | null;
  corrections?: ManualCorrection[];
  ocrText: string;
  notes?: string;
};

export type LearningCaseStore = {
  save(learningCase: LearningCase): Promise<LearningCase>;
  getById(id: string): Promise<LearningCase | null>;
};

/** In-memory stub until Supabase / vector store is wired */
export type InMemoryLearningCaseStore = LearningCaseStore & {
  list(): LearningCase[];
};
