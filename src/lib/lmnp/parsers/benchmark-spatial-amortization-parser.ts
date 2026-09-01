/**
 * Standalone benchmark harness for the spatial amortization parser.
 * Not wired into production, GPT, upload, or stores.
 *
 * Run:
 *   npx tsx src/lib/lmnp/parsers/benchmark-spatial-amortization-parser.ts path/to/pdf-folder
 */

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

import {
  parseSpatialAmortizationPdf,
  type SpatialAmortizationParseResult,
  type SpatialInstallment,
} from "./spatial-amortization-node";

const LOG_PREFIX = "[spatial-parser-benchmark]";
const REPORT_FILENAME = "spatial-parser-benchmark-report.json";

type AmountField = "payment" | "principal" | "interest" | "insurance" | "remainingCapital";

type FieldPresenceRates = Record<AmountField, number>;

type PdfAnomalies = {
  crdIncreasing: boolean;
  missingDates: boolean;
  duplicateInstallments: boolean;
  inconsistentColumnCounts: boolean;
  allZeroRows: boolean;
  messages: string[];
};

export type PdfBenchmarkResult = {
  filename: string;
  relativePath: string;
  absolutePath: string;
  success: boolean;
  confidenceScore: number;
  installmentCount: number;
  parsingDurationMs: number;
  detectedColumns: string[];
  fieldPresenceRates: FieldPresenceRates;
  missingFieldsPercent: number;
  anomalies: PdfAnomalies;
  error?: string;
};

export type AggregateBenchmarkSummary = {
  pdfCount: number;
  parsedCount: number;
  failedCount: number;
  successRate: number;
  averageConfidence: number;
  averageDurationMs: number;
  topRecurringMissingColumns: Array<{ column: AmountField; missingPercent: number }>;
  suspiciousPdfs: Array<{ filename: string; relativePath: string; reasons: string[] }>;
};

export type SpatialParserBenchmarkReport = {
  generatedAt: string;
  inputFolder: string;
  results: PdfBenchmarkResult[];
  aggregate: AggregateBenchmarkSummary;
};

const AMOUNT_FIELDS: AmountField[] = [
  "payment",
  "principal",
  "interest",
  "insurance",
  "remainingCapital",
];

function isDirectExecution(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.includes("benchmark-spatial-amortization-parser");
}

function readFolderFromCli(): string {
  const folderPath = process.argv[2];
  if (!folderPath) {
    throw new Error(
      "Provide a folder path containing amortization PDFs.\n" +
        "  npx tsx src/lib/lmnp/parsers/benchmark-spatial-amortization-parser.ts path/to/pdf-folder",
    );
  }
  return folderPath;
}

function collectPdfFiles(folderPath: string): string[] {
  const absoluteFolder = resolve(folderPath);
  const files: string[] = [];

  function walk(currentPath: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentPath);
    } catch (error) {
      console.error(LOG_PREFIX, "scan-error", { currentPath, error });
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentPath, entry);
      let stats;
      try {
        stats = statSync(fullPath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (
        stats.isFile() &&
        /\.pdf$/i.test(entry) &&
        !entry.startsWith("._") &&
        !entry.startsWith(".")
      ) {
        files.push(fullPath);
      }
    }
  }

  walk(absoluteFolder);
  return files.sort((a, b) => a.localeCompare(b));
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeFieldPresenceRates(installments: SpatialInstallment[]): FieldPresenceRates {
  const count = installments.length;
  if (count === 0) {
    return {
      payment: 0,
      principal: 0,
      interest: 0,
      insurance: 0,
      remainingCapital: 0,
    };
  }

  const tallies: Record<AmountField, number> = {
    payment: 0,
    principal: 0,
    interest: 0,
    insurance: 0,
    remainingCapital: 0,
  };

  for (const installment of installments) {
    for (const field of AMOUNT_FIELDS) {
      if (installment[field] !== undefined) tallies[field] += 1;
    }
  }

  return {
    payment: roundPercent((tallies.payment / count) * 100),
    principal: roundPercent((tallies.principal / count) * 100),
    interest: roundPercent((tallies.interest / count) * 100),
    insurance: roundPercent((tallies.insurance / count) * 100),
    remainingCapital: roundPercent((tallies.remainingCapital / count) * 100),
  };
}

function computeMissingFieldsPercent(fieldPresenceRates: FieldPresenceRates): number {
  const missingRates = AMOUNT_FIELDS.map((field) => 100 - fieldPresenceRates[field]);
  if (missingRates.length === 0) return 100;
  return roundPercent(missingRates.reduce((sum, value) => sum + value, 0) / missingRates.length);
}

function installmentSignature(installment: SpatialInstallment): string {
  return [
    installment.rank ?? "",
    installment.date ?? "",
    installment.payment ?? "",
    installment.principal ?? "",
    installment.interest ?? "",
    installment.insurance ?? "",
    installment.remainingCapital ?? "",
  ].join("|");
}

function isZeroAmount(value: number | undefined): boolean {
  return value === undefined || Math.abs(value) < 0.000_001;
}

function detectAnomalies(
  installments: SpatialInstallment[],
  detectedColumns: string[],
): PdfAnomalies {
  const messages: string[] = [];

  let crdIncreasing = false;
  let previousCrd: number | undefined;

  for (const installment of installments) {
    const currentCrd = installment.remainingCapital;
    if (currentCrd === undefined) continue;
    if (previousCrd !== undefined && currentCrd > previousCrd + 0.01) {
      crdIncreasing = true;
    }
    previousCrd = currentCrd;
  }

  if (crdIncreasing) {
    messages.push("CRD increases on at least one consecutive row");
  }

  const missingDates = installments.some((row) => !row.date);
  if (missingDates) {
    messages.push("At least one installment row is missing a date");
  }

  const signatures = new Map<string, number>();
  for (const installment of installments) {
    const signature = installmentSignature(installment);
    signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
  }
  const duplicateInstallments = [...signatures.values()].some((count) => count > 1);
  if (duplicateInstallments) {
    messages.push("Duplicate installment rows detected");
  }

  const populatedCounts = installments.map((row) =>
    AMOUNT_FIELDS.filter((field) => row[field] !== undefined).length,
  );
  const uniqueCounts = new Set(populatedCounts);
  const inconsistentColumnCounts = populatedCounts.length > 0 && uniqueCounts.size > 1;
  if (inconsistentColumnCounts) {
    messages.push("Inconsistent populated amount-field counts across rows");
  }

  const allZeroRows = installments.some(
    (row) =>
      AMOUNT_FIELDS.every((field) => isZeroAmount(row[field])) &&
      row.date !== undefined,
  );
  if (allZeroRows) {
    messages.push("At least one dated row has all zero amount fields");
  }

  if (installments.length === 0) {
    messages.push("No installments parsed");
  }

  if (detectedColumns.length === 0) {
    messages.push("No table headers detected");
  }

  return {
    crdIncreasing,
    missingDates,
    duplicateInstallments,
    inconsistentColumnCounts,
    allZeroRows,
    messages,
  };
}

function isSuspicious(anomalies: PdfAnomalies, result: PdfBenchmarkResult): boolean {
  return (
    anomalies.messages.length > 0 ||
    !result.success ||
    result.confidenceScore < 50 ||
    result.installmentCount === 0
  );
}

export async function benchmarkPdfFile(
  absolutePath: string,
  inputFolder: string,
): Promise<PdfBenchmarkResult> {
  const relativePath = relative(resolve(inputFolder), absolutePath);
  const filename = basename(absolutePath);

  const startedAt = performance.now();
  let parsed: SpatialAmortizationParseResult | undefined;
  let error: string | undefined;

  try {
    parsed = await parseSpatialAmortizationPdf(absolutePath);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const parsingDurationMs = Math.round((performance.now() - startedAt) * 100) / 100;

  if (!parsed || error) {
    const emptyRates = computeFieldPresenceRates([]);
    const anomalies: PdfAnomalies = {
      crdIncreasing: false,
      missingDates: true,
      duplicateInstallments: false,
      inconsistentColumnCounts: false,
      allZeroRows: false,
      messages: [error ?? "Parser returned no result"],
    };

    return {
      filename,
      relativePath,
      absolutePath,
      success: false,
      confidenceScore: 0,
      installmentCount: 0,
      parsingDurationMs,
      detectedColumns: [],
      fieldPresenceRates: emptyRates,
      missingFieldsPercent: 100,
      anomalies,
      error,
    };
  }

  const fieldPresenceRates = computeFieldPresenceRates(parsed.installments);
  const anomalies = detectAnomalies(parsed.installments, parsed.detectedColumns);

  const result: PdfBenchmarkResult = {
    filename,
    relativePath,
    absolutePath,
    success: parsed.success,
    confidenceScore: parsed.confidenceScore,
    installmentCount: parsed.installments.length,
    parsingDurationMs,
    detectedColumns: parsed.detectedColumns,
    fieldPresenceRates,
    missingFieldsPercent: computeMissingFieldsPercent(fieldPresenceRates),
    anomalies,
  };

  console.log(LOG_PREFIX, "pdf-result", {
    filename,
    relativePath,
    success: result.success,
    confidenceScore: result.confidenceScore,
    installmentCount: result.installmentCount,
    parsingDurationMs: result.parsingDurationMs,
    fieldPresenceRates: result.fieldPresenceRates,
    missingFieldsPercent: result.missingFieldsPercent,
    anomalies: result.anomalies.messages,
  });

  return result;
}

function buildAggregateSummary(results: PdfBenchmarkResult[]): AggregateBenchmarkSummary {
  const parsedResults = results.filter((result) => !result.error);
  const successfulResults = results.filter((result) => result.success);

  const averageConfidence =
    parsedResults.length === 0
      ? 0
      : roundPercent(
          parsedResults.reduce((sum, result) => sum + result.confidenceScore, 0) /
            parsedResults.length,
        );

  const averageDurationMs =
    results.length === 0
      ? 0
      : roundPercent(
          results.reduce((sum, result) => sum + result.parsingDurationMs, 0) / results.length,
        );

  const successRate =
    results.length === 0 ? 0 : roundPercent((successfulResults.length / results.length) * 100);

  const missingByField = new Map<AmountField, number[]>();
  for (const field of AMOUNT_FIELDS) {
    missingByField.set(field, []);
  }

  for (const result of parsedResults) {
    for (const field of AMOUNT_FIELDS) {
      const missingPercent = 100 - result.fieldPresenceRates[field];
      missingByField.get(field)!.push(missingPercent);
    }
  }

  const topRecurringMissingColumns = AMOUNT_FIELDS.map((field) => {
    const values = missingByField.get(field) ?? [];
    const averageMissing =
      values.length === 0
        ? 0
        : roundPercent(values.reduce((sum, value) => sum + value, 0) / values.length);
    return { column: field, missingPercent: averageMissing };
  })
    .sort((a, b) => b.missingPercent - a.missingPercent)
    .slice(0, 5);

  const suspiciousPdfs = results
    .filter((result) => isSuspicious(result.anomalies, result))
    .map((result) => ({
      filename: result.filename,
      relativePath: result.relativePath,
      reasons: [
        ...(result.error ? [`error: ${result.error}`] : []),
        ...(!result.success ? ["parser success=false"] : []),
        ...(result.confidenceScore < 50 ? [`low confidence (${result.confidenceScore})`] : []),
        ...(result.installmentCount === 0 ? ["no installments"] : []),
        ...result.anomalies.messages,
      ],
    }));

  return {
    pdfCount: results.length,
    parsedCount: parsedResults.length,
    failedCount: results.length - parsedResults.length,
    successRate,
    averageConfidence,
    averageDurationMs,
    topRecurringMissingColumns,
    suspiciousPdfs,
  };
}

function pad(value: string, width: number): string {
  if (value.length >= width) return value.slice(0, width - 1) + "…";
  return value.padEnd(width);
}

function printResultsTable(results: PdfBenchmarkResult[]): void {
  const filenameWidth = Math.min(
    40,
    Math.max(8, ...results.map((result) => result.filename.length)),
  );

  const header = [
    pad("filename", filenameWidth),
    pad("confidence", 10),
    pad("installments", 12),
    pad("duration", 10),
    pad("missing %", 10),
  ].join(" | ");

  console.log(LOG_PREFIX, "table-header", header);
  console.log(LOG_PREFIX, "table-divider", "-".repeat(header.length));

  for (const result of results) {
    const row = [
      pad(result.filename, filenameWidth),
      pad(String(result.confidenceScore), 10),
      pad(String(result.installmentCount), 12),
      pad(`${result.parsingDurationMs}ms`, 10),
      pad(String(result.missingFieldsPercent), 10),
    ].join(" | ");

    console.log(LOG_PREFIX, "table-row", row);
  }
}

function printAggregateSummary(aggregate: AggregateBenchmarkSummary): void {
  console.log(LOG_PREFIX, "aggregate", {
    pdfCount: aggregate.pdfCount,
    parsedCount: aggregate.parsedCount,
    failedCount: aggregate.failedCount,
    successRate: aggregate.successRate,
    averageConfidence: aggregate.averageConfidence,
    averageDurationMs: aggregate.averageDurationMs,
    topRecurringMissingColumns: aggregate.topRecurringMissingColumns,
    suspiciousPdfCount: aggregate.suspiciousPdfs.length,
  });

  if (aggregate.suspiciousPdfs.length > 0) {
    console.log(LOG_PREFIX, "suspicious-pdfs", aggregate.suspiciousPdfs);
  }
}

export async function runSpatialParserBenchmark(
  folderPath: string,
  reportPath = resolve(process.cwd(), REPORT_FILENAME),
): Promise<SpatialParserBenchmarkReport> {
  const inputFolder = resolve(folderPath);
  const pdfFiles = collectPdfFiles(inputFolder);

  console.log(LOG_PREFIX, "start", {
    inputFolder,
    pdfCount: pdfFiles.length,
    reportPath,
  });

  if (pdfFiles.length === 0) {
    console.warn(LOG_PREFIX, "no-pdfs-found", { inputFolder });
  }

  const results: PdfBenchmarkResult[] = [];

  for (const pdfPath of pdfFiles) {
    console.log(LOG_PREFIX, "processing", { pdfPath });
    const result = await benchmarkPdfFile(pdfPath, inputFolder);
    results.push(result);
  }

  const aggregate = buildAggregateSummary(results);

  printResultsTable(results);
  printAggregateSummary(aggregate);

  const report: SpatialParserBenchmarkReport = {
    generatedAt: new Date().toISOString(),
    inputFolder,
    results,
    aggregate,
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(LOG_PREFIX, "report-saved", { reportPath });

  return report;
}

if (isDirectExecution()) {
  const folderPath = readFolderFromCli();
  runSpatialParserBenchmark(folderPath).catch((error: unknown) => {
    console.error(LOG_PREFIX, "fatal-error", error);
    process.exitCode = 1;
  });
}

/*
 * CLI (from repo root):
 *   npx tsx src/lib/lmnp/parsers/benchmark-spatial-amortization-parser.ts path/to/pdf-folder
 */
