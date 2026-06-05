/**
 * Quiet end-to-end checkpoint counts for production PDF (standard = browser pdf.js).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { normalizeDate } from "../src/lib/documents/gpt/schemas/logement-acte.schema";
import { spatialRowsFromTextItems, parseSpatialAmortizationFromRows } from "../src/lib/lmnp/parsers/spatial-amortization-core";
import { spatialRowsToVisibleLoanInstallments } from "../src/lib/lmnp/services/credit-installment-visibility";
import { countInstallmentSurvival } from "../src/lib/lmnp/parsers/pipeline/installment-survival-debug";
import { shouldUseSpatialAsPrimary } from "../src/lib/lmnp/parsers/spatial-amortization-primary";

const pdfPath =
  process.argv[2] ??
  "/Users/forniantoine/Desktop/JEDECLAREMONMEUBLE/Déclaration appartement - Elsa BOUVARD/Tableau d'amortissement.pdf";

async function loadRows(kind: "standard" | "legacy") {
  const require = createRequire(import.meta.url);
  const pdfjs =
    kind === "legacy"
      ? await import("pdfjs-dist/legacy/build/pdf.mjs")
      : await import("pdfjs-dist");
  const workerPath = require.resolve(
    kind === "legacy"
      ? "pdfjs-dist/legacy/build/pdf.worker.min.mjs"
      : "pdfjs-dist/build/pdf.worker.min.mjs",
  );
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  const buffer = readFileSync(pdfPath);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const rows = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    rows.push(...spatialRowsFromTextItems(pageNumber, content.items));
  }
  return { totalPages: pdf.numPages, rows };
}

async function checkpoints(kind: "standard" | "legacy") {
  const { totalPages, rows } = await loadRows(kind);
  const spatial = parseSpatialAmortizationFromRows(rows, {
    totalPages,
    source: `${kind}:${pdfPath}`,
    enableDebugLogs: false,
  });
  const merged = spatial.installments;
  const survival = countInstallmentSurvival(merged);
  const { installments: loan, exclusions } = spatialRowsToVisibleLoanInstallments(merged);
  const primary = shouldUseSpatialAsPrimary({
    isPdf: true,
    ocrProvider: "pdf_text",
    spatial,
  });

  const exclusionDetail = exclusions.slice(0, 5).map((e) => {
    const raw = merged[e.index]?.date;
    let normalizeResult: string | null | "throws" = null;
    try {
      normalizeResult = normalizeDate(raw) ?? null;
    } catch {
      normalizeResult = "throws";
    }
    return {
      index: e.index,
      rowDate: e.date,
      normalizedDate: normalizeResult,
      reason: e.reason,
      rawDate: raw,
      typeofDate: typeof raw,
      jsonStringifyDate: JSON.stringify(raw),
    };
  });

  return {
    pdfJsBuild: kind,
    fileName: pdfPath.split("/").pop(),
    stage_e_merge: {
      totalRowCount: merged.length,
      datedRowCountBeforeMerge: null,
      datedRowCountAfterMerge: survival.dated,
      note: "datedRowCountBeforeMerge requires merge hook; survival.dated is post-merge",
    },
    runAmortizationPipeline_exit: {
      installmentCount: merged.length,
      datedInstallmentCount: survival.dated,
      success: spatial.success,
      confidenceScore: spatial.confidenceScore,
    },
    spatialInstallmentsToLoanInstallments: {
      spatialInputCount: merged.length,
      loanOutputCount: loan.length,
      excludedCount: exclusions.length,
      exclusionSampleFirst10: exclusions.slice(0, 10).map((e) => ({
        rowDate: merged[e.index]?.date ?? e.date,
        normalizedDate: normalizeDate(merged[e.index]?.date),
        reason: e.reason,
      })),
    },
    first5ExcludedDetail: exclusionDetail,
    shouldUseSpatialAsPrimary: primary,
    caseDetermination:
      survival.dated <= 5
        ? "CASE_A_dates_lost_at_or_before_merge"
        : loan.length <= 5 && survival.dated >= merged.length - 5
          ? "CASE_B_normalizeDate_rejects_at_bridge"
          : loan.length === merged.length
            ? "NO_COLLAPSE_all_rows_survive_bridge"
            : "MIXED_partial_loss",
  };
}

async function main() {
  const legacy = await checkpoints("legacy");
  const standard = await checkpoints("standard");
  const report = { legacy, standard, generatedAt: new Date().toISOString() };
  writeFileSync(".tmp/date-survival-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
