/**
 * Installment survival instrumentation — Stage E merge, Stage F validation, UI bridge.
 */

import type { SpatialInstallment } from "../spatial-amortization-core";
import { isDeferredInstallmentShape, isDeferredPhase } from "./stage-d-phase-detection";
import type { LoanPhaseType, PhaseSegment, ValidatedInstallment } from "./types";

const LOG_PREFIX = "[installment-survival-debug]";

export type InstallmentSurvivalCounts = {
  total: number;
  dated: number;
  undated: number;
  deferred: number;
  amortizing: number;
  insuranceBearing: number;
  withPayment: number;
};

function isDeferredRow(row: SpatialInstallment, phase?: LoanPhaseType): boolean {
  return (
    phase === "deferred_total" ||
    phase === "deferred_partial" ||
    phase === "intercalary" ||
    isDeferredInstallmentShape(row)
  );
}

export function countInstallmentSurvival(
  installments: SpatialInstallment[],
  phaseByIndex?: Array<LoanPhaseType | undefined>,
): InstallmentSurvivalCounts {
  let dated = 0;
  let deferred = 0;
  let amortizing = 0;
  let insuranceBearing = 0;
  let withPayment = 0;

  for (let index = 0; index < installments.length; index += 1) {
    const row = installments[index]!;
    if (row.date?.trim()) dated += 1;

    const principal = row.principal ?? 0;
    const interest = row.interest ?? 0;
    const insurance = row.insurance ?? 0;
    const payment = row.payment ?? 0;

    if (insurance > 0) insuranceBearing += 1;
    if (payment > 0) withPayment += 1;

    const phase = phaseByIndex?.[index];
    if (isDeferredRow(row, phase)) {
      deferred += 1;
    } else if (principal > 0) {
      amortizing += 1;
    }
  }

  return {
    total: installments.length,
    dated,
    undated: installments.length - dated,
    deferred,
    amortizing,
    insuranceBearing,
    withPayment,
  };
}

export function countDeferredInSegments(
  installments: SpatialInstallment[],
  segments: PhaseSegment[],
): { deferredRowCount: number; amortizationRowCount: number; segmentBreakdown: Array<Record<string, unknown>> } {
  let deferredRowCount = 0;
  let amortizationRowCount = 0;
  const segmentBreakdown: Array<Record<string, unknown>> = [];

  for (const segment of segments) {
    const start = segment.startInstallmentIndex ?? 0;
    const end = segment.endInstallmentIndex ?? installments.length - 1;
    const slice = installments.slice(start, end + 1);
    const datedInSegment = slice.filter((row) => row.date?.trim()).length;
    const deferredInSegment = slice.filter((row) =>
      isDeferredRow(row, segment.phase),
    ).length;
    const amortizingInSegment = slice.filter((row) => (row.principal ?? 0) > 0).length;

    if (isDeferredPhase(segment.phase)) {
      deferredRowCount += slice.length;
    } else if (segment.phase === "amortization") {
      amortizationRowCount += slice.length;
    }

    segmentBreakdown.push({
      phase: segment.phase,
      start,
      end,
      rowCount: slice.length,
      datedInSegment,
      deferredInSegment,
      amortizingInSegment,
    });
  }

  return { deferredRowCount, amortizationRowCount, segmentBreakdown };
}

export function logDeferredSurvivalTimeline(params: {
  checkpoint: string;
  installments: SpatialInstallment[];
  segments?: PhaseSegment[];
  phaseByIndex?: Array<LoanPhaseType | undefined>;
  extra?: Record<string, unknown>;
}): InstallmentSurvivalCounts {
  const counts = countInstallmentSurvival(params.installments, params.phaseByIndex);
  const segmentStats = params.segments
    ? countDeferredInSegments(params.installments, params.segments)
    : null;

  console.log(LOG_PREFIX, "deferred_survival_timeline", {
    checkpoint: params.checkpoint,
    deferredRowCount: counts.deferred,
    datedRowCount: counts.dated,
    undatedRowCount: counts.undated,
    totalRowCount: counts.total,
    amortizingRowCount: counts.amortizing,
    insuranceBearingRowCount: counts.insuranceBearing,
    segmentDeferredRowCount: segmentStats?.deferredRowCount ?? null,
    segmentAmortizationRowCount: segmentStats?.amortizationRowCount ?? null,
    segmentBreakdown: segmentStats?.segmentBreakdown ?? null,
    ...params.extra,
  });

  return counts;
}

export function logInstallmentSurvivalStage(
  stage: string,
  installments: SpatialInstallment[],
  extra?: Record<string, unknown>,
): InstallmentSurvivalCounts {
  const counts = countInstallmentSurvival(installments);
  console.log(LOG_PREFIX, stage, { ...counts, ...extra });
  return counts;
}

export function logMergeSurvival(params: {
  rowRecordCount: number;
  beforeMerge: SpatialInstallment[];
  afterMerge: SpatialInstallment[];
  unfilledSlots: number[];
  bootstrapFallbackSlots: number[];
  segmentGaps: number[];
  segments?: PhaseSegment[];
  segmentOverlayLog?: Array<Record<string, unknown>>;
}): void {
  const before = countInstallmentSurvival(params.beforeMerge);
  const after = countInstallmentSurvival(params.afterMerge);
  const beforeSegments = params.segments
    ? countDeferredInSegments(params.beforeMerge, params.segments)
    : null;
  const afterSegments = params.segments
    ? countDeferredInSegments(params.afterMerge, params.segments)
    : null;

  console.log(LOG_PREFIX, "stage_e_merge", {
    rowRecordCount: params.rowRecordCount,
    deferredRowCountBeforeMerge: before.deferred,
    deferredRowCountAfterMerge: after.deferred,
    datedRowCountBeforeMerge: before.dated,
    datedRowCountAfterMerge: after.dated,
    before,
    after,
    rowCountDelta: after.total - before.total,
    datedRowCountDelta: after.dated - before.dated,
    deferredRowCountDelta: after.deferred - before.deferred,
    unfilledSlotCount: params.unfilledSlots.length,
    bootstrapFallbackCount: params.bootstrapFallbackSlots.length,
    segmentGapCount: params.segmentGaps.length,
    segmentDeferredBeforeMerge: beforeSegments?.deferredRowCount ?? null,
    segmentDeferredAfterMerge: afterSegments?.deferredRowCount ?? null,
    segmentBreakdownAfterMerge: afterSegments?.segmentBreakdown ?? null,
    segmentOverlayLog: params.segmentOverlayLog ?? null,
    unfilledSample: params.unfilledSlots.slice(0, 10),
    bootstrapFallbackSample: params.bootstrapFallbackSlots.slice(0, 10),
    segmentGapSample: params.segmentGaps.slice(0, 10),
  });
}

export function logValidationSurvival(validated: ValidatedInstallment[]): void {
  const byStatus: Record<string, number> = {};
  const errorReasonCounts: Record<string, number> = {};
  const rejectionSamples: Array<{ index: number; status: string; errors: string[]; date?: string }> =
    [];

  for (let index = 0; index < validated.length; index += 1) {
    const row = validated[index]!;
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;

    for (const error of row.validationErrors) {
      errorReasonCounts[error] = (errorReasonCounts[error] ?? 0) + 1;
    }

    if (row.status !== "valid" && rejectionSamples.length < 20) {
      rejectionSamples.push({
        index,
        status: row.status,
        errors: row.validationErrors,
        date: row.installment.date,
      });
    }
  }

  const installments = validated.map((row) => row.installment);
  const counts = countInstallmentSurvival(
    installments,
    validated.map((row) => row.phase),
  );

  const deferredByStatus: Record<string, number> = {};
  for (const row of validated) {
    if (!isDeferredRow(row.installment, row.phase)) continue;
    deferredByStatus[row.status] = (deferredByStatus[row.status] ?? 0) + 1;
  }

  console.log(LOG_PREFIX, "stage_f_validation", {
    total: validated.length,
    deferredRowCountAfterValidation: counts.deferred,
    datedRowCountAfterValidation: counts.dated,
    byStatus,
    deferredByStatus,
    errorReasonCounts,
    survival: counts,
    rejectionSamples,
    note: "invalid_and_ambiguous_rows_are_not_removed_from_merged_output",
  });
}

export function logLoanBridgeSurvival(params: {
  spatialCount: number;
  loanCount: number;
  droppedUndated: number;
  spatial: InstallmentSurvivalCounts;
  loanInsuranceBearing: number;
  deferredRowCountAtLoanBridge?: number;
}): void {
  console.log(LOG_PREFIX, "spatialInstallmentsToLoanInstallments", {
    ...params,
    deferredRowCountAtLoanBridge: params.deferredRowCountAtLoanBridge ?? null,
  });
}

export function logBuildSpatialPrimarySurvival(params: {
  spatialRaw: InstallmentSurvivalCounts;
  loanCount: number;
  datedLoanCount: number;
  yearlyInsurance?: number;
  yearlyInterest?: number;
  deferredRowCountAtLoanBridge?: number;
}): void {
  console.log(LOG_PREFIX, "buildSpatialPrimaryGptResult", params);
}
