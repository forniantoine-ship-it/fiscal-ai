/**
 * Spatial-first amortization extraction for the browser credit pipeline.
 * No Node.js APIs — safe for client bundles.
 */

import type { CreditAmortizationExtraction } from "@/lib/documents/gpt/schemas/credit-amortization.schema";
import type { CreditAmortizationGptExtractionResult } from "@/lib/documents/gpt/extract-credit-amortization-with-gpt";
import {
  computeFiscalYearInstallmentMetrics,
  findFirstAmortizingInstallment,
} from "@/lib/lmnp/services/credit-fiscal-from-installments";
import {
  attachAmortizationSupervision,
  buildAmortizationSupervision,
  buildStructuralFailureSupervision,
} from "@/lib/lmnp/services/amortization-supervision";
import type { LoanInstallment } from "@/lib/lmnp/types";

import type { SpatialAmortizationParseResult, SpatialInstallment } from "./spatial-amortization-core";
import {
  countInstallmentSurvival,
  logBuildSpatialPrimarySurvival,
} from "./pipeline/installment-survival-debug";
import {
  buildInstallmentVisibilityAudit,
  classifyLoanInstallmentPhase,
  logInstallmentVisibilityAudit,
  spatialRowsToVisibleLoanInstallments,
} from "@/lib/lmnp/services/credit-installment-visibility";

/** @deprecated Internal diagnostics only — never gates UI table selection. */
export const SPATIAL_PRIMARY_MIN_CONFIDENCE = 80;
/** @deprecated Internal diagnostics only — never gates UI table selection. */
export const SPATIAL_PRIMARY_MIN_INSTALLMENTS = 12;

export type SpatialPrimarySource = "spatial" | "structural_failure";

export type SpatialFinancialTruthDecision = {
  useSpatial: boolean;
  reason: string;
  visibleLoanInstallmentCount: number;
  parserConfidence: number | null;
};

const LOG_PRIMARY = "[spatial-parser-primary]";

export function spatialInstallmentsToLoanInstallments(
  spatialRows: SpatialInstallment[],
): LoanInstallment[] {
  const spatialCounts = countInstallmentSurvival(spatialRows);
  const { installments, exclusions } = spatialRowsToVisibleLoanInstallments(spatialRows);

  const audit = buildInstallmentVisibilityAudit({
    spatialRows,
    loanInstallments: installments,
    exclusions,
  });

  logInstallmentVisibilityAudit("spatialInstallmentsToLoanInstallments", audit, {
    spatialSurvival: spatialCounts,
    deferredRowCountAtLoanBridge: audit.deferredLoanCount,
    droppedMissingDate: exclusions.filter((row) => row.reason === "missing_date_at_loan_bridge").length,
    droppedUnparseableDate: exclusions.filter((row) => row.reason === "unparseable_date_at_loan_bridge")
      .length,
    exclusionSample: exclusions.slice(0, 10),
  });

  return installments;
}

function inferLoanAmountFromSpatial(spatialRows: SpatialInstallment[]): number | undefined {
  const dated = spatialRows
    .filter((row) => row.date)
    .sort((a, b) => a.date!.localeCompare(b.date!));

  for (const row of dated) {
    if (row.remainingCapital !== undefined && row.remainingCapital > 0) {
      return row.remainingCapital;
    }
  }

  const crdValues = spatialRows
    .map((row) => row.remainingCapital)
    .filter((value): value is number => value !== undefined && value > 0);

  return crdValues.length > 0 ? Math.max(...crdValues) : undefined;
}

function inferLoanDurationMonths(installments: LoanInstallment[]): number | undefined {
  if (installments.length === 0) return undefined;
  if (installments.length === 1) return 1;

  const sorted = [...installments].sort((a, b) => a.date.localeCompare(b.date));
  const first = new Date(sorted[0]!.date);
  const last = new Date(sorted[sorted.length - 1]!.date);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) {
    return installments.length;
  }

  const monthSpan =
    (last.getUTCFullYear() - first.getUTCFullYear()) * 12 +
    (last.getUTCMonth() - first.getUTCMonth()) +
    1;

  return Math.max(installments.length, monthSpan);
}

function remainingCapitalAtFiscalYearEnd(
  spatialRows: SpatialInstallment[],
  installments: LoanInstallment[],
  fiscalYear: number,
): number | undefined {
  const yearPrefix = `${fiscalYear}-`;
  const inYear = spatialRows.filter((row) => row.date?.startsWith(yearPrefix));

  for (let index = inYear.length - 1; index >= 0; index -= 1) {
    const crd = inYear[index]?.remainingCapital;
    if (crd !== undefined && crd >= 0) return crd;
  }

  const dated = spatialRows
    .filter((row) => row.date && row.remainingCapital !== undefined)
    .sort((a, b) => a.date!.localeCompare(b.date!));

  const last = dated[dated.length - 1];
  if (last?.remainingCapital !== undefined) return last.remainingCapital;

  const metrics = computeFiscalYearInstallmentMetrics(
    installments,
    fiscalYear,
    inferLoanAmountFromSpatial(spatialRows),
  );
  return metrics.remainingCapitalAtYearEnd;
}

export function buildCreditAmortizationFromSpatial(
  spatial: SpatialAmortizationParseResult,
  revenueYear: number,
): CreditAmortizationExtraction {
  const installments = spatialInstallmentsToLoanInstallments(spatial.installments);
  const loanAmount = inferLoanAmountFromSpatial(spatial.installments);
  const metrics = computeFiscalYearInstallmentMetrics(installments, revenueYear, loanAmount);
  const firstAmortizing = findFirstAmortizingInstallment(installments);
  const sorted = [...installments].sort((a, b) => a.date.localeCompare(b.date));

  const extraction: CreditAmortizationExtraction = {
    detectedFiscalYear: revenueYear,
    installments,
    yearlyInterestTotal:
      metrics.annualInterest > 0 ? Math.round(metrics.annualInterest * 100) / 100 : undefined,
    yearlyInsuranceTotal:
      metrics.annualInsurance > 0 ? Math.round(metrics.annualInsurance * 100) / 100 : undefined,
    remainingPrincipal: remainingCapitalAtFiscalYearEnd(
      spatial.installments,
      installments,
      revenueYear,
    ),
    monthlyPayment: firstAmortizing?.totalPayment,
    firstPaymentDate: sorted[0]?.date,
    loanDurationMonths: inferLoanDurationMonths(installments),
    loanAmount,
  };

  return extraction;
}

/** Installments and fiscal scalars always come from the spatial parser — never GPT. */
export function mergeSpatialInstallmentsWithGptMetadata(
  spatialExtraction: CreditAmortizationExtraction,
  _gptMetadata: CreditAmortizationExtraction,
): CreditAmortizationExtraction {
  return spatialExtraction;
}

/** Spatial parser output is the only financial reconstruction source when structurally usable. */
export function shouldUseSpatialAsPrimary(params: {
  isPdf: boolean;
  ocrProvider: string;
  spatial: SpatialAmortizationParseResult | null;
}): SpatialFinancialTruthDecision {
  const parserConfidence = params.spatial?.confidenceScore ?? null;
  const visibleLoanInstallmentCount = params.spatial
    ? spatialRowsToVisibleLoanInstallments(params.spatial.installments).installments.length
    : 0;
  const datedRawCount =
    params.spatial?.installments.filter((row) => Boolean(row.date?.trim())).length ?? 0;

  if (!params.isPdf) {
    return {
      useSpatial: false,
      reason: "not_pdf",
      visibleLoanInstallmentCount,
      parserConfidence,
    };
  }
  if (params.ocrProvider !== "pdf_text") {
    return {
      useSpatial: false,
      reason: `ocr_provider_${params.ocrProvider}`,
      visibleLoanInstallmentCount,
      parserConfidence,
    };
  }
  if (!params.spatial) {
    return {
      useSpatial: false,
      reason: "spatial_parse_failed",
      visibleLoanInstallmentCount: 0,
      parserConfidence: null,
    };
  }
  if (params.spatial.installments.length === 0) {
    return {
      useSpatial: false,
      reason: "spatial_zero_raw_installments",
      visibleLoanInstallmentCount: 0,
      parserConfidence,
    };
  }
  if (datedRawCount === 0) {
    return {
      useSpatial: false,
      reason: "spatial_zero_dated_installments",
      visibleLoanInstallmentCount: 0,
      parserConfidence,
    };
  }
  if (visibleLoanInstallmentCount === 0) {
    return {
      useSpatial: false,
      reason: "spatial_zero_visible_installments",
      visibleLoanInstallmentCount: 0,
      parserConfidence,
    };
  }

  return {
    useSpatial: true,
    reason: "spatial_financial_truth",
    visibleLoanInstallmentCount,
    parserConfidence,
  };
}

export function logSpatialParserPrimary(params: {
  sourceUsed: SpatialPrimarySource;
  confidenceScore: number;
  installmentCount: number;
  ocrProvider: string;
  reason?: string;
  documentId?: string;
  fileName?: string;
}): void {
  console.log(LOG_PRIMARY, {
    documentId: params.documentId,
    fileName: params.fileName,
    sourceUsed: params.sourceUsed,
    confidenceScore: params.confidenceScore,
    installmentCount: params.installmentCount,
    ocrProvider: params.ocrProvider,
    reason: params.reason ?? null,
  });
}

export function buildSpatialStructuralFailureResult(
  reason: string,
  spatial: SpatialAmortizationParseResult | null,
): CreditAmortizationGptExtractionResult {
  const supervision = buildStructuralFailureSupervision(reason, {
    rawCount: spatial?.installments.length,
    datedRawCount: spatial?.installments.filter((row) => Boolean(row.date?.trim())).length,
    visibleLoanInstallmentCount: spatial
      ? spatialRowsToVisibleLoanInstallments(spatial.installments).installments.length
      : 0,
  });

  return {
    success: false,
    extraction: { supervision },
    error: supervision.message,
  };
}

export function buildSpatialPrimaryGptResult(
  spatial: SpatialAmortizationParseResult,
  revenueYear: number,
  _gptMetadata: CreditAmortizationGptExtractionResult,
): CreditAmortizationGptExtractionResult {
  const spatialExtraction = buildCreditAmortizationFromSpatial(spatial, revenueYear);
  const visibleLoanInstallmentCount = spatialExtraction.installments?.length ?? 0;
  const supervision = buildAmortizationSupervision({
    spatial,
    visibleLoanInstallmentCount,
  });
  const extraction = attachAmortizationSupervision(spatialExtraction, supervision);

  const installmentCount = extraction.installments?.length ?? 0;
  const datedInstallmentCount =
    extraction.installments?.filter((row) => Boolean(row.date?.trim())).length ?? 0;
  const success = installmentCount > 0 && Object.keys(extraction).length > 0;

  logBuildSpatialPrimarySurvival({
    spatialRaw: countInstallmentSurvival(spatial.installments),
    loanCount: installmentCount,
    datedLoanCount: datedInstallmentCount,
    yearlyInsurance: extraction.yearlyInsuranceTotal,
    yearlyInterest: extraction.yearlyInterestTotal,
  });

  const { exclusions } = spatialRowsToVisibleLoanInstallments(spatial.installments);
  logInstallmentVisibilityAudit(
    "buildSpatialPrimaryGptResult",
    buildInstallmentVisibilityAudit({
      spatialRows: spatial.installments,
      loanInstallments: extraction.installments ?? [],
      exclusions,
    }),
    {
      yearlyInsurance: extraction.yearlyInsuranceTotal,
      yearlyInterest: extraction.yearlyInterestTotal,
      byLoanPhase: (extraction.installments ?? []).reduce(
        (acc, row) => {
          const phase = classifyLoanInstallmentPhase(row);
          acc[phase] = (acc[phase] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    },
  );

  console.log("[amortization-pipeline-debug] buildSpatialPrimaryGptResult", {
    spatialParseSuccess: spatial.success,
    spatialConfidence: spatial.confidenceScore,
    spatialRawInstallmentCount: spatial.installments.length,
    spatialDatedRawCount: spatial.installments.filter((row) => Boolean(row.date?.trim())).length,
    loanInstallmentCount: installmentCount,
    datedLoanInstallmentCount: datedInstallmentCount,
    extractionKeyCount: Object.keys(extraction).length,
    supervisionLevel: supervision.level,
    success,
    failureReason: success
      ? null
      : installmentCount === 0
        ? "loan_installment_count_zero_after_spatialInstallmentsToLoanInstallments"
        : "extraction_object_empty",
  });

  return {
    success,
    extraction,
    error: success ? undefined : supervision.message,
  };
}
