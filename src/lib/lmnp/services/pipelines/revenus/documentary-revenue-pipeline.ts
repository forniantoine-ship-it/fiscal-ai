import {
  resolveRevenueDocumentTextOrThrow,
  RevenueDocumentOcrFailedError,
} from "@/lib/documents/ocr";
import {
  adaptGptLinesToRevenueRawLines,
} from "@/lib/lmnp/services/revenus-ocr-lines-adapter";
import { requestRevenusGptExtraction } from "@/lib/lmnp/services/revenus-gpt-extract-client";
import { parseStructuredRevenueTable } from "@/lib/lmnp/services/revenus-structured-table-parser";
import { logRevenueSourceOfTruth } from "@/lib/lmnp/services/revenus-runtime-trace";
import { buildRevenueSupervision } from "@/lib/lmnp/services/revenue-supervision";
import type { LmnpDocument } from "@/lib/lmnp/types";

import type { RevenuePipelineContext, RevenuePipelineRunResult } from "./revenue-pipeline-types";

function logDocumentaryRevenueDebug(detail: Record<string, unknown>): void {
  console.log("[documentary-revenue-debug]", detail);
}

/**
 * Narrative PDFs (quittances, attestations) — structured parse when possible;
 * GPT assists only for visible atomic lines, with explicit partial-document supervision.
 */
export async function runDocumentaryRevenuePipeline(
  ctx: RevenuePipelineContext,
  skippedPipelines: RevenuePipelineRunResult["skippedPipelines"],
  document: LmnpDocument,
): Promise<RevenuePipelineRunResult> {
  logDocumentaryRevenueDebug({
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
        pipelineId: "documentary",
        lines: [],
        ocrFailure: true,
      });
      return {
        pipelineId: "documentary",
        detectedSourceType: "documentary_pdf",
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

  if (structured.lines.length > 0) {
    logRevenueSourceOfTruth("structured_table_parser", {
      fn: "runDocumentaryRevenuePipeline",
      documentId: ctx.documentId,
      lineCount: structured.lines.length,
    });

    const supervision = buildRevenueSupervision({
      pipelineId: "documentary",
      lines: structured.lines,
    });

    return {
      pipelineId: "documentary",
      detectedSourceType: "documentary_pdf",
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

  const gptResult = await requestRevenusGptExtraction({
    rawText,
    fileName: ctx.fileName,
    fiscalYear: ctx.fiscalYear,
    sourceType: ctx.sourceType,
  });

  const lines = adaptGptLinesToRevenueRawLines(
    gptResult.extraction.lines,
    document,
    ctx.sourceType,
  );

  logRevenueSourceOfTruth("gpt_extraction", {
    fn: "runDocumentaryRevenuePipeline",
    documentId: ctx.documentId,
    lineCount: lines.length,
    documentary: true,
  });

  const supervision = buildRevenueSupervision({
    pipelineId: "documentary",
    lines,
    gptUsed: true,
    structuralError:
      lines.length === 0
        ? "Ce document semble être une pièce justificative (quittance, attestation) sans grille mensuelle complète. Complétez la grille ou ajoutez un relevé / export de loyers."
        : undefined,
  });

  if (lines.length > 0 && supervision.level !== "red") {
    supervision.level = "orange";
    supervision.title = "Document partiel";
    supervision.message =
      "Nous avons relevé quelques flux sur ce justificatif, mais il ne remplace pas un export mensuel complet. Vérifiez la grille avant validation.";
    supervision.recoveryHints = [
      "Ajouter l'export Excel ou le relevé bancaire des loyers",
      "Compléter les mois manquants directement dans la grille",
    ];
  }

  return {
    pipelineId: "documentary",
    detectedSourceType: "documentary_pdf",
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
    error: lines.length > 0 ? undefined : supervision.message,
  };
}
