/**
 * TEMPORARY — simulates credit UI success path from spatial parse result.
 * Run: npx tsx src/lib/lmnp/parsers/pipeline/debug-credit-ui-path.ts path/to.pdf
 */

import { parseSpatialAmortizationPdf } from "../spatial-amortization-node";
import {
  buildSpatialPrimaryGptResult,
  shouldUseSpatialAsPrimary,
  spatialInstallmentsToLoanInstallments,
} from "../spatial-amortization-primary";

async function main(): Promise<void> {
  const pdfPath = process.argv[2] ?? ".tmp/spatial-bench/test.pdf";
  const spatial = await parseSpatialAmortizationPdf(pdfPath);

  const datedCount = spatial.installments.filter((row) => Boolean(row.date?.trim())).length;
  const loanInstallments = spatialInstallmentsToLoanInstallments(spatial.installments);
  const primaryDecision = shouldUseSpatialAsPrimary({
    isPdf: true,
    ocrProvider: "pdf_text",
    spatial,
  });
  const gptResult = buildSpatialPrimaryGptResult(spatial, 2025, { success: true, extraction: {} });

  console.log("[amortization-pipeline-debug] credit_ui_path_simulation", {
    pdfPath,
    spatialParseSuccess: spatial.success,
    spatialConfidence: spatial.confidenceScore,
    rawInstallmentCount: spatial.installments.length,
    datedInstallmentCount: datedCount,
    loanInstallmentCount: loanInstallments.length,
    primaryDecision,
    gptResultSuccess: gptResult.success,
    gptResultError: gptResult.error ?? null,
    uiOutcome: gptResult.success ? "analyzed" : "analysis_failed_analyse_impossible",
    sampleRawDates: spatial.installments.slice(0, 5).map((row) => row.date ?? null),
    sampleBucketColumns: spatial.installments.slice(0, 2),
  });
}

main().catch((error) => {
  console.error("[amortization-pipeline-debug] credit_ui_path_simulation_throw", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exitCode = 1;
});
