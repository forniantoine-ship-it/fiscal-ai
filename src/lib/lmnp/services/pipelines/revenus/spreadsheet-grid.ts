import * as XLSX from "xlsx";

import { traceWorkbookLoaded } from "./spreadsheet-revenue-trace";

function logSpreadsheetRevenueDebug(detail: Record<string, unknown>): void {
  console.log("[spreadsheet-revenue-debug]", detail);
}

function extensionFromFileName(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? (parts.pop() ?? "") : "";
}

function detectDelimiter(sample: string): string {
  const tabs = (sample.match(/\t/g) ?? []).length;
  const semicolons = (sample.match(/;/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  if (tabs >= semicolons && tabs >= commas && tabs > 0) return "\t";
  if (semicolons > commas) return ";";
  return ",";
}

function parseCsvText(text: string): string[][] {
  const delimiter = detectDelimiter(text.slice(0, 2000));
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  return rows;
}

function sheetToGrid(sheet: XLSX.WorkSheet): string[][] {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const grid: string[][] = [];

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: string[] = [];
    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      const cell = sheet[address];
      const value =
        cell == null
          ? ""
          : typeof cell.w === "string"
            ? cell.w
            : cell.v == null
              ? ""
              : String(cell.v);
      row.push(value.trim());
    }
    if (row.some((cell) => cell.length > 0)) grid.push(row);
  }

  return grid;
}

export function gridToTabularText(grid: string[][]): string {
  return grid.map((row) => row.join("\t")).join("\n");
}

/**
 * Reads spreadsheet files into a normalized string grid (no OCR, no vision).
 */
export async function readSpreadsheetGrid(file: File): Promise<string[][]> {
  const ext = extensionFromFileName(file.name);

  logSpreadsheetRevenueDebug({
    stage: "read_start",
    fileName: file.name,
    mimeType: file.type,
    extension: ext,
  });

  if (ext === "csv" || file.type === "text/csv") {
    const text = await file.text();
    const grid = parseCsvText(text);
    traceWorkbookLoaded({
      fileName: file.name,
      mimeType: file.type,
      extension: ext,
      sheetNames: ["csv"],
      activeSheetName: "csv",
      worksheetDimensions: {
        rowCount: grid.length,
        columnCount: grid[0]?.length ?? 0,
      },
    });
    logSpreadsheetRevenueDebug({
      stage: "csv_parsed",
      rowCount: grid.length,
      columnCount: grid[0]?.length ?? 0,
    });
    return grid;
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    raw: false,
  });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    traceWorkbookLoaded({
      fileName: file.name,
      mimeType: file.type,
      extension: ext,
      sheetNames: [],
      activeSheetName: null,
      worksheetDimensions: { rowCount: 0, columnCount: 0 },
    });
    logSpreadsheetRevenueDebug({ stage: "empty_workbook", fileName: file.name });
    return [];
  }

  const sheet = workbook.Sheets[firstSheetName] ?? {};
  const grid = sheetToGrid(sheet);
  traceWorkbookLoaded({
    fileName: file.name,
    mimeType: file.type,
    extension: ext,
    sheetNames: workbook.SheetNames,
    activeSheetName: firstSheetName,
    worksheetDimensions: {
      rowCount: grid.length,
      columnCount: grid.reduce((max, row) => Math.max(max, row.length), 0),
      usedRange: typeof sheet["!ref"] === "string" ? sheet["!ref"] : undefined,
    },
  });
  logSpreadsheetRevenueDebug({
    stage: "workbook_parsed",
    sheetName: firstSheetName,
    sheetCount: workbook.SheetNames.length,
    rowCount: grid.length,
    columnCount: grid[0]?.length ?? 0,
  });

  return grid;
}
