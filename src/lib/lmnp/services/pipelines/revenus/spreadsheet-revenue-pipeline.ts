import { parseStructuredRevenueTable } from "@/lib/lmnp/services/revenus-structured-table-parser";
import { buildRevenueSupervision } from "@/lib/lmnp/services/revenue-supervision";
import type { RevenueRawLine } from "@/lib/lmnp/types";

import type { RevenuePipelineContext, RevenuePipelineRunResult } from "./revenue-pipeline-types";
import { extractRevenueLinesFromSpreadsheetGrid } from "./spreadsheet-revenue-extract";
import { gridToTabularText, readSpreadsheetGrid, type SpreadsheetSheetGrid } from "./spreadsheet-grid";

function logSpreadsheetRevenueDebug(detail: Record<string, unknown>): void {
  console.log("[spreadsheet-revenue-debug]", detail);
}

/**
 * Une feuille nommée explicitement comme une année (ex. "2025") sert d'année de
 * repli pour ses propres lignes sans date exploitable — jamais l'exercice fiscal
 * globalement demandé. Cycle 15A : évite qu'une feuille "2026" sans colonne date
 * voie ses montants réattribués à l'exercice 2025 simplement parce que c'est
 * l'exercice demandé par ailleurs.
 */
function inferSheetYear(sheetName: string): number | null {
  const match = sheetName.trim().match(/^(19|20)\d{2}$/);
  return match ? Number(sheetName.trim()) : null;
}

function extractFromSheet(
  sheet: SpreadsheetSheetGrid,
  ctx: RevenuePipelineContext,
): { lines: RevenueRawLine[]; headerRowIndex: number | null } {
  const dateFallbackYear = inferSheetYear(sheet.sheetName) ?? ctx.fiscalYear;

  const spreadsheetExtract = extractRevenueLinesFromSpreadsheetGrid(sheet.grid, {
    fiscalYear: dateFallbackYear,
    sourceDocumentId: ctx.documentId,
    sourceType: ctx.sourceType,
  });

  if (spreadsheetExtract.lines.length > 0) {
    logSpreadsheetRevenueDebug({
      stage: "spreadsheet_extract",
      sheetName: sheet.sheetName,
      lineCount: spreadsheetExtract.lines.length,
      headerRowIndex: spreadsheetExtract.headerRowIndex,
    });
    return { lines: spreadsheetExtract.lines, headerRowIndex: spreadsheetExtract.headerRowIndex };
  }

  logSpreadsheetRevenueDebug({
    stage: "structured_parse_fallback",
    sheetName: sheet.sheetName,
    reason: "spreadsheet_header_mapping_empty",
  });

  const rawText = gridToTabularText(sheet.grid);
  const structured = parseStructuredRevenueTable(rawText, dateFallbackYear, ctx.documentId, ctx.sourceType);

  logSpreadsheetRevenueDebug({
    stage: "structured_parse_fallback_result",
    sheetName: sheet.sheetName,
    detected: structured.detected,
    lineCount: structured.lines.length,
  });

  return { lines: structured.lines, headerRowIndex: null };
}

/**
 * Deterministic spreadsheet extraction — no OCR, no GPT vision.
 * Cycle 15A : parcourt désormais toutes les feuilles du classeur (plus seulement
 * la première) et fusionne les lignes retenues. Une feuille de synthèse (type
 * "Récap", lignes "Total ...") ne produit naturellement aucune ligne — les
 * filtres existants (ligne de total, mois non reconnu) l'excluent déjà — mais
 * elle est désormais signalée explicitement plutôt qu'ignorée en silence.
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

  const sheets = await readSpreadsheetGrid(ctx.file);
  const rawText = sheets.map((sheet) => `# ${sheet.sheetName}\n${gridToTabularText(sheet.grid)}`).join("\n\n");

  const lines: RevenueRawLine[] = [];
  const ignoredSheets: string[] = [];
  const contributingSheets: string[] = [];

  for (const sheet of sheets) {
    const result = extractFromSheet(sheet, ctx);
    if (result.lines.length === 0) {
      ignoredSheets.push(sheet.sheetName);
      continue;
    }
    contributingSheets.push(sheet.sheetName);
    lines.push(
      ...result.lines.map((line) => ({ ...line, sourceType: "excel" as const, sourceFileName: ctx.fileName })),
    );
  }

  logSpreadsheetRevenueDebug({
    stage: "multi_sheet_summary",
    sheetCount: sheets.length,
    contributingSheets,
    ignoredSheets,
    totalLineCount: lines.length,
  });

  const supervision = buildRevenueSupervision({
    pipelineId: "spreadsheet",
    lines,
    structuralError:
      lines.length === 0
        ? "Le tableur ne contient pas de colonnes reconnues (Mois, Loyer, Complément…). Vérifiez la première ligne d'en-têtes."
        : undefined,
    extraWarnings:
      lines.length > 0 && ignoredSheets.length > 0
        ? [
            `Feuille(s) non intégrée(s) car aucune transaction reconnue : ${ignoredSheets.join(", ")}. ` +
              "Vérifiez qu'il ne s'agit pas de données pertinentes (ex. une feuille de synthèse est normalement sans effet).",
          ]
        : undefined,
  });

  logSpreadsheetRevenueDebug({
    stage: "final_summary",
    pipeline: "spreadsheet",
    finalLineCount: lines.length,
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
