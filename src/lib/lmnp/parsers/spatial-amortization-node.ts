/**
 * Node.js / CLI spatial amortization parser (pdf.js legacy build).
 * Used by benchmarks and local debug scripts — not imported by the browser bundle.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  parseSpatialAmortizationFromRows,
  spatialRowsFromTextItems,
  type SpatialAmortizationParseResult,
  type SpatialTableRow,
} from "./spatial-amortization-core";

export type {
  SpatialAmortizationParseResult,
  SpatialInstallment,
  SpatialTableRow,
  NormalizedPdfTextItem,
} from "./spatial-amortization-core";

export {
  extractMonetaryTokens,
  groupRowsByY,
  isLikelyDateToken,
  isProbableInstallmentRow,
  normalizePdfTextItem,
  parseFrenchAmount,
  parseSpatialAmortizationFromRows,
} from "./spatial-amortization-core";

const LOG_PREFIX = "[spatial-amortization-parser]";

async function configurePdfJsForNode(): Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const require = createRequire(import.meta.url);
  const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  return pdfjs;
}

export async function loadSpatialPdfRows(pdfPath: string): Promise<{
  totalPages: number;
  rows: SpatialTableRow[];
}> {
  const absolutePath = resolve(pdfPath);
  const buffer = readFileSync(absolutePath);
  const pdfjs = await configurePdfJsForNode();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

  const rows: SpatialTableRow[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    rows.push(...spatialRowsFromTextItems(pageNumber, content.items));
  }

  return { totalPages: pdf.numPages, rows };
}

export async function parseSpatialAmortizationPdf(
  pdfPath: string,
): Promise<SpatialAmortizationParseResult> {
  const absolutePath = resolve(pdfPath);
  const { totalPages, rows } = await loadSpatialPdfRows(absolutePath);
  return parseSpatialAmortizationFromRows(rows, { totalPages, source: absolutePath });
}

function readPdfPathFromCli(): string {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    throw new Error(
      "Provide a PDF file path.\n" +
        "  npx tsx src/lib/lmnp/parsers/spatial-amortization-node.ts path/to/amortization.pdf",
    );
  }
  return pdfPath;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.includes("spatial-amortization-node");
}

if (isDirectExecution()) {
  const pdfPath = readPdfPathFromCli();
  parseSpatialAmortizationPdf(pdfPath).catch((error: unknown) => {
    console.error(LOG_PREFIX, "error", error);
    process.exitCode = 1;
  });
}

/*
 * CLI (from repo root):
 *   npx tsx src/lib/lmnp/parsers/spatial-amortization-node.ts path/to/amortization.pdf
 *
 * Legacy entry (re-exports this module):
 *   npx tsx src/lib/lmnp/parsers/spatial-amortization-parser.ts path/to/amortization.pdf
 */
