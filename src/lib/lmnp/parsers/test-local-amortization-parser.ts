/**
 * Manual benchmark harness for the experimental local amortization parser.
 * Not wired into app, store, or GPT pipelines.
 *
 * Run:
 *   npx tsx src/lib/lmnp/parsers/test-local-amortization-parser.ts path/to/ocr.txt
 *   cat path/to/ocr.txt | npx tsx src/lib/lmnp/parsers/test-local-amortization-parser.ts
 */

import { readFileSync } from "node:fs";

import {
  diagnoseAmortizationOcr,
  parseAmortizationTable,
  type ParseAmortizationResult,
} from "./parse-amortization-table";

const LOG_PREFIX = "[local-parser-benchmark]";

export type LocalAmortizationParserBenchmark = {
  confidenceScore: number;
  installmentCount: number;
  sampleInstallments: ParseAmortizationResult["sampleInstallments"];
  parsingDurationMs: number;
  detectedMonetaryColumnsCount: number;
  detectedDateRowsCount: number;
  ocrLineCount: number;
};

export function benchmarkLocalAmortizationParser(
  ocrText: string,
): LocalAmortizationParserBenchmark {
  const diagnostics = diagnoseAmortizationOcr(ocrText);

  const startedAt = performance.now();
  const parsed = parseAmortizationTable(ocrText);
  const parsingDurationMs = Math.round((performance.now() - startedAt) * 100) / 100;

  const benchmark: LocalAmortizationParserBenchmark = {
    confidenceScore: parsed.confidenceScore,
    installmentCount: parsed.installmentCount,
    sampleInstallments: parsed.sampleInstallments,
    parsingDurationMs,
    detectedMonetaryColumnsCount: diagnostics.monetaryColumnsCount,
    detectedDateRowsCount: diagnostics.dateRowsCount,
    ocrLineCount: diagnostics.lineCount,
  };

  console.log(LOG_PREFIX, "result", {
    confidenceScore: benchmark.confidenceScore,
    installmentCount: benchmark.installmentCount,
    sampleInstallments: benchmark.sampleInstallments,
    parsingDurationMs: benchmark.parsingDurationMs,
    detectedMonetaryColumnsCount: benchmark.detectedMonetaryColumnsCount,
    detectedDateRowsCount: benchmark.detectedDateRowsCount,
    ocrLineCount: benchmark.ocrLineCount,
  });

  return benchmark;
}

function readOcrInputFromCli(): string {
  const filePath = process.argv[2];

  if (filePath && filePath !== "-") {
    return readFileSync(filePath, "utf8");
  }

  if (process.stdin.isTTY) {
    throw new Error(
      "Provide OCR text via a file path or pipe stdin.\n" +
        "  npx tsx src/lib/lmnp/parsers/test-local-amortization-parser.ts ./ocr-sample.txt\n" +
        "  cat ./ocr-sample.txt | npx tsx src/lib/lmnp/parsers/test-local-amortization-parser.ts",
    );
  }

  return readFileSync(0, "utf8");
}

function isDirectExecution(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.includes("test-local-amortization-parser");
}

if (isDirectExecution()) {
  const ocrText = readOcrInputFromCli();
  console.log(LOG_PREFIX, "start", {
    inputChars: ocrText.length,
    inputLines: ocrText.split(/\n+/).filter(Boolean).length,
  });
  benchmarkLocalAmortizationParser(ocrText);
}
