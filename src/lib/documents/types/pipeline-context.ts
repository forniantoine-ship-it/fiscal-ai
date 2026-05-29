import type { ClassificationResult } from "./classification-result";
import type { DocumentTunnel } from "./document-tunnel";
import type { ExtractionResult } from "./extraction-result";
import type { LearningCase } from "./learning-case";

export type OcrStageResult = {
  rawText: string;
  pageCount: number;
  provider: string;
  durationMs: number;
};

export type ValidationStageResult = {
  valid: boolean;
  fieldErrors: Array<{ fieldKey: string; message: string; code: string }>;
  warnings: string[];
};

/**
 * Mutable context passed through pipeline stages for debugging and replay.
 */
export type DocumentPipelineContext = {
  runId: string;
  documentId: string;
  tunnel: DocumentTunnel;
  fileName: string;
  mimeType: string;
  ocr: OcrStageResult | null;
  classification: ClassificationResult | null;
  extraction: ExtractionResult | null;
  validation: ValidationStageResult | null;
  learningCase: LearningCase | null;
  stageLog: PipelineStageLogEntry[];
  startedAt: string;
  completedAt: string | null;
};

export type PipelineStageId =
  | "upload"
  | "ocr"
  | "classification"
  | "extraction"
  | "validation"
  | "learning";

export type PipelineStageLogEntry = {
  stage: PipelineStageId;
  status: "pending" | "running" | "completed" | "skipped" | "failed";
  startedAt: string;
  endedAt: string | null;
  message?: string;
  error?: string;
};
