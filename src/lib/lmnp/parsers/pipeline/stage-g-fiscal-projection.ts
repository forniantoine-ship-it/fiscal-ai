/**
 * Stage G — fiscal year projection (LMNP accounting view).
 */

import { computeFiscalYearInstallmentMetrics } from "@/lib/lmnp/services/credit-fiscal-from-installments";
import type { SpatialInstallment } from "../spatial-amortization-core";
import { spatialInstallmentsToLoanInstallments } from "../spatial-amortization-primary";
import type { FiscalProjectionArtifact, ValidatedInstallment } from "./types";

function inferLoanAmount(installments: SpatialInstallment[]): number | undefined {
  for (const row of installments) {
    if (row.remainingCapital !== undefined && row.remainingCapital > 0) {
      return row.remainingCapital;
    }
  }
  const crds = installments
    .map((row) => row.remainingCapital)
    .filter((value): value is number => value !== undefined && value > 0);
  return crds.length > 0 ? Math.max(...crds) : undefined;
}

export function runStageG_FiscalProjection(
  validatedInstallments: ValidatedInstallment[],
  fiscalYear: number,
): FiscalProjectionArtifact {
  const spatialRows = validatedInstallments.map((row) => row.installment);
  const loanInstallments = spatialInstallmentsToLoanInstallments(spatialRows);
  const loanAmount = inferLoanAmount(spatialRows);

  const metrics = computeFiscalYearInstallmentMetrics(loanInstallments, fiscalYear, loanAmount);

  const validRows = validatedInstallments.filter((row) => row.status === "valid");
  const validRatio = validatedInstallments.length > 0 ? validRows.length / validatedInstallments.length : 0;

  const fiscalRows = metrics.fiscalYearInstallments;
  const yearlyPrincipal = fiscalRows.reduce((sum, row) => sum + (row.principal ?? 0), 0);

  const crdConfidence =
    metrics.remainingCapitalAtYearEnd !== undefined ? Math.min(1, validRatio + 0.1) : validRatio * 0.5;

  return {
    fiscalYear,
    yearlyInterest: Math.round(metrics.annualInterest * 100) / 100,
    yearlyInsurance: Math.round(metrics.annualInsurance * 100) / 100,
    yearlyPrincipal: Math.round(yearlyPrincipal * 100) / 100,
    crdYearEnd: metrics.remainingCapitalAtYearEnd,
    crdAsOf: metrics.remainingCapitalAsOf,
    installmentCountInYear: fiscalRows.length,
    confidence: {
      interests: Math.round(validRatio * 100) / 100,
      insurance: Math.round(validRatio * 95) / 100,
      crd: Math.round(crdConfidence * 100) / 100,
      overall: Math.round(validRatio * 100) / 100,
    },
  };
}
