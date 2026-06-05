/**
 * Compare standard (browser) vs legacy (node CLI) pdf.js text extraction.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { spatialRowsFromTextItems, parseSpatialAmortizationFromRows } from "../src/lib/lmnp/parsers/spatial-amortization-core";
import { spatialRowsToVisibleLoanInstallments } from "../src/lib/lmnp/services/credit-installment-visibility";
import { normalizeDate } from "../src/lib/documents/gpt/schemas/logement-acte.schema";

const pdfPath =
  process.argv[2] ??
  "/Users/forniantoine/Desktop/JEDECLAREMONMEUBLE/Déclaration appartement - Elsa BOUVARD/Tableau d'amortissement.pdf";

async function loadWithPdfJs(kind: "standard" | "legacy") {
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

async function analyze(kind: "standard" | "legacy") {
  const { totalPages, rows } = await loadWithPdfJs(kind);
  const result = parseSpatialAmortizationFromRows(rows, {
    totalPages,
    source: `${kind}:${pdfPath}`,
  });
  const merged = result.installments;
  const datedAfterMerge = merged.filter((r) => r.date?.trim()).length;
  const { installments: loan, exclusions } = spatialRowsToVisibleLoanInstallments(merged);

  return {
    kind,
    inputRowCount: rows.length,
    installmentCount: merged.length,
    datedInstallmentCount: datedAfterMerge,
    loanOutputCount: loan.length,
    excludedCount: exclusions.length,
    exclusionSample: exclusions.slice(0, 5).map((e) => ({
      index: e.index,
      rowDate: merged[e.index]?.date,
      normalizedDate: normalizeDate(merged[e.index]?.date),
      reason: e.reason,
    })),
    sampleDatesFirst5: merged.slice(0, 5).map((r) => r.date),
    sampleDatesLast5: merged.slice(-5).map((r) => r.date),
    undatedSample: merged
      .map((r, i) => ({ i, date: r.date }))
      .filter((r) => !r.date?.trim())
      .slice(0, 5),
  };
}

async function main() {
  const legacy = await analyze("legacy");
  const standard = await analyze("standard");
  console.log(JSON.stringify({ legacy, standard, sameLoanCount: legacy.loanOutputCount === standard.loanOutputCount }, null, 2));
}

main().catch(console.error);
