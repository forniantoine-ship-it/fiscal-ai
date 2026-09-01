/**
 * Fixtures partagées Cycle 15A — construction de vrais classeurs .xlsx en mémoire
 * (via le package `xlsx`, jamais écrits sur disque) pour exercer le pipeline réel
 * d'import de revenus de bout en bout dans les tests, comme lors des audits.
 */
import * as XLSX from "xlsx";

import type { Property, RevenueGptSession, RevenueRawLine } from "@/lib/lmnp/types";
import { sessionFromPipelineLines, gridSummary } from "@/lib/lmnp/services/revenue-gpt-ui-prefill";
import { runSpreadsheetRevenuePipeline } from "./spreadsheet-revenue-pipeline";
import type { RevenuePipelineContext } from "./revenue-pipeline-types";

export const TEST_PROPERTY: Property = {
  id: "p1",
  label: "Bien test",
  address: "1 rue du Test",
  city: "Paris",
  postalCode: "75000",
};

export const TEST_PROPERTY_B: Property = {
  id: "p2",
  label: "Bien test B",
  address: "2 rue du Test",
  city: "Lyon",
  postalCode: "69000",
};

export function buildWorkbook(sheets: Record<string, (string | number)[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  }
  return wb;
}

export function workbookToFile(wb: XLSX.WorkBook, fileName = "test.xlsx"): File {
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new File([new Uint8Array(buffer)], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function runSpreadsheetPipelineForTest(
  file: File,
  fiscalYear: number,
  documentId = "doc-1",
): Promise<RevenueRawLine[]> {
  const ctx: RevenuePipelineContext = {
    file,
    documentId,
    fileName: file.name,
    fiscalYear,
    sourceType: "bank_statement",
  };
  const result = await runSpreadsheetRevenuePipeline(ctx, []);
  return result.lines;
}

export function buildSessionFromLines(lines: RevenueRawLine[], fiscalYear: number): RevenueGptSession {
  return sessionFromPipelineLines(
    [TEST_PROPERTY],
    fiscalYear,
    new Map([[TEST_PROPERTY.id, lines]]),
    "ocr_lines",
  );
}

export async function totalRevenueForYear(file: File, fiscalYear: number): Promise<number> {
  const lines = await runSpreadsheetPipelineForTest(file, fiscalYear);
  const session = buildSessionFromLines(lines, fiscalYear);
  return gridSummary(session).totalRevenue;
}

/**
 * Cycle 15B — simule un upload réel dans une action SÉPARÉE de la précédente
 * (documentId unique, previous = session déjà persistée) — exactement le
 * chemin emprunté par RevenusDocumentStep.runAnalysis(), qui ne repasse à
 * chaque appel que les documents "uploaded" non encore "analyzed".
 */
export async function uploadSequentially(
  previous: RevenueGptSession | undefined,
  file: File,
  fiscalYear: number,
  documentId: string,
  property: Property = TEST_PROPERTY,
): Promise<RevenueGptSession> {
  const lines = await runSpreadsheetPipelineForTest(file, fiscalYear, documentId);
  return sessionFromPipelineLines(
    [property],
    fiscalYear,
    new Map([[property.id, lines]]),
    "ocr_lines",
    previous,
  );
}
