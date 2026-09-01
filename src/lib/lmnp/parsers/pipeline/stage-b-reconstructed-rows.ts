/**
 * Stage B — immutable table reconstruction with fixed X-bucket columns.
 * Never mutates input rows.
 */

import {
  assignRowToFixedColumnSlots,
  learnColumnSlotLayout,
  type ColumnRoleMapping,
  type ColumnSlot,
  type SpatialTableRow,
} from "../spatial-amortization-core";
import type { ColumnSlotSnapshot, ReconstructedRow } from "./types";

export type StageBResult = {
  reconstructedRows: ReconstructedRow[];
  columnSlots: ColumnSlot[];
  columnSlotSnapshots: ColumnSlotSnapshot[];
};

function toColumnSlotSnapshots(slots: ColumnSlot[]): ColumnSlotSnapshot[] {
  return slots.map((slot) => ({
    columnIndex: slot.columnIndex,
    role: slot.role,
    minX: slot.minX,
    maxX: slot.maxX,
  }));
}

/**
 * Reconstruct rows with fixed column slots. Input `rows` are never modified.
 */
export function runStageB_ReconstructedRows(
  rows: SpatialTableRow[],
  roleMapping: ColumnRoleMapping,
): StageBResult {
  const columnSlots = learnColumnSlotLayout(rows, roleMapping);

  const reconstructedRows: ReconstructedRow[] = rows.map((row, sourceRowIndex) => {
    const gapBasedColumns = [...row.columns];

    if (row.items?.length && columnSlots.length > 0) {
      const bucketAssignment = assignRowToFixedColumnSlots(row.items, columnSlots);
      return {
        pageNumber: row.pageNumber,
        y: row.y,
        gapBasedColumns,
        bucketColumns: [...bucketAssignment.columns],
        raw: bucketAssignment.columns.join(" "),
        sourceRowIndex,
        bucketAligned: true,
      };
    }

    return {
      pageNumber: row.pageNumber,
      y: row.y,
      gapBasedColumns,
      bucketColumns: [...gapBasedColumns],
      raw: row.raw,
      sourceRowIndex,
      bucketAligned: false,
    };
  });

  return {
    reconstructedRows,
    columnSlots,
    columnSlotSnapshots: toColumnSlotSnapshots(columnSlots),
  };
}

export function reconstructedRowToSpatialRow(row: ReconstructedRow): SpatialTableRow {
  return {
    pageNumber: row.pageNumber,
    y: row.y,
    columns: [...row.bucketColumns],
    raw: row.raw,
  };
}
