/**
 * Stage A — raw PDF cell extraction (no interpretation).
 */

import type { SpatialTableRow } from "../spatial-amortization-core";
import type { RawPdfCell } from "./types";

const DEFAULT_CELL_HEIGHT = 4;

export function runStageA_RawPdfCells(rows: SpatialTableRow[]): RawPdfCell[] {
  const cells: RawPdfCell[] = [];

  for (const row of rows) {
    if (!row.items?.length) {
      for (let columnIndex = 0; columnIndex < row.columns.length; columnIndex += 1) {
        const text = row.columns[columnIndex] ?? "";
        cells.push({
          text,
          x: 0,
          y: row.y,
          width: text.length * 4,
          height: DEFAULT_CELL_HEIGHT,
          pageNumber: row.pageNumber,
        });
      }
      continue;
    }

    for (const item of row.items) {
      cells.push({
        text: item.text,
        x: item.x,
        y: item.y,
        width: item.width,
        height: DEFAULT_CELL_HEIGHT,
        pageNumber: row.pageNumber,
      });
    }
  }

  return cells;
}
