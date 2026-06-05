import {
  resolveRevenueDocumentTextOrThrow,
  RevenueDocumentOcrFailedError,
  REVENUE_OCR_READ_FAILURE_MESSAGE,
} from "@/lib/documents/ocr";
import {
  adaptGptLinesToRevenueRawLines,
} from "@/lib/lmnp/services/revenus-ocr-lines-adapter";
import { requestRevenusGptExtraction } from "@/lib/lmnp/services/revenus-gpt-extract-client";
import { parseStructuredRevenueTable } from "@/lib/lmnp/services/revenus-structured-table-parser";
import {
  logRevenueRuntimeStage,
  logRevenueSourceOfTruth,
} from "@/lib/lmnp/services/revenus-runtime-trace";
import { buildRevenueSupervision } from "@/lib/lmnp/services/revenue-supervision";
import type { LmnpDocument } from "@/lib/lmnp/types";

import type { RevenuePipelineContext, RevenuePipelineRunResult } from "./revenue-pipeline-types";

function logVisionRevenueDebug(detail: Record<string, unknown>): void {
  console.log("[revenue-vision-debug]", detail);
}

/**
 * Scans, screenshots, and degraded PDFs — OCR first, deterministic table parse, GPT only as fallback copilot.
 */
export async function runRevenueVisionPipeline(
  ctx: RevenuePipelineContext,
  skippedPipelines: RevenuePipelineRunResult["skippedPipelines"],
  document: LmnpDocument,
): Promise<RevenuePipelineRunResult> {
  logVisionRevenueDebug({
    stage: "pipeline_start",
    fileName: ctx.fileName,
    documentId: ctx.documentId,
  });

  let ocrResult;
  try {
    ocrResult = await resolveRevenueDocumentTextOrThrow(ctx.file);
  } catch (err) {
    if (err instanceof RevenueDocumentOcrFailedError) {
      const supervision = buildRevenueSupervision({
        pipelineId: "vision",
        lines: [],
        ocrFailure: true,
      });
      return {
        pipelineId: "vision",
        detectedSourceType: "scanned_pdf",
        documentId: ctx.documentId,
        fileName: ctx.fileName,
        rawText: "",
        ocrProvider: err.provider,
        ocrStrategy: err.strategy,
        ocrQualityScore: err.quality.score,
        lines: [],
        success: false,
        ocrFailure: true,
        supervision,
        skippedPipelines,
        error: err.message,
      };
    }
    throw err;
  }

  const rawText = ocrResult.rawText;

  logRevenueRuntimeStage("ocr_complete", {
    fn: "runRevenueVisionPipeline",
    documentId: ctx.documentId,
    provider: ocrResult.provider,
    strategy: ocrResult.strategy,
    qualityScore: ocrResult.quality.score,
    textLength: rawText.length,
    sourceType: ctx.sourceType,
  });

  if (!rawText.trim()) {
    const supervision = buildRevenueSupervision({
      pipelineId: "vision",
      lines: [],
      ocrFailure: true,
    });
    return {
      pipelineId: "vision",
      detectedSourceType: "image_capture",
      documentId: ctx.documentId,
      fileName: ctx.fileName,
      rawText,
      ocrProvider: ocrResult.provider,
      ocrStrategy: ocrResult.strategy,
      ocrQualityScore: ocrResult.quality.score,
      lines: [],
      success: false,
      ocrFailure: true,
      supervision,
      skippedPipelines,
      error: REVENUE_OCR_READ_FAILURE_MESSAGE,
    };
  }

  const structured = parseStructuredRevenueTable(
    rawText,
    ctx.fiscalYear,
    ctx.documentId,
    ctx.sourceType,
  );

  if (structured.detected && structured.lines.length > 0) {
    logRevenueSourceOfTruth("structured_table_parser", {
      fn: "runRevenueVisionPipeline",
      documentId: ctx.documentId,
      lineCount: structured.lines.length,
      skipGpt: true,
    });

    const supervision = buildRevenueSupervision({
      pipelineId: "vision",
      lines: structured.lines,
      partialRead: ocrResult.quality.score < 80,
    });

    logVisionRevenueDebug({
      stage: "structured_only",
      lineCount: structured.lines.length,
    });

    return {
      pipelineId: "vision",
      detectedSourceType: "scanned_pdf",
      documentId: ctx.documentId,
      fileName: ctx.fileName,
      rawText,
      ocrProvider: ocrResult.provider,
      ocrStrategy: ocrResult.strategy,
      ocrQualityScore: ocrResult.quality.score,
      lines: structured.lines,
      success: true,
      supervision,
      skippedPipelines,
    };
  }

  logVisionRevenueDebug({ stage: "gpt_fallback", reason: "no_structured_table" });

  const gptResult = await requestRevenusGptExtraction({
    rawText,
    fileName: ctx.fileName,
    fiscalYear: ctx.fiscalYear,
    sourceType: ctx.sourceType,
  });

  logRevenueSourceOfTruth("gpt_extraction", {
    fn: "runRevenueVisionPipeline",
    documentId: ctx.documentId,
    lineCount: gptResult.extraction.lines.length,
    success: gptResult.success,
  });

  const lines = adaptGptLinesToRevenueRawLines(
    gptResult.extraction.lines,
    document,
    ctx.sourceType,
  );

  const supervision = buildRevenueSupervision({
    pipelineId: "vision",
    lines,
    gptUsed: true,
    partialRead: ocrResult.quality.score < 75 || lines.some((line) => line.confidence < 70),
  });

  return {
    pipelineId: "vision",
    detectedSourceType: "image_capture",
    documentId: ctx.documentId,
    fileName: ctx.fileName,
    rawText,
    ocrProvider: ocrResult.provider,
    ocrStrategy: ocrResult.strategy,
    ocrQualityScore: ocrResult.quality.score,
    lines,
    success: gptResult.success && lines.length > 0,
    supervision,
    skippedPipelines,
    error: gptResult.error,
  };
}
