import { parseStructuredRevenueTable } from "@/lib/lmnp/services/revenus-structured-table-parser";
import { buildRevenueSupervision } from "@/lib/lmnp/services/revenue-supervision";

import type { RevenuePipelineContext, RevenuePipelineRunResult } from "./revenue-pipeline-types";
import { extractRevenueLinesFromSpreadsheetGrid } from "./spreadsheet-revenue-extract";
import { gridToTabularText, readSpreadsheetGrid } from "./spreadsheet-grid";

function logSpreadsheetRevenueDebug(detail: Record<string, unknown>): void {
  console.log("[spreadsheet-revenue-debug]", detail);
}

/**
 * Deterministic spreadsheet extraction — no OCR, no GPT vision.
 */
export async function runSpreadsheetRevenuePipeline(
  ctx: RevenuePipelineContext,
  skippedPipelines: RevenuePipelineRunResult["skippedPipelines"],
): Promise<RevenuePipelineRunResult> {
  logSpreadsheetRevenueDebug({
    stage: "pipeline_start",
    fileName: ctx.fileName,
    documentId: ctx.documentId,
  });

  const grid = await readSpreadsheetGrid(ctx.file);
  const rawText = gridToTabularText(grid);

  const spreadsheetExtract = extractRevenueLinesFromSpreadsheetGrid(grid, {
    fiscalYear: ctx.fiscalYear,
    sourceDocumentId: ctx.documentId,
    sourceType: ctx.sourceType,
  });

  let lines = spreadsheetExtract.lines.map((line) => ({
    ...line,
    sourceType: "excel" as const,
  }));

  if (lines.length === 0) {
    logSpreadsheetRevenueDebug({
      stage: "structured_parse_fallback",
      reason: "spreadsheet_header_mapping_empty",
    });

    const structured = parseStructuredRevenueTable(
      rawText,
      ctx.fiscalYear,
      ctx.documentId,
      ctx.sourceType,
    );

    logSpreadsheetRevenueDebug({
      stage: "structured_parse_fallback_result",
      detected: structured.detected,
      lineCount: structured.lines.length,
    });

    lines = structured.lines.map((line) => ({
      ...line,
      sourceType: "excel" as const,
    }));
  } else {
    logSpreadsheetRevenueDebug({
      stage: "spreadsheet_extract",
      lineCount: lines.length,
      headerRowIndex: spreadsheetExtract.headerRowIndex,
    });
  }

  const supervision = buildRevenueSupervision({
    pipelineId: "spreadsheet",
    lines,
    structuralError:
      lines.length === 0
        ? "Le tableur ne contient pas de colonnes reconnues (Mois, Loyer, Complément…). Vérifiez la première ligne d'en-têtes."
        : undefined,
  });

  logSpreadsheetRevenueDebug({
    stage: "final_summary",
    pipeline: "spreadsheet",
    spreadsheetLineCount: spreadsheetExtract.lines.length,
    finalLineCount: lines.length,
    usedStructuredFallback: spreadsheetExtract.lines.length === 0,
    headerRowIndex: spreadsheetExtract.headerRowIndex,
    success: lines.length > 0,
  });

  return {
    pipelineId: "spreadsheet",
    detectedSourceType: "spreadsheet",
    documentId: ctx.documentId,
    fileName: ctx.fileName,
    rawText,
    ocrProvider: "spreadsheet_parser",
    lines,
    success: lines.length > 0,
    supervision,
    skippedPipelines,
    error: lines.length > 0 ? undefined : supervision.message,
  };
}
