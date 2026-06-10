/**
 * Final installment visibility audit — spatial → loan → UI form.
 * No row is dropped silently; every exclusion is logged with reason.
 */

import type { CreditAmortizationExtraction } from "@/lib/documents/gpt/schemas/credit-amortization.schema";
import { normalizeDate } from "@/lib/documents/gpt/schemas/logement-acte.schema";
import type { SpatialInstallment } from "@/lib/lmnp/parsers/spatial-amortization-core";
import type { LoanInstallment } from "@/lib/lmnp/types";

const LOG_PREFIX = "[installment-visibility-debug]";

export type InstallmentPhaseKind = "deferred" | "amortizing" | "interest_only" | "unknown";

export type InstallmentVisibilityExclusion = {
  index: number;
  reason: string;
  date?: string | null;
  payment?: number | null;
  principal?: number | null;
  interest?: number | null;
  insurance?: number | null;
};

export type InstallmentVisibilityAudit = {
  spatialInputCount: number;
  loanOutputCount: number;
  excludedCount: number;
  deferredSpatialCount: number;
  deferredLoanCount: number;
  amortizingSpatialCount: number;
  amortizingLoanCount: number;
  insuranceBearingLoanCount: number;
  uniqueDateCount: number;
  duplicateDateSlots: number;
  byPhase: Record<InstallmentPhaseKind, number>;
  exclusions: InstallmentVisibilityExclusion[];
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoInstallmentDate(date: string | undefined | null): boolean {
  return Boolean(date?.trim() && ISO_DATE_RE.test(date.trim()));
}

export function classifySpatialInstallmentPhase(row: SpatialInstallment): InstallmentPhaseKind {
  const principal = row.principal ?? 0;
  const interest = row.interest ?? 0;
  const insurance = row.insurance ?? 0;
  const payment = row.payment ?? 0;

  if (principal <= 0 && interest <= 0 && (payment > 0 || insurance > 0)) {
    return "deferred";
  }
  if (principal <= 0 && interest > 0) {
    return "interest_only";
  }
  if (principal > 0) {
    return "amortizing";
  }
  return "unknown";
}

export function classifyLoanInstallmentPhase(row: LoanInstallment): InstallmentPhaseKind {
  const principal = row.principal ?? 0;
  const interest = row.interest ?? 0;
  const insurance = row.insurance ?? 0;
  const payment = row.totalPayment ?? 0;

  if (principal <= 0 && interest <= 0 && (payment > 0 || insurance > 0)) {
    return "deferred";
  }
  if (principal <= 0 && interest > 0) {
    return "interest_only";
  }
  if (principal > 0) {
    return "amortizing";
  }
  return "unknown";
}

function propagateInsuranceFromPayment(row: LoanInstallment): LoanInstallment {
  if (row.insurance > 0) return row;

  const payment = row.totalPayment ?? 0;
  const principal = row.principal ?? 0;
  const interest = row.interest ?? 0;
  if (payment <= 0) return row;

  const residual = payment - principal - interest;
  if (residual <= 0.01) return row;

  return { ...row, insurance: Math.round(residual * 100) / 100 };
}

/**
 * Converts spatial rows to loan installments for UI/fiscal output.
 * Includes deferred/intercalary rows; never filters by validation status.
 */
export function spatialRowsToVisibleLoanInstallments(
  spatialRows: SpatialInstallment[],
): { installments: LoanInstallment[]; exclusions: InstallmentVisibilityExclusion[] } {
  const installments: LoanInstallment[] = [];
  const exclusions: InstallmentVisibilityExclusion[] = [];

  for (let index = 0; index < spatialRows.length; index += 1) {
    const row = spatialRows[index]!;
    const normalizedDate = normalizeDate(row.date);

    if (!normalizedDate) {
      exclusions.push({
        index,
        reason: row.date?.trim() ? "unparseable_date_at_loan_bridge" : "missing_date_at_loan_bridge",
        date: row.date ?? null,
        payment: row.payment ?? null,
        principal: row.principal ?? null,
        interest: row.interest ?? null,
        insurance: row.insurance ?? null,
      });
      continue;
    }

    const phase = classifySpatialInstallmentPhase(row);
    const loanRow = propagateInsuranceFromPayment({
      date: normalizedDate,
      totalPayment: row.payment ?? 0,
      principal: row.principal ?? 0,
      interest: row.interest ?? 0,
      insurance: row.insurance ?? 0,
      fees: 0,
      comment:
        phase === "deferred"
          ? "Différé / intercalaire"
          : phase === "interest_only"
            ? "Intérêts seuls"
            : undefined,
    });

    installments.push(loanRow);
  }

  installments.sort((a, b) => a.date.localeCompare(b.date));
  return { installments, exclusions };
}

export function buildInstallmentVisibilityAudit(params: {
  spatialRows: SpatialInstallment[];
  loanInstallments: LoanInstallment[];
  exclusions: InstallmentVisibilityExclusion[];
}): InstallmentVisibilityAudit {
  const { spatialRows, loanInstallments, exclusions } = params;

  const byPhase: Record<InstallmentPhaseKind, number> = {
    deferred: 0,
    amortizing: 0,
    interest_only: 0,
    unknown: 0,
  };

  for (const row of loanInstallments) {
    byPhase[classifyLoanInstallmentPhase(row)] += 1;
  }

  let deferredSpatialCount = 0;
  let amortizingSpatialCount = 0;
  for (const row of spatialRows) {
    const phase = classifySpatialInstallmentPhase(row);
    if (phase === "deferred") deferredSpatialCount += 1;
    if (phase === "amortizing") amortizingSpatialCount += 1;
  }

  return {
    spatialInputCount: spatialRows.length,
    loanOutputCount: loanInstallments.length,
    excludedCount: exclusions.length,
    deferredSpatialCount,
    deferredLoanCount: byPhase.deferred,
    amortizingSpatialCount,
    amortizingLoanCount: byPhase.amortizing,
    insuranceBearingLoanCount: loanInstallments.filter((row) => row.insurance > 0).length,
    uniqueDateCount: new Set(loanInstallments.map((row) => row.date)).size,
    duplicateDateSlots: loanInstallments.length - new Set(loanInstallments.map((row) => row.date)).size,
    byPhase,
    exclusions: exclusions.slice(0, 30),
  };
}

export function logInstallmentVisibilityAudit(
  stage: string,
  audit: InstallmentVisibilityAudit,
  extra?: Record<string, unknown>,
): void {
  console.log(LOG_PREFIX, stage, {
    ...audit,
    visibleRowCount: audit.loanOutputCount,
    deferredSurvivalRatio:
      audit.deferredSpatialCount > 0
        ? audit.deferredLoanCount / audit.deferredSpatialCount
        : null,
    ...extra,
  });
}

export function logUiInstallmentVisibility(params: {
  sessionInstallmentCount: number;
  formInstallmentCount: number;
  displayInstallmentCount: number;
  revenueYear: number;
  extraction?: CreditAmortizationExtraction;
}): void {
  const extractionInstallments = params.extraction?.installments ?? [];
  const byPhase: Record<InstallmentPhaseKind, number> = {
    deferred: 0,
    amortizing: 0,
    interest_only: 0,
    unknown: 0,
  };

  for (const row of extractionInstallments) {
    byPhase[classifyLoanInstallmentPhase(row)] += 1;
  }

  console.log(LOG_PREFIX, "ui_installment_visibility", {
    revenueYear: params.revenueYear,
    sessionInstallmentCount: params.sessionInstallmentCount,
    formInstallmentCount: params.formInstallmentCount,
    displayInstallmentCount: params.displayInstallmentCount,
    extractionInstallmentCount: extractionInstallments.length,
    uniqueDateCount: new Set(extractionInstallments.map((row) => row.date)).size,
    duplicateDateSlots:
      extractionInstallments.length - new Set(extractionInstallments.map((row) => row.date)).size,
    yearlyInsurance: params.extraction?.yearlyInsuranceTotal ?? null,
    yearlyInterest: params.extraction?.yearlyInterestTotal ?? null,
    byPhase,
    sampleFirst: extractionInstallments.slice(0, 3),
    sampleLast: extractionInstallments.slice(-3),
    renderNote:
      "If duplicateDateSlots > 0, React table keys by date may show fewer visible rows than array length",
  });
}
