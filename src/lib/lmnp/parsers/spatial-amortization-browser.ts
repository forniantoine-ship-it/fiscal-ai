/**
 * Browser-only spatial amortization parser (pdf.js standard build).
 * Used by the credit upload pipeline — must not import Node APIs.
 */

import {
  parseSpatialAmortizationFromRows,
  spatialRowsFromTextItems,
  type SpatialAmortizationParseResult,
  type SpatialTableRow,
} from "./spatial-amortization-core";
import {
  logPipelineEntry,
  logPipelineEntryCatch,
} from "@/lib/lmnp/services/pipeline-entry-debug";

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

async function configurePdfJsForBrowser(): Promise<typeof import("pdfjs-dist")> {
  const pdfjs = await import("pdfjs-dist");

  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  return pdfjs;
}

export async function loadSpatialPdfRowsFromFile(file: File): Promise<{
  totalPages: number;
  rows: SpatialTableRow[];
}> {
  const pdfjs = await configurePdfJsForBrowser();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

  const rows: SpatialTableRow[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    rows.push(...spatialRowsFromTextItems(pageNumber, content.items));
  }

  return { totalPages: pdf.numPages, rows };
}

export async function parseSpatialAmortizationFromFile(
  file: File,
): Promise<SpatialAmortizationParseResult> {
  logPipelineEntry({
    functionName: "parseSpatialAmortizationFromFile",
    entered: true,
    fileName: file.name,
    extra: { sizeBytes: file.size, mimeType: file.type },
  });

  console.log("[spatial-parser-trace]", {
    functionName: "parseSpatialAmortizationFromFile",
    entered: true,
    extra: { fileName: file.name, sizeBytes: file.size },
  });

  const { totalPages, rows } = await loadSpatialPdfRowsFromFile(file);

  logPipelineEntry({
    functionName: "parseSpatialAmortizationFromFile.loadSpatialPdfRowsFromFile",
    returned: true,
    fileName: file.name,
    extra: { totalPages, rowCount: rows.length },
  });

  console.log("[spatial-parser-trace]", {
    functionName: "parseSpatialAmortizationFromFile.loadSpatialPdfRowsFromFile",
    entered: false,
    rowCount: rows.length,
    extra: { totalPages },
  });

  const result = await parseSpatialAmortizationFromRows(rows, { totalPages, source: file.name });

  const datedCount = result.installments.filter((row) => Boolean(row.date?.trim())).length;

  logPipelineEntry({
    functionName: "parseSpatialAmortizationFromFile",
    returned: true,
    success: result.success,
    failureReason: result.success ? null : `confidence_${result.confidenceScore}_installments_${result.installments.length}`,
    fileName: file.name,
    installmentCount: result.installments.length,
    datedInstallmentCount: datedCount,
    extra: { confidenceScore: result.confidenceScore },
  });

  console.log("[amortization-pipeline-debug] parseSpatialAmortizationFromFile_result", {
    fileName: file.name,
    success: result.success,
    confidenceScore: result.confidenceScore,
    installmentCount: result.installments.length,
    datedInstallmentCount: datedCount,
  });

  console.log("[spatial-parser-trace]", {
    functionName: "parseSpatialAmortizationFromFile",
    entered: false,
    rowCount: rows.length,
    extra: {
      installmentCount: result.installments.length,
      confidenceScore: result.confidenceScore,
    },
  });

  return result;
}

const LOG_INTEGRATION = "[spatial-parser-integration]";

/**
 * Runs the spatial parser during upload/reanalyze (browser). Logs only — does not affect GPT/UI.
 */
export async function runSpatialAmortizationIntegrationProbe(
  file: File,
  context: { documentId: string; fileName: string },
): Promise<SpatialAmortizationParseResult | null> {
  console.log(LOG_INTEGRATION, "start", {
    documentId: context.documentId,
    fileName: context.fileName,
    sizeBytes: file.size,
    mimeType: file.type,
  });

  try {
    const result = await parseSpatialAmortizationFromFile(file);

    console.log(LOG_INTEGRATION, {
      documentId: context.documentId,
      fileName: context.fileName,
      success: result.success,
      confidenceScore: result.confidenceScore,
      installmentCount: result.installments.length,
      detectedColumns: result.detectedColumns,
      detectedInstallmentRows: result.detectedInstallmentRows,
    });

    console.log(LOG_INTEGRATION, "sample_installments", {
      documentId: context.documentId,
      installments: result.installments.slice(0, 5),
    });

    return result;
  } catch (error) {
    console.warn(LOG_INTEGRATION, {
      documentId: context.documentId,
      fileName: context.fileName,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
