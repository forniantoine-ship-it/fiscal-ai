/**
 * Stage F — financial validation without row deletion.
 * Rows failing validation are marked, never removed.
 */

import type { SpatialInstallment } from "../spatial-amortization-core";
import { isDeferredInstallmentShape } from "./stage-d-phase-detection";
import type {
  FinancialValidationArtifact,
  LoanPhaseType,
  MappingHypothesis,
  RowValidationStatus,
  ValidatedInstallment,
} from "./types";

const BALANCE_TOLERANCE_EUR = 3;
const DEFERRED_ZERO_EPSILON = 0.01;

function validateRow(
  installment: SpatialInstallment,
  phase: LoanPhaseType,
  previous?: SpatialInstallment,
): { status: RowValidationStatus; errors: string[]; confidence: number } {
  const errors: string[] = [];

  if (!installment.date?.trim()) {
    errors.push("missing_date");
  }

  const principal = installment.principal ?? 0;
  const interest = installment.interest ?? 0;
  const payment = installment.payment ?? 0;
  const insurance = installment.insurance ?? 0;
  const crd = installment.remainingCapital;

  const isDeferred =
    phase === "deferred_total" ||
    phase === "deferred_partial" ||
    phase === "intercalary" ||
    isDeferredInstallmentShape(installment);

  if (isDeferred) {
    if (Math.abs(principal) > DEFERRED_ZERO_EPSILON) errors.push("deferred_phase_nonzero_principal");
    if (Math.abs(interest) > DEFERRED_ZERO_EPSILON) errors.push("deferred_phase_nonzero_interest");
  }

  if (payment > DEFERRED_ZERO_EPSILON && (principal > 0 || interest > 0)) {
    const components = principal + interest + insurance;
    if (Math.abs(payment - components) > BALANCE_TOLERANCE_EUR) {
      errors.push("payment_balance_mismatch");
    }
  }

  if (insurance > payment + BALANCE_TOLERANCE_EUR && payment > 0) {
    errors.push("insurance_exceeds_payment");
  }

  if (crd !== undefined && payment > 0 && payment >= crd * 0.5) {
    errors.push("payment_resembles_crd_scale");
  }

  if (previous?.remainingCapital !== undefined && crd !== undefined && principal > 0) {
    const expected = previous.remainingCapital - principal;
    if (Math.abs(crd - expected) > BALANCE_TOLERANCE_EUR) {
      errors.push("crd_continuity_mismatch");
    }
  }

  if (previous?.date && installment.date && installment.date < previous.date) {
    errors.push("temporal_regression");
  }

  let status: RowValidationStatus = "valid";
  if (errors.length === 0) {
    status = "valid";
  } else if (errors.some((e) => e.includes("missing"))) {
    status = "unclassified";
  } else if (errors.length >= 2) {
    status = "invalid";
  } else {
    status = "ambiguous";
  }

  const confidence = Math.max(0, 1 - errors.length * 0.2);

  return { status, errors, confidence };
}

export function runStageF_FinancialValidation(
  rowRecords: Array<{ sourceRowIndex: number; phase: LoanPhaseType }>,
  chosenHypotheses: MappingHypothesis[],
  mergedInstallments: SpatialInstallment[],
): FinancialValidationArtifact {
  const chosenBySegment = chosenHypotheses.filter((h) => !h.rejected);
  const hypothesisId =
    chosenBySegment.sort((a, b) => b.confidence - a.confidence)[0]?.hypothesisId ?? "unknown";

  const validated: ValidatedInstallment[] = [];
  let invalidRowCount = 0;
  let ambiguousRowCount = 0;
  let balanceSum = 0;
  let crdSum = 0;
  let temporalSum = 0;

  for (let index = 0; index < mergedInstallments.length; index += 1) {
    const installment = mergedInstallments[index]!;
    const record = rowRecords[index];
    const previous = index > 0 ? mergedInstallments[index - 1] : undefined;

    const { status, errors, confidence } = validateRow(
      installment,
      record?.phase ?? "unknown",
      previous,
    );

    if (status === "invalid") invalidRowCount += 1;
    if (status === "ambiguous") ambiguousRowCount += 1;

    validated.push({
      installment,
      sourceRowIndex: record?.sourceRowIndex ?? index,
      phase: record?.phase ?? "unknown",
      status,
      validationErrors: errors,
      confidence,
      hypothesisId,
    });
  }

  for (const hypothesis of chosenBySegment) {
    balanceSum += hypothesis.balanceScore;
    crdSum += hypothesis.crdConsistencyScore;
    temporalSum += hypothesis.temporalConsistencyScore;
  }

  const count = Math.max(chosenBySegment.length, 1);

  return {
    installments: validated,
    aggregateBalanceScore: balanceSum / count,
    aggregateCrdConsistencyScore: crdSum / count,
    aggregateTemporalScore: temporalSum / count,
    invalidRowCount,
    ambiguousRowCount,
  };
}
