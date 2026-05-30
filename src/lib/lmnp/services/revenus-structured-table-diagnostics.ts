import type { LockedColumn } from "./revenus-column-semantics";

export type StructuredTableDiagnostics = {
  headerRowIndex: number;
  headerRow: string;
  headerCells: string[];
  columnIndexes: Array<{
    index: number;
    header: string;
    lockedType: string;
    targetField: string;
  }>;
  sampleNormalizedRows: Array<{ rowIndex: number; cells: string[] }>;
};

export function logStructuredTableDiagnostics(diagnostics: StructuredTableDiagnostics): void {
  if (process.env.NODE_ENV === "production") return;

  console.log("[revenue-structured-table]", diagnostics);
}

export function buildColumnIndexDiagnostics(columns: LockedColumn[]) {
  return columns.map((column) => ({
    index: column.index,
    header: column.header,
    lockedType: column.lockedType,
    targetField: column.targetField,
  }));
}
