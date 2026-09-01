/**
 * Stage D — loan phase detection with explicit transitions.
 * Phases never mutate each other.
 */

import {
  buildPhasePlan,
  isTotalOrSubtotalRow,
  isProbableInstallmentRow,
  mappingColumnSpan,
  type ColumnRoleMapping,
  type InstallmentParseRecord,
  type SpatialInstallment,
  type SpatialTableRow,
} from "../spatial-amortization-core";
import { reconstructedRowToSpatialRow } from "./stage-b-reconstructed-rows";
import type {
  InstallmentRowRecord,
  LoanPhaseType,
  PhaseCandidatesArtifact,
  PhaseSegment,
  PhaseTransition,
  ReconstructedRow,
} from "./types";

const DEFERRED_ZERO_EPSILON = 0.01;

function mapEnginePhase(phase: "deferred" | "amortization"): LoanPhaseType {
  return phase === "deferred" ? "deferred_total" : "amortization";
}

function buildInstallmentRecords(
  reconstructedRows: ReconstructedRow[],
): InstallmentRowRecord[] {
  const records: InstallmentRowRecord[] = [];

  for (const row of reconstructedRows) {
    const spatialRow = reconstructedRowToSpatialRow(row);
    if (isTotalOrSubtotalRow(spatialRow)) continue;
    // Row candidacy uses gap-based columns — bucket slots may merge rank+date.
    if (!isProbableInstallmentRow(row.gapBasedColumns)) continue;

    records.push({
      sourceRowIndex: row.sourceRowIndex,
      row,
      spatialRow,
    });
  }

  return records;
}

function toParseRecords(
  records: InstallmentRowRecord[],
  installments: SpatialInstallment[],
): InstallmentParseRecord[] {
  return records.map((record, installmentIndex) => ({
    installmentIndex,
    sourceRowIndex: record.sourceRowIndex,
    row: record.spatialRow,
    location: {
      pdfPage: record.row.pageNumber,
      rowIndexOnPage: 0,
      rowY: record.row.y,
    },
    headerColumnCount: record.spatialRow.columns.length,
    installment: installments[installmentIndex] ?? {},
    assignmentMode: "pending",
    reconstruction: {
      rawColumns: record.spatialRow.columns,
      mergedColumns: record.spatialRow.columns,
      parsedAmounts: [],
      columnIndexes: [],
      orderedAmountsRaw: [],
      deduplicatedColumns: [],
      deduplicationApplied: null,
      repeatedAdjacentAmounts: [],
    },
  }));
}

export function runStageD_PhaseDetection(
  reconstructedRows: ReconstructedRow[],
  headerMapping: ColumnRoleMapping,
  bootstrapInstallments: SpatialInstallment[],
): { artifact: PhaseCandidatesArtifact; rowRecords: InstallmentRowRecord[] } {
  const rowRecords = buildInstallmentRecords(reconstructedRows);
  const parseRecords = toParseRecords(rowRecords, bootstrapInstallments);

  const { segments: engineSegments, transitions: engineTransitions } = buildPhasePlan(
    parseRecords,
    headerMapping,
  );

  const segments: PhaseSegment[] = engineSegments.map((segment) => ({
    phase: mapEnginePhase(segment.phase),
    startRowIndex: rowRecords[segment.start]?.sourceRowIndex ?? segment.start,
    endRowIndex: rowRecords[segment.end]?.sourceRowIndex ?? segment.end,
    startInstallmentIndex: segment.start,
    endInstallmentIndex: segment.end,
  }));

  const transitions: PhaseTransition[] = engineTransitions.map((transition) => ({
    fromPhase: mapEnginePhase(transition.previousPhase),
    toPhase: mapEnginePhase(transition.nextPhase),
    rowIndex: transition.rowIndex,
    installmentIndex: transition.installmentIndex,
    reason: transition.transitionReason,
  }));

  if (segments.length === 0 && rowRecords.length > 0) {
    segments.push({
      phase: "unknown",
      startRowIndex: rowRecords[0]!.sourceRowIndex,
      endRowIndex: rowRecords[rowRecords.length - 1]!.sourceRowIndex,
      startInstallmentIndex: 0,
      endInstallmentIndex: rowRecords.length - 1,
    });
  }

  return {
    artifact: { segments, transitions },
    rowRecords,
  };
}

export function isDeferredPhase(phase: LoanPhaseType): boolean {
  return phase === "deferred_total" || phase === "deferred_partial" || phase === "intercalary";
}

export function isDeferredInstallmentShape(installment: SpatialInstallment): boolean {
  const principal = installment.principal ?? 0;
  const interest = installment.interest ?? 0;
  if (principal > DEFERRED_ZERO_EPSILON || interest > DEFERRED_ZERO_EPSILON) return false;

  const payment = installment.payment ?? 0;
  const insurance = installment.insurance ?? 0;
  const crd = installment.remainingCapital ?? 0;

  if (crd <= 0) return false;
  const maxComponent = Math.max(payment, insurance);
  return maxComponent > 0 && maxComponent < crd * 0.5;
}
