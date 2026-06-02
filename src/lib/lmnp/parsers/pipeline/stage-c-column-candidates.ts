/**
 * Stage C — column role candidates (non-definitive scoring).
 */

import {
  collectGlobalHeaderMapping,
  computeColumnNumericStats,
  isProbableInstallmentRow,
  refineColumnRoleMapping,
  scoreColumnForRole,
  type ColumnRole,
  type ColumnRoleMapping,
  type SpatialTableRow,
} from "../spatial-amortization-core";
import { reconstructedRowToSpatialRow } from "./stage-b-reconstructed-rows";
import type { ColumnCandidatesArtifact, ColumnRoleCandidate, ColumnSemanticRole, ReconstructedRow } from "./types";

const SCORABLE_ROLES: ColumnRole[] = [
  "payment",
  "principal",
  "interest",
  "insurance",
  "remainingCapital",
];

function toSemanticRole(role: ColumnRole): ColumnSemanticRole {
  if (role === "rank" || role === "date") return role;
  return role;
}

function normalizeScore(raw: number): number {
  const clamped = Math.max(0, Math.min(raw / 100, 1));
  return Math.round(clamped * 100) / 100;
}

export function runStageC_ColumnCandidates(
  reconstructedRows: ReconstructedRow[],
): ColumnCandidatesArtifact {
  const spatialRows: SpatialTableRow[] = reconstructedRows.map(reconstructedRowToSpatialRow);
  const globalHeader = collectGlobalHeaderMapping(spatialRows);

  const installmentRows = reconstructedRows.filter((row) => {
    if (!/\d/.test(row.gapBasedColumns.join(" "))) return false;
    return isProbableInstallmentRow(row.gapBasedColumns);
  }).map(reconstructedRowToSpatialRow);

  const columnStatsMap = computeColumnNumericStats(installmentRows);
  const refinedMapping = refineColumnRoleMapping(globalHeader.mapping, columnStatsMap, {
    loanPhase: "unknown",
  });

  const crdStats = [...columnStatsMap.values()].find(
    (stats) => refinedMapping.get(stats.columnIndex) === "remainingCapital",
  );
  const crdReferenceMean = crdStats?.mean ?? Math.max(...[...columnStatsMap.values()].map((s) => s.mean), 1);

  const candidates: ColumnRoleCandidate[] = [];

  for (const stats of columnStatsMap.values()) {
    for (const role of SCORABLE_ROLES) {
      const rawScore = scoreColumnForRole(stats, role, crdReferenceMean);
      if (rawScore <= 0) continue;

      const headerRole = globalHeader.mapping.get(stats.columnIndex);
      const reason =
        headerRole === role
          ? "header_label_match"
          : refinedMapping.get(stats.columnIndex) === role
            ? "statistical_refinement"
            : "statistical_pattern";

      candidates.push({
        role: toSemanticRole(role),
        columnIndex: stats.columnIndex,
        confidence: normalizeScore(rawScore),
        reason,
      });
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);

  const preferredMapping = new Map<number, ColumnSemanticRole>();
  const usedColumns = new Set<number>();

  for (const role of SCORABLE_ROLES) {
    const best = candidates.find(
      (candidate) => candidate.role === role && !usedColumns.has(candidate.columnIndex),
    );
    if (best) {
      preferredMapping.set(best.columnIndex, best.role);
      usedColumns.add(best.columnIndex);
    }
  }

  for (const [index, role] of refinedMapping) {
    if (!preferredMapping.has(index) && SCORABLE_ROLES.includes(role)) {
      preferredMapping.set(index, toSemanticRole(role));
    }
  }

  const columnStats = [...columnStatsMap.values()]
    .sort((a, b) => a.columnIndex - b.columnIndex)
    .map((stats) => ({
      columnIndex: stats.columnIndex,
      mean: stats.mean,
      median: stats.median,
      max: stats.max,
      zeroRatio: stats.zeroRatio,
      monotonicDecreaseRatio: stats.monotonicDecreaseRatio,
      flatRatio: stats.flatRatio,
      sampleCount: stats.sampleCount,
    }));

  return {
    headerLabels: globalHeader.detectedColumns,
    candidates,
    preferredMapping,
    columnStats,
  };
}

export function preferredMappingToColumnRoleMapping(
  preferred: Map<number, ColumnSemanticRole>,
): ColumnRoleMapping {
  const mapping: ColumnRoleMapping = new Map();
  for (const [index, role] of preferred) {
    if (role !== "unknown") mapping.set(index, role as ColumnRole);
  }
  return mapping;
}
