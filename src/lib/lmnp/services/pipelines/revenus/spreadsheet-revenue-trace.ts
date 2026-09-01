/**
 * Read-only checkpoint tracing for SpreadsheetRevenuePipeline.
 * Logging only — must not alter extraction decisions.
 */

import type { SpreadsheetColumnMapping } from "./spreadsheet-header-recognition";
import type { SpreadsheetHeaderRecognitionAudit } from "./spreadsheet-header-recognition";

export type SpreadsheetWorkbookLoadedMeta = {
  fileName: string;
  mimeType: string;
  extension: string;
  sheetNames: string[];
  activeSheetName: string | null;
  worksheetDimensions: {
    rowCount: number;
    columnCount: number;
    usedRange?: string;
  };
};

export type SpreadsheetParsedMonetary = {
  raw: string;
  amount: number | null;
  accepted: boolean;
};

export type SpreadsheetCandidateRowExtraction = {
  rowIndex: number;
  rawRow: string[];
  normalizedRow: string[];
  parsedMonth: string | null;
  parsedRent: SpreadsheetParsedMonetary | null;
  parsedComplement: SpreadsheetParsedMonetary | null;
  parsedPaymentDate: string | null;
};

export type SpreadsheetRowRejection = {
  rowIndex: number;
  rawRow: string[];
  normalizedRow: string[];
  parsedMonth: string | null;
  parsedRent: SpreadsheetParsedMonetary | null;
  parsedComplement: SpreadsheetParsedMonetary | null;
  parsedPaymentDate: string | null;
  rejectionReason: string;
};

export type SpreadsheetExtractTraceSummary = {
  totalRowsRead: number;
  candidateRows: number;
  acceptedRows: number;
  rejectedRows: number;
  rejectionReasonsAggregate: Record<string, number>;
  acceptedLineCount: number;
};

export function logSpreadsheetCheckpoint(
  stage:
    | "workbook_loaded"
    | "header_detection"
    | "raw_rows_after_header"
    | "normalized_rows"
    | "candidate_row_extraction"
    | "row_rejection"
    | "final_summary",
  detail: Record<string, unknown>,
): void {
  console.log("[spreadsheet-revenue-debug]", { stage, ...detail });
}

export function traceWorkbookLoaded(meta: SpreadsheetWorkbookLoadedMeta): void {
  logSpreadsheetCheckpoint("workbook_loaded", {
    fileName: meta.fileName,
    mimeType: meta.mimeType,
    extension: meta.extension,
    sheetNames: meta.sheetNames,
    activeSheetName: meta.activeSheetName,
    worksheetDimensions: meta.worksheetDimensions,
  });
}

export function traceHeaderDetection(audit: SpreadsheetHeaderRecognitionAudit | null): void {
  if (!audit) {
    logSpreadsheetCheckpoint("header_detection", {
      detectedHeaderRowIndex: null,
      rawHeaders: [],
      normalizedHeaders: [],
      selectedMapping: null,
      status: "no_viable_header_row",
    });
    return;
  }

  logSpreadsheetCheckpoint("header_detection", {
    detectedHeaderRowIndex: audit.headerRowIndex,
    rawHeaders: audit.rawHeaders,
    normalizedHeaders: audit.normalizedHeaders,
    selectedMapping: audit.selectedMapping,
    candidateMatchCount: audit.candidateMatches.length,
    rejectedMappingCount: audit.rejectedMatches.length,
  });
}

export function traceRawRowsAfterHeader(
  grid: string[][],
  headerRowIndex: number,
  limit = 20,
): void {
  const rows = grid.slice(headerRowIndex + 1, headerRowIndex + 1 + limit);
  logSpreadsheetCheckpoint("raw_rows_after_header", {
    detectedHeaderRowIndex: headerRowIndex,
    rowCountAfterHeader: Math.max(0, grid.length - headerRowIndex - 1),
    sampleLimit: limit,
    rows: rows.map((row, offset) => ({
      worksheetRowIndex: headerRowIndex + 1 + offset,
      cells: row,
    })),
  });
}

export function traceNormalizedRows(
  dataRows: string[][],
  headerRowIndex: number,
  limit = 20,
): void {
  const sample = dataRows.slice(0, limit).map((row, offset) => ({
    worksheetRowIndex: headerRowIndex + 1 + offset,
    normalizedCells: row.map((cell) => cell.trim()),
  }));

  logSpreadsheetCheckpoint("normalized_rows", {
    detectedHeaderRowIndex: headerRowIndex,
    totalDataRows: dataRows.length,
    sampleLimit: limit,
    rows: sample,
  });
}

export function traceCandidateRowExtraction(candidate: SpreadsheetCandidateRowExtraction): void {
  logSpreadsheetCheckpoint("candidate_row_extraction", {
    rowIndex: candidate.rowIndex,
    rawRow: candidate.rawRow,
    normalizedRow: candidate.normalizedRow,
    parsedMonth: candidate.parsedMonth,
    parsedRent: candidate.parsedRent,
    parsedComplement: candidate.parsedComplement,
    parsedPaymentDate: candidate.parsedPaymentDate,
  });
}

export function traceRowRejection(rejection: SpreadsheetRowRejection): void {
  logSpreadsheetCheckpoint("row_rejection", {
    rowIndex: rejection.rowIndex,
    rawRow: rejection.rawRow,
    normalizedRow: rejection.normalizedRow,
    parsedMonth: rejection.parsedMonth,
    parsedRent: rejection.parsedRent,
    parsedComplement: rejection.parsedComplement,
    parsedPaymentDate: rejection.parsedPaymentDate,
    rejectionReason: rejection.rejectionReason,
  });
}

export function traceFinalSummary(summary: SpreadsheetExtractTraceSummary): void {
  logSpreadsheetCheckpoint("final_summary", {
    totalRowsRead: summary.totalRowsRead,
    candidateRows: summary.candidateRows,
    acceptedRows: summary.acceptedRows,
    rejectedRows: summary.rejectedRows,
    rejectionReasonsAggregate: summary.rejectionReasonsAggregate,
    acceptedLineCount: summary.acceptedLineCount,
  });
}

export function createEmptyTraceSummary(): SpreadsheetExtractTraceSummary {
  return {
    totalRowsRead: 0,
    candidateRows: 0,
    acceptedRows: 0,
    rejectedRows: 0,
    rejectionReasonsAggregate: {},
    acceptedLineCount: 0,
  };
}

export function recordRejection(
  summary: SpreadsheetExtractTraceSummary,
  reason: string,
): void {
  summary.rejectedRows += 1;
  summary.rejectionReasonsAggregate[reason] =
    (summary.rejectionReasonsAggregate[reason] ?? 0) + 1;
}

/** Read-only monetary probe for tracing (does not emit lines). */
export function probeMonetaryCell(
  raw: string,
  header: string | undefined,
  parse: (
    raw: string,
    header: string,
    options?: { monetaryHeaderOverride?: boolean },
  ) => { amount: number } | null,
): SpreadsheetParsedMonetary | null {
  if (!header) return null;
  const trimmed = raw.trim();
  const parsed = parse(trimmed, header, { monetaryHeaderOverride: true });
  return {
    raw: trimmed,
    amount: parsed?.amount ?? null,
    accepted: parsed != null,
  };
}

export function formatMappingForTrace(
  mapping: SpreadsheetColumnMapping | null,
): Record<string, unknown> | null {
  if (!mapping) return null;
  return { ...mapping };
}
