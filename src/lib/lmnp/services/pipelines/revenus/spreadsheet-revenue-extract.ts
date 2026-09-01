import type { RevenueRawLine, RevenueRawLineSourceType } from "@/lib/lmnp/types";
import {
  parseDateCell,
  parseMonetaryCellWithHeader,
  type LockedColumn,
} from "@/lib/lmnp/services/revenus-column-semantics";
import { canonicalMonetaryHeaderLabel } from "@/lib/lmnp/services/revenus-header-classification";
import { categoryFromColumnHeader } from "@/lib/lmnp/services/revenus-row-mapping";

import {
  recognizeSpreadsheetHeaders,
  type SpreadsheetBusinessField,
  type SpreadsheetColumnMapping,
} from "./spreadsheet-header-recognition";
import {
  createEmptyTraceSummary,
  probeMonetaryCell,
  recordRejection,
  traceCandidateRowExtraction,
  traceFinalSummary,
  traceHeaderDetection,
  traceNormalizedRows,
  traceRawRowsAfterHeader,
  traceRowRejection,
  type SpreadsheetCandidateRowExtraction,
} from "./spreadsheet-revenue-trace";

const FRENCH_MONTHS: Array<{ pattern: RegExp; index: number }> = [
  { pattern: /^janvier\b/i, index: 1 },
  { pattern: /^f[eé]vrier\b/i, index: 2 },
  { pattern: /^mars\b/i, index: 3 },
  { pattern: /^avril\b/i, index: 4 },
  { pattern: /^mai\b/i, index: 5 },
  { pattern: /^juin\b/i, index: 6 },
  { pattern: /^juillet\b/i, index: 7 },
  { pattern: /^ao[uû]t\b/i, index: 8 },
  { pattern: /^septembre\b/i, index: 9 },
  { pattern: /^octobre\b/i, index: 10 },
  { pattern: /^novembre\b/i, index: 11 },
  { pattern: /^d[eé]cembre\b/i, index: 12 },
];

const SUMMARY_ROW_PATTERN =
  /^(total|sous[\s-]?total|solde|cumul|balance|report|somme|recap)/i;

function logSpreadsheetRevenueDebug(detail: Record<string, unknown>): void {
  console.log("[spreadsheet-revenue-debug]", detail);
}

const CANONICAL_MONTH_NAMES = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

/**
 * Cycle 18 — une ligne avec une date de paiement réelle et valide n'a besoin
 * d'aucun texte de mois pour être rattachée à un mois : le mois se déduit
 * directement de la date. Avant ce correctif, une ligne sans aucun texte de
 * mois reconnaissable QUELQUE PART dans la feuille (ex. relevé bancaire brut
 * avec seulement une colonne Date, sans colonne Mois ni libellé français)
 * était rejetée en bloc ("invalid_month") même avec une date et un montant
 * parfaitement valides — perte silencieuse (seule trace : un console.log de
 * développement, jamais une anomalie visible par l'utilisateur).
 */
function monthNameFromPaymentDate(paymentDate: string | null): string | null {
  // Non ancrée en fin de chaîne : une cellule datetime native (ex. LibreOffice
  // "dd/mm/yyyy hh:mm") produit "15/06/2025 08:30" — l'heure est ignorée ici,
  // seul le jour calendaire compte pour l'attribution du mois.
  const match = paymentDate?.match(/^\d{2}\/(\d{2})\/\d{4}/);
  if (!match) return null;
  const monthNumber = Number.parseInt(match[1]!, 10);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return CANONICAL_MONTH_NAMES[monthNumber - 1] ?? null;
}

function monthNameFromCell(value: string): string | null {
  const trimmed = value.trim();
  for (const month of FRENCH_MONTHS) {
    if (month.pattern.test(trimmed)) {
      return trimmed.match(month.pattern)?.[0] ?? null;
    }
  }
  return null;
}

function monthNumberFromName(monthName: string): number | null {
  for (const month of FRENCH_MONTHS) {
    if (month.pattern.test(monthName.trim())) return month.index;
  }
  return null;
}

function defaultDateForMonth(monthName: string, fiscalYear: number): string | null {
  const monthNumber = monthNumberFromName(monthName);
  if (!monthNumber) return null;
  return `15/${String(monthNumber).padStart(2, "0")}/${fiscalYear}`;
}

function monetaryLabel(field: SpreadsheetBusinessField, rawHeader: string): string {
  if (field === "rent") return "Loyer";
  if (field === "complement" || field === "platform" || field === "indemnity") {
    return canonicalMonetaryHeaderLabel(rawHeader);
  }
  return rawHeader.trim();
}

function directionForField(
  field: SpreadsheetBusinessField,
  rawHeader: string,
): "credit" | "debit" {
  if (field === "rent") return "credit";
  const category = categoryFromColumnHeader(rawHeader);
  if (category === "charges" || category === "fee") return "debit";
  return "credit";
}

function lockedColumnFromHeader(rawHeader: string, index: number): LockedColumn {
  return {
    index,
    header: rawHeader,
    lockedType: "amount",
    targetField:
      categoryFromColumnHeader(rawHeader) === "charges" ? "charges" : "loyers",
    monetaryHeader: true,
  };
}

function resolveMonthName(
  cells: string[],
  mapping: SpreadsheetColumnMapping,
): string | null {
  if (mapping.month) {
    const raw = cells[mapping.month.columnIndex] ?? "";
    const fromMonthColumn = monthNameFromCell(raw);
    if (fromMonthColumn) return fromMonthColumn;
    if (monthNumberFromName(raw)) return raw.trim();
  }

  for (const cell of cells) {
    const name = monthNameFromCell(cell);
    if (name) return name;
  }

  return null;
}

function resolvePaymentDate(
  cells: string[],
  mapping: SpreadsheetColumnMapping,
): string | null {
  if (!mapping.paymentDate) return null;
  const raw = cells[mapping.paymentDate.columnIndex] ?? "";
  if (!raw.trim()) return null;

  const column = lockedColumnFromHeader(mapping.paymentDate.rawHeader, mapping.paymentDate.columnIndex);
  column.lockedType = "date";
  column.targetField = "transactionDate";
  return parseDateCell(raw, column);
}

function buildRowProbes(
  cells: string[],
  mapping: SpreadsheetColumnMapping,
): Pick<
  SpreadsheetCandidateRowExtraction,
  "parsedMonth" | "parsedRent" | "parsedComplement" | "parsedPaymentDate"
> {
  const monthName = resolveMonthName(cells, mapping);

  return {
    parsedMonth: monthName,
    parsedRent: probeMonetaryCell(
      mapping.rent ? (cells[mapping.rent.columnIndex] ?? "") : "",
      mapping.rent?.rawHeader,
      parseMonetaryCellWithHeader,
    ),
    parsedComplement: probeMonetaryCell(
      mapping.complement ? (cells[mapping.complement.columnIndex] ?? "") : "",
      mapping.complement?.rawHeader,
      parseMonetaryCellWithHeader,
    ),
    parsedPaymentDate: resolvePaymentDate(cells, mapping),
  };
}

function appendLineForColumn(params: {
  lines: RevenueRawLine[];
  field: SpreadsheetBusinessField;
  columnMatch: { rawHeader: string; columnIndex: number; confidenceScore: number } | undefined;
  cells: string[];
  monthName: string;
  fiscalYear: number;
  sourceDocumentId: string;
  sourceType: RevenueRawLineSourceType | string;
  paymentDate: string | null;
}): void {
  const columnMatch = params.columnMatch;
  if (!columnMatch) return;

  const raw = params.cells[columnMatch.columnIndex] ?? "";
  const parsed = parseMonetaryCellWithHeader(raw, columnMatch.rawHeader, {
    monetaryHeaderOverride: true,
  });
  if (!parsed) return;

  const label = monetaryLabel(params.field, columnMatch.rawHeader);

  params.lines.push({
    id: crypto.randomUUID(),
    date: params.paymentDate ?? defaultDateForMonth(params.monthName, params.fiscalYear),
    label,
    amount: parsed.amount,
    direction: directionForField(params.field, columnMatch.rawHeader),
    sourceDocumentId: params.sourceDocumentId,
    sourceType: params.sourceType,
    confidence: Math.min(99, columnMatch.confidenceScore),
    sourceColumnHeader: label,
    structuredTable: true,
    monthLabel: params.monthName,
  });
}

function appendMonetaryLine(params: {
  lines: RevenueRawLine[];
  field: SpreadsheetBusinessField;
  mapping: SpreadsheetColumnMapping;
  cells: string[];
  monthName: string;
  fiscalYear: number;
  sourceDocumentId: string;
  sourceType: RevenueRawLineSourceType | string;
  paymentDate: string | null;
}): void {
  appendLineForColumn({ ...params, columnMatch: params.mapping[params.field] });
}

/**
 * Airbnb + Booking + Abritel (ou GLI + VISALE) peuvent coexister dans le même
 * fichier — chaque colonne devient sa propre ligne (jamais fusionnées en une
 * seule valeur pré-sommée), et c'est l'agrégation mensuelle qui les additionne
 * naturellement dans le même poste (recettesPlateforme / indemnitesAssurance).
 */
function appendMultiColumnLines(params: {
  lines: RevenueRawLine[];
  field: "platform" | "indemnity" | "complement";
  mapping: SpreadsheetColumnMapping;
  cells: string[];
  monthName: string;
  fiscalYear: number;
  sourceDocumentId: string;
  sourceType: RevenueRawLineSourceType | string;
  paymentDate: string | null;
}): void {
  const columns =
    params.field === "platform"
      ? params.mapping.platformColumns
      : params.field === "indemnity"
        ? params.mapping.indemnityColumns
        : params.mapping.complementColumns;
  for (const columnMatch of columns ?? []) {
    appendLineForColumn({ ...params, columnMatch });
  }
}

export type SpreadsheetRevenueExtractResult = {
  lines: RevenueRawLine[];
  headerRowIndex: number | null;
  mapping: SpreadsheetColumnMapping | null;
};

export function extractRevenueLinesFromSpreadsheetGrid(
  grid: string[][],
  params: {
    fiscalYear: number;
    sourceDocumentId: string;
    sourceType: RevenueRawLineSourceType | string;
  },
): SpreadsheetRevenueExtractResult {
  const traceSummary = createEmptyTraceSummary();
  const audit = recognizeSpreadsheetHeaders(grid);
  traceHeaderDetection(audit);

  if (!audit) {
    logSpreadsheetRevenueDebug({ stage: "extract", status: "no_header_mapping" });
    traceFinalSummary(traceSummary);
    return { lines: [], headerRowIndex: null, mapping: null };
  }

  const { selectedMapping: mapping, headerRowIndex } = audit;
  const dataRows = grid.slice(headerRowIndex + 1);
  const lines: RevenueRawLine[] = [];

  traceRawRowsAfterHeader(grid, headerRowIndex);
  traceNormalizedRows(
    dataRows.map((row) => row.map((cell) => cell.trim())),
    headerRowIndex,
  );

  traceSummary.totalRowsRead = dataRows.length;

  logSpreadsheetRevenueDebug({
    stage: "extract_start",
    headerRowIndex,
    dataRowCount: dataRows.length,
    mappedFields: Object.keys(mapping),
  });

  for (let offset = 0; offset < dataRows.length; offset += 1) {
    const worksheetRowIndex = headerRowIndex + 1 + offset;
    const rawRow = dataRows[offset] ?? [];
    const cells = rawRow.map((cell) => cell.trim());
    const normalizedRow = [...cells];

    const probes = buildRowProbes(cells, mapping);
    const candidate: SpreadsheetCandidateRowExtraction = {
      rowIndex: worksheetRowIndex,
      rawRow: [...rawRow],
      normalizedRow,
      ...probes,
    };

    if (!cells.some((cell) => cell.length > 0)) {
      recordRejection(traceSummary, "empty_row");
      traceRowRejection({
        ...candidate,
        rejectionReason: "empty_row",
      });
      continue;
    }

    traceSummary.candidateRows += 1;
    traceCandidateRowExtraction(candidate);

    const joined = cells.join(" ");
    if (SUMMARY_ROW_PATTERN.test(joined)) {
      recordRejection(traceSummary, "summary_row");
      traceRowRejection({
        ...candidate,
        rejectionReason: "summary_row",
      });
      continue;
    }

    const paymentDate = probes.parsedPaymentDate;
    const monthName =
      probes.parsedMonth && monthNumberFromName(probes.parsedMonth)
        ? probes.parsedMonth
        : monthNameFromPaymentDate(paymentDate);
    if (!monthName) {
      recordRejection(traceSummary, "invalid_month");
      traceRowRejection({
        ...candidate,
        rejectionReason: "invalid_month",
      });
      continue;
    }

    const linesBefore = lines.length;

    appendMonetaryLine({
      lines,
      field: "rent",
      mapping,
      cells,
      monthName,
      fiscalYear: params.fiscalYear,
      sourceDocumentId: params.sourceDocumentId,
      sourceType: params.sourceType,
      paymentDate,
    });

    // Cycle 18 — "complement" (autres revenus : CAF, remboursement, allocation...)
    // promu en champ multi-colonnes comme platform/indemnity : un classeur
    // avec à la fois "CAF" et "Remboursement charges" perdait auparavant l'un
    // des deux (appendMonetaryLine ne lit qu'une seule colonne gagnante).
    appendMultiColumnLines({
      lines,
      field: "complement",
      mapping,
      cells,
      monthName,
      fiscalYear: params.fiscalYear,
      sourceDocumentId: params.sourceDocumentId,
      sourceType: params.sourceType,
      paymentDate,
    });

    appendMultiColumnLines({
      lines,
      field: "platform",
      mapping,
      cells,
      monthName,
      fiscalYear: params.fiscalYear,
      sourceDocumentId: params.sourceDocumentId,
      sourceType: params.sourceType,
      paymentDate,
    });

    appendMultiColumnLines({
      lines,
      field: "indemnity",
      mapping,
      cells,
      monthName,
      fiscalYear: params.fiscalYear,
      sourceDocumentId: params.sourceDocumentId,
      sourceType: params.sourceType,
      paymentDate,
    });

    const linesAdded = lines.length - linesBefore;
    if (linesAdded === 0) {
      const rentFailed = mapping.rent && !(probes.parsedRent?.accepted ?? false);
      const complementFailed =
        mapping.complement && !(probes.parsedComplement?.accepted ?? false);
      const rentEmpty = mapping.rent && !(cells[mapping.rent.columnIndex] ?? "").trim();
      const complementEmpty =
        mapping.complement && !(cells[mapping.complement.columnIndex] ?? "").trim();
      const hasOtherMonetaryColumns = Boolean(
        (mapping.platformColumns?.length ?? 0) > 0 || (mapping.indemnityColumns?.length ?? 0) > 0,
      );

      let rejectionReason = "no_monetary_lines_extracted";
      if (rentFailed && complementFailed) rejectionReason = "rent_and_complement_parse_failed";
      else if (rentFailed && (complementEmpty || !mapping.complement)) {
        rejectionReason = "rent_parse_failed";
      } else if (complementFailed && (rentEmpty || !mapping.rent)) {
        rejectionReason = "complement_parse_failed";
      } else if (rentEmpty && complementEmpty) {
        rejectionReason = "rent_and_complement_empty";
      } else if (!mapping.rent && !mapping.complement && !hasOtherMonetaryColumns) {
        rejectionReason = "no_monetary_columns_mapped";
      }

      recordRejection(traceSummary, rejectionReason);
      traceRowRejection({
        ...candidate,
        rejectionReason,
      });
      continue;
    }

    traceSummary.acceptedRows += 1;
  }

  traceSummary.acceptedLineCount = lines.length;
  traceFinalSummary(traceSummary);

  logSpreadsheetRevenueDebug({
    stage: "extract_complete",
    lineCount: lines.length,
    headerRowIndex,
  });

  return { lines, headerRowIndex, mapping };
}
