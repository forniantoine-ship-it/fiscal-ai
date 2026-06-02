/**
 * Stage E — competing mapping hypotheses per phase segment.
 * No silent overwrites — all rejected hypotheses remain inspectable.
 */

import {
  buildColumnMedianContext,
  computeColumnNumericStats,
  mappingColumnSpan,
  refineColumnRoleMapping,
  rowToInstallment,
  type ColumnRole,
  type ColumnRoleMapping,
  type RowParsingContext,
  type SpatialInstallment,
} from "../spatial-amortization-core";
import { isDeferredInstallmentShape, isDeferredPhase } from "./stage-d-phase-detection";
import { logMergeSurvival } from "./installment-survival-debug";
import type {
  InstallmentRowRecord,
  LoanPhaseType,
  MappingHypothesesArtifact,
  MappingHypothesis,
  PhaseSegment,
} from "./types";

const DEFERRED_ZERO_EPSILON = 0.01;

function cloneMapping(mapping: ColumnRoleMapping): ColumnRoleMapping {
  return new Map(mapping);
}

function parseSegmentInstallments(
  records: InstallmentRowRecord[],
  segment: PhaseSegment,
  mapping: ColumnRoleMapping,
  parsingContext: RowParsingContext,
): SpatialInstallment[] {
  const start = segment.startInstallmentIndex ?? 0;
  const end = segment.endInstallmentIndex ?? records.length - 1;
  const segmentLength = end - start + 1;
  const headerColumnCount = mappingColumnSpan(mapping) || records[0]?.spatialRow.columns.length || 0;

  const installments: SpatialInstallment[] = new Array(segmentLength);
  let previousInstallment: SpatialInstallment | undefined;

  for (let offset = 0; offset < segmentLength; offset += 1) {
    const index = start + offset;
    const record = records[index];

    if (!record) {
      installments[offset] = {};
      continue;
    }

    const { installment } = rowToInstallment(
      record.spatialRow,
      mapping,
      headerColumnCount,
      { ...parsingContext, previousInstallment },
    );

    installments[offset] = { ...installment };
    previousInstallment = installment;
  }

  return installments;
}

function applyDeferredInsuranceEqualsPaymentHypothesis(
  installments: SpatialInstallment[],
): SpatialInstallment[] {
  return installments.map((row) => {
    const principal = row.principal ?? 0;
    const interest = row.interest ?? 0;
    if (principal > DEFERRED_ZERO_EPSILON || interest > DEFERRED_ZERO_EPSILON) {
      return { ...row };
    }

    const payment = row.payment ?? 0;
    const insurance = row.insurance ?? 0;
    const effectivePayment =
      payment > DEFERRED_ZERO_EPSILON
        ? payment
        : insurance > DEFERRED_ZERO_EPSILON
          ? insurance
          : 0;

    if (effectivePayment <= DEFERRED_ZERO_EPSILON) return { ...row };

    return {
      ...row,
      payment: effectivePayment,
      insurance: effectivePayment,
      principal: 0,
      interest: 0,
    };
  });
}

function scoreBalance(installments: SpatialInstallment[]): number {
  if (installments.length === 0) return 0;

  let valid = 0;
  let checked = 0;

  for (const row of installments) {
    const principal = row.principal ?? 0;
    const interest = row.interest ?? 0;
    if (principal <= DEFERRED_ZERO_EPSILON && interest <= DEFERRED_ZERO_EPSILON) continue;

    const payment = row.payment ?? 0;
    if (payment <= DEFERRED_ZERO_EPSILON) continue;

    checked += 1;
    const components = principal + interest + (row.insurance ?? 0);
    if (Math.abs(payment - components) <= 3) valid += 1;
  }

  return checked === 0 ? 0.5 : valid / checked;
}

function scoreCrdConsistency(installments: SpatialInstallment[]): number {
  const crdValues = installments
    .map((row) => row.remainingCapital)
    .filter((value): value is number => value !== undefined && value > 0);

  if (crdValues.length < 2) return crdValues.length === 1 ? 1 : 0;

  let consistent = 0;
  let comparable = 0;

  for (let index = 1; index < installments.length; index += 1) {
    const prev = installments[index - 1]!;
    const curr = installments[index]!;
    const prevCrd = prev.remainingCapital;
    const currCrd = curr.remainingCapital;
    const principal = curr.principal ?? 0;

    if (prevCrd === undefined || currCrd === undefined) continue;
    comparable += 1;

    const expected = prevCrd - principal;
    if (Math.abs(currCrd - expected) <= 3 || Math.abs(currCrd - prevCrd) <= 0.02) {
      consistent += 1;
    }
  }

  return comparable === 0 ? 0.5 : consistent / comparable;
}

function scoreTemporalConsistency(installments: SpatialInstallment[]): number {
  const dated = installments.filter((row) => row.date?.trim());
  if (dated.length <= 1) return dated.length === 1 ? 1 : 0;

  let monotonic = 0;
  for (let index = 1; index < dated.length; index += 1) {
    const prev = dated[index - 1]!.date!;
    const curr = dated[index]!.date!;
    if (curr >= prev) monotonic += 1;
  }

  return monotonic / (dated.length - 1);
}

function computeHypothesisConfidence(scores: {
  balance: number;
  crd: number;
  temporal: number;
}): number {
  const raw = scores.balance * 0.4 + scores.crd * 0.35 + scores.temporal * 0.25;
  return Math.round(raw * 100) / 100;
}

function buildHypothesisForSegment(
  hypothesisId: string,
  segment: PhaseSegment,
  records: InstallmentRowRecord[],
  baseMapping: ColumnRoleMapping,
  options: {
    phase: LoanPhaseType;
    heuristics: string[];
    transform?: (installments: SpatialInstallment[]) => SpatialInstallment[];
    mappingOverride?: ColumnRoleMapping;
  },
): MappingHypothesis {
  const segmentRows = records.slice(
    segment.startInstallmentIndex ?? 0,
    (segment.endInstallmentIndex ?? records.length - 1) + 1,
  );
  const calibrationRows = segmentRows.map((record) => record.spatialRow);
  const stats = computeColumnNumericStats(calibrationRows);

  const loanPhase = isDeferredPhase(segment.phase) ? "deferred" : "amortization";
  const mapping = refineColumnRoleMapping(
    options.mappingOverride ?? baseMapping,
    stats,
    { loanPhase },
  );
  const medians = buildColumnMedianContext(mapping, stats);

  const parsingContext: RowParsingContext = {
    loanPhase,
    enableDeferredHeuristics: isDeferredPhase(segment.phase),
    enableDeferredDuplicatePreservation: isDeferredPhase(segment.phase),
    preserveOrderedAmountRepeats: isDeferredPhase(segment.phase),
    columnMedians: medians,
  };

  let installments = parseSegmentInstallments(records, segment, mapping, parsingContext);
  if (options.transform) installments = options.transform(installments);

  const balanceScore = scoreBalance(installments);
  const crdConsistencyScore = scoreCrdConsistency(installments);
  const temporalConsistencyScore = scoreTemporalConsistency(installments);
  const confidence = computeHypothesisConfidence({
    balance: balanceScore,
    crd: crdConsistencyScore,
    temporal: temporalConsistencyScore,
  });

  return {
    hypothesisId,
    phase: segment.phase,
    segmentStart: segment.startInstallmentIndex ?? 0,
    segmentEnd: segment.endInstallmentIndex ?? records.length - 1,
    columnMapping: cloneMapping(mapping),
    confidence,
    balanceScore,
    crdConsistencyScore,
    temporalConsistencyScore,
    reason: options.heuristics.join(", ") || "baseline_column_mapping",
    appliedHeuristics: options.heuristics,
    installments,
    rejected: false,
    rejectionReasons: [],
  };
}

export function runStageE_MappingHypotheses(
  rowRecords: InstallmentRowRecord[],
  segments: PhaseSegment[],
  baseMapping: ColumnRoleMapping,
): MappingHypothesesArtifact {
  const hypotheses: MappingHypothesis[] = [];
  let hypothesisCounter = 0;

  for (const segment of segments) {
    const idBase = `h${hypothesisCounter++}`;

    if (isDeferredPhase(segment.phase)) {
      hypotheses.push(
        buildHypothesisForSegment(`${idBase}_deferred_insurance_eq_payment`, segment, rowRecords, baseMapping, {
          phase: segment.phase,
          heuristics: ["deferred_insurance_equals_payment", "principal_zero", "interest_zero"],
          transform: applyDeferredInsuranceEqualsPaymentHypothesis,
        }),
      );
      hypotheses.push(
        buildHypothesisForSegment(`${idBase}_deferred_baseline`, segment, rowRecords, baseMapping, {
          phase: segment.phase,
          heuristics: ["deferred_baseline_mapping"],
        }),
      );
    } else {
      hypotheses.push(
        buildHypothesisForSegment(`${idBase}_amortization_baseline`, segment, rowRecords, baseMapping, {
          phase: segment.phase,
          heuristics: ["amortization_independent_mapping"],
        }),
      );
    }
  }

  if (hypotheses.length === 0 && rowRecords.length > 0) {
    const fullSegment: PhaseSegment = {
      phase: "unknown",
      startRowIndex: rowRecords[0]!.sourceRowIndex,
      endRowIndex: rowRecords[rowRecords.length - 1]!.sourceRowIndex,
      startInstallmentIndex: 0,
      endInstallmentIndex: rowRecords.length - 1,
    };
    hypotheses.push(
      buildHypothesisForSegment("h0_fallback", fullSegment, rowRecords, baseMapping, {
        phase: "unknown",
        heuristics: ["global_fallback_mapping"],
      }),
    );
  }

  const chosenIds: string[] = [];
  const rejectedIds: string[] = [];

  for (const segment of segments) {
    const start = segment.startInstallmentIndex ?? 0;
    const end = segment.endInstallmentIndex ?? rowRecords.length - 1;

    const segmentHypotheses = hypotheses.filter(
      (h) => h.segmentStart === start && h.segmentEnd === end,
    );
    const sorted = [...segmentHypotheses].sort((a, b) => b.confidence - a.confidence);
    const chosen = sorted[0];

    if (chosen) {
      chosenIds.push(chosen.hypothesisId);
    }

    for (const hypothesis of sorted.slice(1)) {
      hypothesis.rejected = true;
      hypothesis.rejectionReasons.push("lower_confidence_than_segment_winner");
      rejectedIds.push(hypothesis.hypothesisId);
    }
  }

  if (hypotheses.length > 0 && chosenIds.length === 0) {
    const sorted = [...hypotheses].sort((a, b) => b.confidence - a.confidence);
    const chosen = sorted[0]!;
    chosenIds.push(chosen.hypothesisId);
    for (const hypothesis of sorted.slice(1)) {
      hypothesis.rejected = true;
      hypothesis.rejectionReasons.push("lower_confidence_than_chosen_hypothesis");
      rejectedIds.push(hypothesis.hypothesisId);
    }
  }

  return {
    hypotheses,
    chosenHypothesisId: chosenIds[0] ?? null,
    rejectedHypothesisIds: rejectedIds,
  };
}

const SURVIVAL_PAYMENT_TOLERANCE_EUR = 3;

function propagateResidualInsurance(row: SpatialInstallment): SpatialInstallment {
  const payment = row.payment ?? 0;
  const principal = row.principal ?? 0;
  const interest = row.interest ?? 0;
  const insurance = row.insurance ?? 0;

  if (insurance > 0 || payment <= 0) return row;

  const residual = payment - principal - interest;
  if (residual > 0.01 && residual <= payment + SURVIVAL_PAYMENT_TOLERANCE_EUR) {
    return { ...row, insurance: Math.round(residual * 100) / 100 };
  }

  return row;
}

function preserveSurvivalFields(
  hypothesisRow: SpatialInstallment,
  bootstrapRow?: SpatialInstallment,
  segmentPhase?: LoanPhaseType,
): SpatialInstallment {
  if (!bootstrapRow) {
    return propagateResidualInsurance({ ...hypothesisRow });
  }

  // Bootstrap-first: row identity and dates come from bootstrap; hypothesis overlays financials.
  const row: SpatialInstallment = { ...bootstrapRow };

  row.principal = hypothesisRow.principal ?? bootstrapRow.principal;
  row.interest = hypothesisRow.interest ?? bootstrapRow.interest;
  row.payment = hypothesisRow.payment ?? bootstrapRow.payment;
  row.insurance = hypothesisRow.insurance ?? bootstrapRow.insurance;
  row.remainingCapital = hypothesisRow.remainingCapital ?? bootstrapRow.remainingCapital;

  if (bootstrapRow.date?.trim()) {
    row.date = bootstrapRow.date;
  } else if (hypothesisRow.date?.trim()) {
    row.date = hypothesisRow.date;
  }

  const insurance = row.insurance ?? 0;
  const bootstrapInsurance = bootstrapRow.insurance ?? 0;
  if (insurance <= 0 && bootstrapInsurance > 0) {
    row.insurance = bootstrapInsurance;
  }

  const payment = row.payment ?? 0;
  const bootstrapPayment = bootstrapRow.payment ?? 0;
  if (payment <= 0 && bootstrapPayment > 0) {
    row.payment = bootstrapPayment;
  }

  if (segmentPhase && isDeferredPhase(segmentPhase)) {
    row.principal = hypothesisRow.principal ?? 0;
    row.interest = hypothesisRow.interest ?? 0;
  }

  return propagateResidualInsurance(row);
}

export function mergeSegmentInstallments(
  segments: PhaseSegment[],
  hypotheses: MappingHypothesis[],
  rowRecordCount: number,
  bootstrapInstallments: SpatialInstallment[],
): SpatialInstallment[] {
  const merged: SpatialInstallment[] = bootstrapInstallments.map((row) => ({ ...row }));
  const unfilledSlots: number[] = [];
  const bootstrapFallbackSlots: number[] = [];
  const segmentGaps: number[] = [];
  const segmentOverlayLog: Array<{
    phase: LoanPhaseType;
    start: number;
    end: number;
    hypothesisId: string | null;
    hypothesisInstallmentCount: number;
    segmentLength: number;
    datedBeforeOverlay: number;
    datedAfterOverlay: number;
    deferredBeforeOverlay: number;
    deferredAfterOverlay: number;
  }> = [];

  for (const segment of segments) {
    const start = segment.startInstallmentIndex ?? 0;
    const end = segment.endInstallmentIndex ?? rowRecordCount - 1;
    const segmentLength = end - start + 1;

    const segmentHypotheses = hypotheses.filter(
      (h) => !h.rejected && h.segmentStart === start && h.segmentEnd === end,
    );
    let best = [...segmentHypotheses].sort((a, b) => b.confidence - a.confidence)[0];

    if (!best) {
      const rejectedForSegment = hypotheses.filter(
        (h) => h.segmentStart === start && h.segmentEnd === end,
      );
      best = [...rejectedForSegment].sort((a, b) => b.confidence - a.confidence)[0];
    }

    const sliceBefore = merged.slice(start, end + 1);
    const datedBeforeOverlay = sliceBefore.filter((row) => row.date?.trim()).length;
    const deferredBeforeOverlay = sliceBefore.filter(
      (row) => isDeferredPhase(segment.phase) || isDeferredInstallmentShape(row),
    ).length;

    if (!best) {
      for (let slot = start; slot <= end; slot += 1) {
        segmentGaps.push(slot);
        bootstrapFallbackSlots.push(slot);
      }
      segmentOverlayLog.push({
        phase: segment.phase,
        start,
        end,
        hypothesisId: null,
        hypothesisInstallmentCount: 0,
        segmentLength,
        datedBeforeOverlay,
        datedAfterOverlay: datedBeforeOverlay,
        deferredBeforeOverlay,
        deferredAfterOverlay: deferredBeforeOverlay,
      });
      continue;
    }

    for (let offset = 0; offset < segmentLength; offset += 1) {
      const slot = start + offset;
      const hypothesisRow = best.installments[offset];
      const bootstrapRow = bootstrapInstallments[slot];

      if (hypothesisRow) {
        merged[slot] = preserveSurvivalFields(hypothesisRow, bootstrapRow, segment.phase);
      } else {
        segmentGaps.push(slot);
        merged[slot] = preserveSurvivalFields(bootstrapRow ?? {}, bootstrapRow, segment.phase);
        bootstrapFallbackSlots.push(slot);
      }
    }

    const sliceAfter = merged.slice(start, end + 1);
    segmentOverlayLog.push({
      phase: segment.phase,
      start,
      end,
      hypothesisId: best.hypothesisId,
      hypothesisInstallmentCount: best.installments.length,
      segmentLength,
      datedBeforeOverlay,
      datedAfterOverlay: sliceAfter.filter((row) => row.date?.trim()).length,
      deferredBeforeOverlay,
      deferredAfterOverlay: sliceAfter.filter(
        (row) => isDeferredPhase(segment.phase) || isDeferredInstallmentShape(row),
      ).length,
    });
  }

  for (let index = 0; index < rowRecordCount; index += 1) {
    if (merged[index] === undefined) {
      unfilledSlots.push(index);
      merged[index] = preserveSurvivalFields(
        bootstrapInstallments[index] ?? {},
        bootstrapInstallments[index],
      );
      bootstrapFallbackSlots.push(index);
    }
  }

  logMergeSurvival({
    rowRecordCount,
    beforeMerge: bootstrapInstallments,
    afterMerge: merged,
    unfilledSlots,
    bootstrapFallbackSlots,
    segmentGaps,
    segments,
    segmentOverlayLog,
  });

  return merged;
}

export function preferredMappingToRoleMapping(
  preferred: Map<number, string>,
): ColumnRoleMapping {
  const mapping: ColumnRoleMapping = new Map();
  for (const [index, role] of preferred) {
    mapping.set(index, role as ColumnRole);
  }
  return mapping;
}
