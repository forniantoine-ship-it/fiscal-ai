/**
 * Debug harness: installment survival from pipeline → loan → fiscal output.
 * Run: npx tsx src/lib/lmnp/parsers/pipeline/debug-installment-survival.ts [.pdf]
 */

import { parseSpatialAmortizationPdf } from "../spatial-amortization-node";
import {
  buildSpatialPrimaryGptResult,
  spatialInstallmentsToLoanInstallments,
} from "../spatial-amortization-primary";
import { filterInstallmentsForFiscalYear } from "@/lib/lmnp/services/credit-fiscal-from-installments";

async function main() {
  const pdfPath = process.argv[2] ?? ".tmp/spatial-bench/test.pdf";
  const result = await parseSpatialAmortizationPdf(pdfPath);
  const loan = spatialInstallmentsToLoanInstallments(result.installments);

  const byYear: Record<string, number> = {};
  for (const row of loan) {
    const y = row.date.slice(0, 4);
    byYear[y] = (byYear[y] ?? 0) + 1;
  }

  const deferred = loan.filter((r) => r.principal === 0 && r.interest === 0);
  const amortizing = loan.filter((r) => r.principal > 0);
  const withInsurance = loan.filter((r) => r.insurance > 0);
  const fy2025 = filterInstallmentsForFiscalYear(loan, 2025);
  const uniqueDates = new Set(loan.map((r) => r.date));

  console.log("[installment-survival-debug] pipeline_to_loan", {
    rawCount: result.installments.length,
    loanCount: loan.length,
    byYear,
    deferredCount: deferred.length,
    amortizingCount: amortizing.length,
    insuranceCount: withInsurance.length,
    fy2025Count: fy2025.length,
    uniqueDateCount: uniqueDates.size,
    duplicateDateSlots: loan.length - uniqueDates.size,
    sampleDeferred: deferred.slice(0, 2),
    sampleAmort: amortizing.slice(0, 2),
    fy2025Sample: fy2025.map((r) => ({
      date: r.date,
      principal: r.principal,
      interest: r.interest,
      insurance: r.insurance,
      totalPayment: r.totalPayment,
    })),
  });

  const gpt = buildSpatialPrimaryGptResult(result, 2025, { success: true, extraction: {} });
  console.log("[installment-survival-debug] buildSpatialPrimaryGptResult", {
    extractionInstallmentCount: gpt.extraction.installments?.length ?? 0,
    yearlyInsurance: gpt.extraction.yearlyInsuranceTotal,
    yearlyInterest: gpt.extraction.yearlyInterestTotal,
    remainingPrincipal: gpt.extraction.remainingPrincipal,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
