import {
  resolveRevenueDocumentTextOrThrow,
  RevenueDocumentOcrFailedError,
  REVENUE_OCR_READ_FAILURE_MESSAGE,
} from "@/lib/documents/ocr";
import { parseStructuredRevenueTable } from "@/lib/lmnp/services/revenus-structured-table-parser";
import { buildRevenueSupervision } from "@/lib/lmnp/services/revenue-supervision";
import { logRevenueSourceOfTruth } from "@/lib/lmnp/services/revenus-runtime-trace";

import type { RevenuePipelineContext, RevenuePipelineRunResult } from "./revenue-pipeline-types";

function logPdfStructuredRevenueDebug(detail: Record<string, unknown>): void {
  console.log("[pdf-structured-revenue-debug]", detail);
}

/**
 * Native-text PDFs with tabular rent data — deterministic parser only, no GPT reconstruction.
 */
export async function runPdfStructuredRevenuePipeline(
  ctx: RevenuePipelineContext,
  skippedPipelines: RevenuePipelineRunResult["skippedPipelines"],
): Promise<RevenuePipelineRunResult> {
  logPdfStructuredRevenueDebug({
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
        pipelineId: "pdf_structured",
        lines: [],
        ocrFailure: true,
      });
      return {
        pipelineId: "pdf_structured",
        detectedSourceType: "native_pdf_table",
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
  const structured = parseStructuredRevenueTable(
    rawText,
    ctx.fiscalYear,
    ctx.documentId,
    ctx.sourceType,
  );
  // Cycle 17 — sourceFileName manquant sur ce chemin (contrairement à Excel/CSV
  // depuis Cycle 15B) : deux PDF différents aux transactions coïncidentellement
  // identiques pouvaient être confondus par hashDocumentContent (identité de
  // contenu seul, jamais de nom de fichier). Stampé ici, comme pour Excel/CSV.
  const lines = structured.lines.map((line) => ({ ...line, sourceFileName: ctx.fileName }));

  logPdfStructuredRevenueDebug({
    stage: "structured_parse",
    detected: structured.detected,
    lineCount: lines.length,
    strategy: ocrResult.strategy,
    provider: ocrResult.provider,
  });

  if (lines.length > 0) {
    logRevenueSourceOfTruth("structured_table_parser", {
      fn: "runPdfStructuredRevenuePipeline",
      documentId: ctx.documentId,
      lineCount: lines.length,
      skipGpt: true,
    });
  }

  const supervision = buildRevenueSupervision({
    pipelineId: "pdf_structured",
    lines,
    structuralError:
      lines.length === 0
        ? "Le PDF ne contient pas de tableau de loyers mensuel lisible en texte natif."
        : undefined,
  });

  return {
    pipelineId: "pdf_structured",
    detectedSourceType: "native_pdf_table",
    documentId: ctx.documentId,
    fileName: ctx.fileName,
    rawText,
    ocrProvider: ocrResult.provider,
    ocrStrategy: ocrResult.strategy,
    ocrQualityScore: ocrResult.quality.score,
    lines,
    success: lines.length > 0,
    supervision,
    skippedPipelines,
    error: lines.length > 0 ? undefined : (supervision.message ?? REVENUE_OCR_READ_FAILURE_MESSAGE),
  };
}
