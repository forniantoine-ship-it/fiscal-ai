/**
 * Read-only diagnostic — WHERE do dates disappear? (Case A vs Case B)
 * Run: npx tsx .tmp/date-survival-diagnostic.ts [pdf-path]
 */
import { normalizeDate } from "../src/lib/documents/gpt/schemas/logement-acte.schema";
import { spatialRowsToVisibleLoanInstallments } from "../src/lib/lmnp/services/credit-installment-visibility";
import { parseSpatialAmortizationPdf } from "../src/lib/lmnp/parsers/spatial-amortization-node";

async function main() {
  const pdfPath = process.argv[2] ?? ".tmp/spatial-bench/test.pdf";
  const spatial = await parseSpatialAmortizationPdf(pdfPath);
  const merged = spatial.installments;

  const datedAfterMerge = merged.filter((r) => r.date?.trim()).length;

  const { installments: loan, exclusions } = spatialRowsToVisibleLoanInstallments(merged);

  console.log("=== CHECKPOINT 1: stage_e_merge (post-pipeline merged output) ===");
  console.log(
    JSON.stringify(
      {
        totalRowCount: merged.length,
        datedRowCountAfterMerge: datedAfterMerge,
        note: "See [installment-survival-debug] stage_e_merge in full run for datedRowCountBeforeMerge",
      },
      null,
      2,
    ),
  );

  console.log("=== CHECKPOINT 2: runAmortizationPipeline exit ===");
  console.log(
    JSON.stringify(
      {
        installmentCount: spatial.installments.length,
        datedInstallmentCount: datedAfterMerge,
        success: spatial.success,
        confidenceScore: spatial.confidenceScore,
      },
      null,
      2,
    ),
  );

  console.log("=== CHECKPOINT 3: spatialInstallmentsToLoanInstallments ===");
  console.log(
    JSON.stringify(
      {
        spatialInputCount: merged.length,
        loanOutputCount: loan.length,
        excludedCount: exclusions.length,
        exclusionSampleFirst10: exclusions.slice(0, 10).map((e) => ({
          index: e.index,
          rowDate: e.date,
          normalizedDate: normalizeDate(e.date),
          reason: e.reason,
        })),
      },
      null,
      2,
    ),
  );

  console.log("=== CHECKPOINT 4: first 5 excluded rows (detail) ===");
  for (const e of exclusions.slice(0, 5)) {
    const raw = merged[e.index]?.date;
    let normalizeResult: string | null = null;
    let normalizeError: string | null = null;
    try {
      normalizeResult = normalizeDate(raw) ?? null;
    } catch (err) {
      normalizeError = err instanceof Error ? err.message : String(err);
    }
    console.log(
      JSON.stringify(
        {
          index: e.index,
          rawDate: raw,
          typeofDate: typeof raw,
          jsonStringifyDate: JSON.stringify(raw),
          normalizeDateResult: normalizeResult,
          normalizeDateThrows: normalizeError,
          exclusionReason: e.reason,
        },
        null,
        2,
      ),
    );
  }

  console.log("=== CASE DETERMINATION ===");
  if (datedAfterMerge <= 5) {
    console.log(
      `CASE A: datedRowCountAfterMerge = ${datedAfterMerge} (≈2) → dates lost at/before Stage E merge`,
    );
  } else if (loan.length <= 5 && datedAfterMerge >= merged.length - 5) {
    console.log(
      `CASE B: datedRowCountAfterMerge = ${datedAfterMerge} but loanOutputCount = ${loan.length} → normalizeDate rejects at bridge`,
    );
  } else if (exclusions.length === 0 && loan.length === merged.length) {
    console.log(`NO COLLAPSE on this PDF: all ${merged.length} rows survive bridge`);
  } else {
    console.log(
      `MIXED: datedAfterMerge=${datedAfterMerge}, loanOutputCount=${loan.length}, excludedCount=${exclusions.length}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
