/**
 * Debug CLI harness for spatial row reconstruction (console-only).
 * Production parsing: spatial-amortization-node.ts / spatial-amortization-browser.ts
 */

import { resolve } from "node:path";

import {
  extractMonetaryTokens,
  groupRowsByY,
  isProbableInstallmentRow,
  normalizePdfTextItem,
  type NormalizedPdfTextItem,
  type SpatialTableRow,
} from "./spatial-amortization-core";
import { loadSpatialPdfRows } from "./spatial-amortization-node";

const LOG_PREFIX = "[spatial-amortization-parser]";

export type { NormalizedPdfTextItem, SpatialTableRow };

export {
  extractMonetaryTokens,
  groupRowsByY,
  isProbableInstallmentRow,
  normalizePdfTextItem,
};

export type SpatialAmortizationParseSummary = {
  totalPages: number;
  totalRows: number;
  detectedInstallmentRows: number;
  averageColumnCount: number;
};

export async function runSpatialAmortizationParser(
  pdfPath: string,
): Promise<SpatialAmortizationParseSummary> {
  const { totalPages, rows } = await loadSpatialPdfRows(pdfPath);

  let detectedInstallmentRows = 0;
  const columnCounts: number[] = [];

  for (const row of rows) {
    columnCounts.push(row.columns.length);

    if (!isProbableInstallmentRow(row.columns)) continue;

    detectedInstallmentRows += 1;
    console.log(LOG_PREFIX, "installment-row", {
      pageNumber: row.pageNumber,
      rowY: Math.round(row.y * 100) / 100,
      columns: row.columns,
      raw: row.raw,
    });
  }

  const averageColumnCount =
    columnCounts.length === 0
      ? 0
      : Math.round((columnCounts.reduce((sum, count) => sum + count, 0) / columnCounts.length) * 100) /
        100;

  const summary: SpatialAmortizationParseSummary = {
    totalPages,
    totalRows: rows.length,
    detectedInstallmentRows,
    averageColumnCount,
  };

  console.log(LOG_PREFIX, "summary", summary);
  return summary;
}

function readPdfPathFromCli(): string {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    throw new Error(
      "Provide a PDF file path.\n" +
        "  npx tsx src/lib/lmnp/parsers/debug-spatial-amortization-parser.ts path/to/amortization.pdf",
    );
  }
  return pdfPath;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.includes("debug-spatial-amortization-parser");
}

if (isDirectExecution()) {
  const pdfPath = readPdfPathFromCli();
  console.log(LOG_PREFIX, "start", { pdfPath: resolve(pdfPath) });
  runSpatialAmortizationParser(pdfPath).catch((error: unknown) => {
    console.error(LOG_PREFIX, "error", error);
    process.exitCode = 1;
  });
}

/*
 * CLI (from repo root):
 *   npx tsx src/lib/lmnp/parsers/debug-spatial-amortization-parser.ts path/to/amortization.pdf
 */
