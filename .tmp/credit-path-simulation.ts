/**
 * Full credit-path simulation on production PDF.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { normalizeDate } from "../src/lib/documents/gpt/schemas/logement-acte.schema";
import { runAmortizationPipeline } from "../src/lib/lmnp/parsers/pipeline/run-amortization-pipeline";
import { spatialRowsFromTextItems } from "../src/lib/lmnp/parsers/spatial-amortization-core";
import { spatialRowsToVisibleLoanInstallments } from "../src/lib/lmnp/services/credit-installment-visibility";
import {
  buildSpatialPrimaryGptResult,
  shouldUseSpatialAsPrimary,
  spatialInstallmentsToLoanInstallments,
} from "../src/lib/lmnp/parsers/spatial-amortization-primary";

const pdfPath =
  "/Users/forniantoine/Desktop/JEDECLAREMONMEUBLE/Déclaration appartement - Elsa BOUVARD/Tableau d'amortissement.pdf";

async function main() {
  const require = createRequire(import.meta.url);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  const buffer = readFileSync(pdfPath);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const rows = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    rows.push(...spatialRowsFromTextItems(pageNumber, content.items));
  }

  const pipelineResult = runAmortizationPipeline(rows, {
    source: `browser-pdfjs:${pdfPath}`,
    totalPages: pdf.numPages,
    fiscalYear: 2025,
    enableDebugLogs: false,
  });

  const merged = pipelineResult.installments;
  const datedAfterMerge = merged.filter((r) => r.date?.trim()).length;

  const { installments: loanBridge, exclusions } = spatialRowsToVisibleLoanInstallments(merged);

  const spatialParse = {
    success: pipelineResult.success,
    confidenceScore: pipelineResult.confidenceScore,
    installments: merged,
    detectedColumns: pipelineResult.detectedColumns,
    detectedInstallmentRows: pipelineResult.detectedInstallmentRows,
  };

  const primaryDecision = shouldUseSpatialAsPrimary({
    isPdf: true,
    ocrProvider: "pdf_text",
    spatial: spatialParse,
  });

  const gptMock = {
    success: true,
    extraction: {
      installments: [
        { date: "2025-11-05", totalPayment: 100, principal: 50, interest: 40, insurance: 10, fees: 0 },
        { date: "2025-12-05", totalPayment: 100, principal: 50, interest: 40, insurance: 10, fees: 0 },
      ],
      yearlyInterestTotal: 841,
    },
  };

  let uiInstallmentCount: number;
  if (primaryDecision.useSpatial) {
    const built = buildSpatialPrimaryGptResult(spatialParse, 2025, gptMock);
    uiInstallmentCount = built.extraction.installments?.length ?? 0;
  } else {
    uiInstallmentCount = gptMock.extraction.installments?.length ?? 0;
  }

  const loanViaWrapper = spatialInstallmentsToLoanInstallments(merged);

  console.log(
    JSON.stringify(
      {
        fileName: "Tableau d'amortissement.pdf",
        pdfJsBuild: "legacy (node CLI; browser uses standard build)",
        checkpoint1_stage_e_merge: {
          totalRowCount: merged.length,
          datedRowCountBeforeMerge: "see merge log when enableDebugLogs=true",
          datedRowCountAfterMerge: datedAfterMerge,
        },
        checkpoint2_pipeline_exit: {
          installmentCount: merged.length,
          datedInstallmentCount: datedAfterMerge,
          success: pipelineResult.success,
          confidenceScore: pipelineResult.confidenceScore,
        },
        checkpoint3_spatialInstallmentsToLoanInstallments: {
          spatialInputCount: merged.length,
          loanOutputCount: loanBridge.length,
          excludedCount: exclusions.length,
          exclusionSampleFirst10: exclusions.slice(0, 10).map((e) => ({
            rowDate: merged[e.index]?.date ?? e.date,
            normalizedDate: normalizeDate(merged[e.index]?.date),
            reason: e.reason,
          })),
        },
        checkpoint4_first5Excluded: exclusions.slice(0, 5).map((e) => {
          const raw = merged[e.index]?.date;
          let nd: string | null = null;
          let throws = false;
          try {
            nd = normalizeDate(raw) ?? null;
          } catch {
            throws = true;
          }
          return {
            rawDate: raw,
            typeofDate: typeof raw,
            jsonStringifyDate: JSON.stringify(raw),
            normalizeDateReturnsNull: nd === null && !throws,
            normalizeDateThrows: throws,
            normalizeDateResult: nd,
            exclusionReason: e.reason,
          };
        }),
        creditPathDecision: {
          shouldUseSpatialAsPrimary: primaryDecision,
          uiInstallmentCountIfCurrentRules: uiInstallmentCount,
          note:
            primaryDecision.useSpatial
              ? "UI uses buildSpatialPrimaryGptResult → spatial bridge output"
              : "UI uses GPT fallback directly → GPT installment count (2 in server log)",
        },
        caseDetermination:
          datedAfterMerge <= 5
            ? "CASE_A"
            : loanBridge.length <= 5 && datedAfterMerge >= merged.length - 5
              ? "CASE_B"
              : loanBridge.length === merged.length
                ? "NEITHER_A_NOR_B_on_current_code"
                : "MIXED",
        wrapperLoanCount: loanViaWrapper.length,
      },
      null,
      2,
    ),
  );
}

main().catch(console.error);
