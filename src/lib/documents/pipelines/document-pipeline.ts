import type { DocumentPipelineContext } from "../types/pipeline-context";
import type { DocumentTunnel } from "../types/document-tunnel";
import {
  runClassificationStage,
  runExtractionStage,
  runLearningStage,
  runOcrStage,
  runUploadStage,
  runValidationStage,
  type OcrStageInput,
  type UploadStageInput,
} from "./pipeline-stages";

export type DocumentPipelineInput = UploadStageInput & {
  ocr: OcrStageInput;
  /** Skip learning case capture (e.g. batch replays) */
  skipLearning?: boolean;
};

export type DocumentPipelineResult = DocumentPipelineContext;

function createPipelineContext(tunnel: DocumentTunnel): DocumentPipelineContext {
  return {
    runId: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    documentId: "",
    tunnel,
    fileName: "",
    mimeType: "",
    ocr: null,
    classification: null,
    extraction: null,
    validation: null,
    learningCase: null,
    stageLog: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

/**
 * Orchestrates: upload → OCR → classification → extraction → validation → learning
 */
export async function runDocumentPipeline(
  input: DocumentPipelineInput,
): Promise<DocumentPipelineResult> {
  const ctx = createPipelineContext(input.tunnel);

  console.log("[pipeline] start", {
    runId: ctx.runId,
    documentId: input.documentId,
    fileName: input.fileName,
    tunnel: input.tunnel,
  });

  runUploadStage(ctx, input);
  runOcrStage(ctx, input.ocr);
  await runClassificationStage(ctx);
  await runExtractionStage(ctx);
  runValidationStage(ctx);

  if (!input.skipLearning) {
    runLearningStage(ctx);
  }

  ctx.completedAt = new Date().toISOString();

  console.log("[pipeline] complete", {
    runId: ctx.runId,
    documentType: ctx.classification?.documentType,
    learningCaseId: ctx.learningCase?.id ?? null,
    stages: ctx.stageLog.map((s) => `${s.stage}:${s.status}`),
  });

  return ctx;
}
