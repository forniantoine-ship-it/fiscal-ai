import { classifyDocument } from "../classification";
import { defaultExtractorRegistry } from "../extractors";
import { createLearningCase } from "../learning/create-learning-case";
import { normalizeOcrText, logOcrNormalizationStructure, truncateOcrText } from "../normalizers";
import {
  logExtractorResolution,
  logLearningStageReadOnly,
  logOcrStageOutput,
  logValidationStageReadOnly,
  RUNTIME_OCR_PREVIEW_LENGTH,
  snapshotExtractionFields,
} from "./activite-runtime-trace";
import type {
  DocumentPipelineContext,
  OcrStageResult,
  PipelineStageLogEntry,
} from "../types/pipeline-context";
import { validateExtraction } from "../validators";

export type UploadStageInput = {
  documentId: string;
  fileName: string;
  mimeType: string;
  tunnel: DocumentPipelineContext["tunnel"];
};

export type OcrStageInput = {
  rawText: string;
  pageCount?: number;
  provider?: string;
};

export function appendStageLog(
  ctx: DocumentPipelineContext,
  entry: Omit<PipelineStageLogEntry, "startedAt" | "endedAt"> & {
    startedAt?: string;
    endedAt?: string | null;
  },
): void {
  ctx.stageLog.push({
    startedAt: entry.startedAt ?? new Date().toISOString(),
    stage: entry.stage,
    status: entry.status,
    endedAt: entry.endedAt ?? null,
    message: entry.message,
    error: entry.error,
  });
}

export function runUploadStage(
  ctx: DocumentPipelineContext,
  input: UploadStageInput,
): void {
  console.log("[pipeline] upload start", {
    runId: ctx.runId,
    documentId: input.documentId,
    fileName: input.fileName,
    tunnel: input.tunnel,
  });

  ctx.documentId = input.documentId;
  ctx.fileName = input.fileName;
  ctx.mimeType = input.mimeType;
  ctx.tunnel = input.tunnel;
  appendStageLog(ctx, { stage: "upload", status: "completed", endedAt: new Date().toISOString() });

  console.log("[pipeline] upload complete", { runId: ctx.runId, documentId: ctx.documentId });
}

export function runOcrStage(ctx: DocumentPipelineContext, input: OcrStageInput): OcrStageResult {
  const started = Date.now();
  console.log("[pipeline] ocr start", { runId: ctx.runId, textLength: input.rawText.length });
  appendStageLog(ctx, { stage: "ocr", status: "running" });

  const truncated = truncateOcrText(input.rawText);
  const normalized = normalizeOcrText(truncated);

  logOcrNormalizationStructure({
    runId: ctx.runId,
    before: truncated,
    after: normalized,
  });

  const result: OcrStageResult = {
    rawText: normalized,
    pageCount: input.pageCount ?? 1,
    provider: input.provider ?? "stub",
    durationMs: Date.now() - started,
  };

  ctx.ocr = result;
  appendStageLog(ctx, {
    stage: "ocr",
    status: "completed",
    endedAt: new Date().toISOString(),
    message: `chars:${normalized.length}`,
  });

  logOcrStageOutput({
    runId: ctx.runId,
    rawInputLength: input.rawText.length,
    normalizedLength: normalized.length,
    normalizer: "documents/normalizers/normalize-ocr-text.ts",
    preview: normalized.slice(0, RUNTIME_OCR_PREVIEW_LENGTH),
  });

  console.log("[pipeline] ocr complete", {
    runId: ctx.runId,
    chars: normalized.length,
    durationMs: result.durationMs,
  });

  return result;
}

export async function runClassificationStage(ctx: DocumentPipelineContext): Promise<void> {
  if (!ctx.ocr) throw new Error("OCR stage required before classification");

  appendStageLog(ctx, { stage: "classification", status: "running" });

  ctx.classification = classifyDocument({
    normalizedText: ctx.ocr.rawText,
    fileName: ctx.fileName,
    tunnel: ctx.tunnel,
  });

  console.log("[classification] complete", {
    runId: ctx.runId,
    documentType: ctx.classification.documentType,
    confidence: ctx.classification.confidence.value,
    band: ctx.classification.confidence.band,
    needsReview: ctx.classification.needsReview,
  });

  appendStageLog(ctx, {
    stage: "classification",
    status: "completed",
    endedAt: new Date().toISOString(),
    message: `type:${ctx.classification.documentType}`,
  });
}

export async function runExtractionStage(ctx: DocumentPipelineContext): Promise<void> {
  if (!ctx.ocr || !ctx.classification) {
    throw new Error("OCR and classification required before extraction");
  }

  appendStageLog(ctx, { stage: "extraction", status: "running" });

  const registryEntries = defaultExtractorRegistry.list().map((entry) => ({
    id: entry.id,
    version: entry.version,
    documentType: entry.documentType,
  }));

  const extractor = defaultExtractorRegistry.get(ctx.classification.documentType);

  logExtractorResolution({
    runId: ctx.runId,
    documentType: ctx.classification.documentType,
    extractor,
    registryEntries,
  });

  if (!extractor) {
    appendStageLog(ctx, {
      stage: "extraction",
      status: "skipped",
      endedAt: new Date().toISOString(),
      message: `no_extractor:${ctx.classification.documentType}`,
    });
    return;
  }

  ctx.extraction = await extractor.extract({
    documentId: ctx.documentId,
    rawText: ctx.ocr.rawText,
    fileName: ctx.fileName,
    classification: ctx.classification,
  });

  console.log("[extraction] stage complete", {
    runId: ctx.runId,
    extractorId: ctx.extraction.extractorId,
    extractorVersion: extractor.version,
    confidence: ctx.extraction.confidence.value,
    needsReview: ctx.extraction.needsReview,
    fieldCount: ctx.extraction.fields.length,
    fieldKeys: ctx.extraction.fields.map((f) => f.key),
  });

  appendStageLog(ctx, {
    stage: "extraction",
    status: "completed",
    endedAt: new Date().toISOString(),
    message: `extractor:${ctx.extraction.extractorId}`,
  });
}

export function runValidationStage(ctx: DocumentPipelineContext): void {
  if (!ctx.extraction) {
    appendStageLog(ctx, {
      stage: "validation",
      status: "skipped",
      endedAt: new Date().toISOString(),
      message: "no_extraction",
    });
    return;
  }

  appendStageLog(ctx, { stage: "validation", status: "running" });
  const fieldKeysBefore = ctx.extraction.fields.map((f) => f.key);
  ctx.validation = validateExtraction(ctx.extraction);
  const fieldKeysAfter = ctx.extraction.fields.map((f) => f.key);

  logValidationStageReadOnly({
    runId: ctx.runId,
    fieldKeysBefore,
    fieldKeysAfter,
    valid: ctx.validation.valid,
    fieldErrors: ctx.validation.fieldErrors.map((e) => ({
      fieldKey: e.fieldKey,
      code: e.code,
    })),
    mutatesExtraction: false,
  });

  console.log("[validation] complete", {
    runId: ctx.runId,
    valid: ctx.validation.valid,
    errorCount: ctx.validation.fieldErrors.length,
    warnings: ctx.validation.warnings,
  });

  appendStageLog(ctx, {
    stage: "validation",
    status: "completed",
    endedAt: new Date().toISOString(),
    message: ctx.validation.valid ? "valid" : `errors:${ctx.validation.fieldErrors.length}`,
  });
}

export function runLearningStage(ctx: DocumentPipelineContext): void {
  if (!ctx.ocr || !ctx.classification) return;

  const shouldLearn =
    ctx.classification.documentType === "unknown" ||
    ctx.classification.needsReview ||
    (ctx.extraction?.needsReview ?? false) ||
    (ctx.validation && !ctx.validation.valid);

  if (!shouldLearn) {
    logLearningStageReadOnly({
      runId: ctx.runId,
      action: "skipped",
      mutatesExtraction: false,
      reason: "no_review_needed",
    });
    console.log("[learning] skipped", { runId: ctx.runId, reason: "no_review_needed" });
    appendStageLog(ctx, {
      stage: "learning",
      status: "skipped",
      endedAt: new Date().toISOString(),
    });
    return;
  }

  appendStageLog(ctx, { stage: "learning", status: "running" });
  ctx.learningCase = createLearningCase({
    documentId: ctx.documentId,
    tunnel: ctx.tunnel,
    classification: ctx.classification,
    extraction: ctx.extraction,
    ocrText: ctx.ocr.rawText,
  });

  logLearningStageReadOnly({
    runId: ctx.runId,
    action: "case_created",
    mutatesExtraction: false,
    caseId: ctx.learningCase.id,
  });

  console.log("[learning] case created", {
    runId: ctx.runId,
    caseId: ctx.learningCase.id,
    status: ctx.learningCase.status,
    documentType: ctx.classification.documentType,
  });

  appendStageLog(ctx, {
    stage: "learning",
    status: "completed",
    endedAt: new Date().toISOString(),
    message: `case:${ctx.learningCase.id}`,
  });
}
