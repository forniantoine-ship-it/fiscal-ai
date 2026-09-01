import type { LoanDeferralType, LoanInstallment } from "@/lib/lmnp/types";

export type FiscalYearInstallmentMetrics = {
  fiscalYear: number;
  annualInterest: number;
  annualInsurance: number;
  /** Capital restant dû at the last installment of the fiscal year, when computable. */
  remainingCapitalAtYearEnd?: number;
  remainingCapitalAsOf?: string;
  fiscalYearInstallments: LoanInstallment[];
};

function parseInstallmentYear(date: string): number | undefined {
  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed).getUTCFullYear();
}

export function filterInstallmentsForFiscalYear(
  installments: LoanInstallment[],
  fiscalYear: number,
): LoanInstallment[] {
  return installments
    .filter((row) => parseInstallmentYear(row.date) === fiscalYear)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function sumAnnualInterest(installments: LoanInstallment[], fiscalYear: number): number {
  return filterInstallmentsForFiscalYear(installments, fiscalYear).reduce(
    (total, row) => total + (row.interest ?? 0),
    0,
  );
}

export function sumAnnualInsurance(installments: LoanInstallment[], fiscalYear: number): number {
  return filterInstallmentsForFiscalYear(installments, fiscalYear).reduce(
    (total, row) => total + (row.insurance ?? 0),
    0,
  );
}

/** First installment with capital reimbursement (excludes prefinancing / interest-only rows). */
export function findFirstAmortizingInstallment(
  installments: LoanInstallment[],
): LoanInstallment | undefined {
  return [...installments]
    .sort((a, b) => a.date.localeCompare(b.date))
    .find((row) => row.principal > 0);
}

export function detectDeferralTypeFromInstallments(
  installments: LoanInstallment[],
): LoanDeferralType {
  const sorted = [...installments].sort((a, b) => a.date.localeCompare(b.date));
  const interestOnlyRows = sorted.filter((row) => row.principal <= 0 && row.interest > 0);
  const amortizingRows = sorted.filter((row) => row.principal > 0);

  if (interestOnlyRows.length === 0) return "none";
  if (amortizingRows.length === 0) return "total";

  const hasPrefinancingComment = interestOnlyRows.some((row) =>
    /prefinancement|pr[eé]financement|franchise|diff[eé]r/i.test(row.comment ?? ""),
  );
  if (hasPrefinancingComment && amortizingRows.length > 0) return "partial";

  const hasFranchisePattern = interestOnlyRows.some(
    (row) => row.interest <= 0 && row.insurance > 0,
  );
  if (hasFranchisePattern) return "franchise";

  return "partial";
}

/**
 * Estimates CRD at year-end from installment progression when explicit CRD is unavailable.
 * Uses loanAmount minus cumulative principal through the fiscal year.
 */
export function estimateRemainingCapitalAtYearEnd(
  installments: LoanInstallment[],
  fiscalYear: number,
  loanAmount?: number,
): { amount?: number; asOf?: string } {
  const fiscalRows = filterInstallmentsForFiscalYear(installments, fiscalYear);
  if (!fiscalRows.length) return {};

  const lastRow = fiscalRows[fiscalRows.length - 1]!;
  const asOf = lastRow.date;

  if (loanAmount !== undefined && loanAmount > 0) {
    const allPrior = [...installments]
      .filter((row) => row.date <= lastRow.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    const reimbursed = allPrior.reduce((sum, row) => sum + (row.principal ?? 0), 0);
    return { amount: Math.max(0, loanAmount - reimbursed), asOf };
  }

  return { asOf };
}

export function computeFiscalYearInstallmentMetrics(
  installments: LoanInstallment[],
  fiscalYear: number,
  loanAmount?: number,
): FiscalYearInstallmentMetrics {
  const fiscalYearInstallments = filterInstallmentsForFiscalYear(installments, fiscalYear);
  const annualInterest = sumAnnualInterest(installments, fiscalYear);
  const annualInsurance = sumAnnualInsurance(installments, fiscalYear);
  const crd = estimateRemainingCapitalAtYearEnd(installments, fiscalYear, loanAmount);

  return {
    fiscalYear,
    annualInterest,
    annualInsurance,
    remainingCapitalAtYearEnd: crd.amount,
    remainingCapitalAsOf: crd.asOf,
    fiscalYearInstallments,
  };
}

export function averageMonthlyInsurance(
  installments: LoanInstallment[],
  fiscalYear: number,
): number | undefined {
  const rows = filterInstallmentsForFiscalYear(installments, fiscalYear).filter(
    (row) => row.insurance > 0,
  );
  if (!rows.length) return undefined;
  const total = rows.reduce((sum, row) => sum + row.insurance, 0);
  return Math.round(total / rows.length);
}
