import { monthKeyFromDate, parseEventDate } from "./revenue-aggregation";
import type {
  RevenueRawLine,
  RevenueRawLineSourceType,
  RevenueTransactionCategory,
} from "../types";
import {
  dateColumns,
  isDateLikeValue,
  lockTableColumns,
  monetaryColumns,
  monthColumn,
  normalizeDateValue,
  parseDateCell,
  parseMonetaryCell,
  parseMonetaryCellWithHeader,
  type LockedColumn,
} from "./revenus-column-semantics";
import {
  buildColumnIndexDiagnostics,
  logStructuredTableDiagnostics,
} from "./revenus-structured-table-diagnostics";
import {
  canonicalMonetaryHeaderLabel,
  headerMatchesOtherIncomeSynonym,
  headerMatchesRentSynonym,
} from "./revenus-header-classification";
import { categoryFromColumnHeader } from "./revenus-row-mapping";
import { splitTableRow } from "./revenus-table-row-tokens";

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

export type StructuredTableParseResult = {
  detected: boolean;
  lines: RevenueRawLine[];
};

function monthNameFromLine(line: string): string | null {
  const trimmed = line.trim();
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

function monthKeyFromMonthName(monthName: string, fiscalYear: number): string | null {
  const monthNumber = monthNumberFromName(monthName);
  if (!monthNumber) return null;
  return `${fiscalYear}-${String(monthNumber).padStart(2, "0")}`;
}

function defaultDateForMonth(monthName: string, fiscalYear: number): string | null {
  const monthNumber = monthNumberFromName(monthName);
  if (!monthNumber) return null;
  return `15/${String(monthNumber).padStart(2, "0")}/${fiscalYear}`;
}

function monetaryHeaderLabel(column: LockedColumn): string {
  return canonicalMonetaryHeaderLabel(column.header);
}

function findAssociatedDate(
  cells: string[],
  monetaryColumn: LockedColumn,
  lockedDateColumns: LockedColumn[],
): string | null {
  const nextDate = lockedDateColumns.find((column) => column.index > monetaryColumn.index);
  if (nextDate) {
    const raw = cells[nextDate.index] ?? "";
    return parseDateCell(raw, nextDate) ?? (isDateLikeValue(raw) ? normalizeDateValue(raw) : null);
  }

  const previousDate = [...lockedDateColumns]
    .reverse()
    .find((column) => column.index < monetaryColumn.index);
  if (previousDate) {
    const raw = cells[previousDate.index] ?? "";
    return parseDateCell(raw, previousDate) ?? (isDateLikeValue(raw) ? normalizeDateValue(raw) : null);
  }

  return null;
}

function makeStructuredLine(params: {
  header: string;
  amount: number;
  monthName: string;
  fiscalYear: number;
  sourceDocumentId: string;
  sourceType: RevenueRawLineSourceType | string;
  date?: string | null;
  direction?: "credit" | "debit";
}): RevenueRawLine | null {
  const category = categoryFromColumnHeader(params.header);
  if (!category) return null;

  const date =
    params.date ??
    defaultDateForMonth(params.monthName, params.fiscalYear) ??
    null;

  return {
    id: crypto.randomUUID(),
    date,
    label: params.header,
    amount: params.amount,
    direction: params.direction ?? (category === "charges" || category === "fee" ? "debit" : "credit"),
    sourceDocumentId: params.sourceDocumentId,
    sourceType: params.sourceType,
    confidence: 98,
    sourceColumnHeader: params.header,
    structuredTable: true,
    monthLabel: params.monthName,
  };
}

function parseTabularRows(
  rows: string[],
  fiscalYear: number,
  sourceDocumentId: string,
  sourceType: RevenueRawLineSourceType | string,
): RevenueRawLine[] {
  const headerIndex = rows.findIndex(
    (row) => /\bloyers?\b/i.test(row) && /\bcomplements?\b/i.test(row),
  );
  if (headerIndex < 0) return [];

  const headerCells = splitTableRow(rows[headerIndex] ?? "", true);
  const dataRows = rows
    .slice(headerIndex + 1)
    .filter((row) => !/^(total|sous[\s-]?total|solde|cumul)\b/i.test(row))
    .map((row) => splitTableRow(row, true));

  const lockedColumns = lockTableColumns(headerCells, dataRows);
  const lockedMonetaryColumns = monetaryColumns(lockedColumns);
  const lockedDateColumns = dateColumns(lockedColumns);
  const lockedMonthColumn = monthColumn(lockedColumns);

  logStructuredTableDiagnostics({
    headerRowIndex: headerIndex,
    headerRow: rows[headerIndex] ?? "",
    headerCells,
    columnIndexes: buildColumnIndexDiagnostics(lockedColumns),
    sampleNormalizedRows: dataRows.slice(0, 3).map((cells, rowIndex) => ({
      rowIndex: headerIndex + 1 + rowIndex,
      cells,
    })),
  });

  if (lockedMonetaryColumns.length === 0) return [];

  const parsed: RevenueRawLine[] = [];

  for (const cells of dataRows) {
    const monthCandidate =
      (lockedMonthColumn ? cells[lockedMonthColumn.index] : undefined) ??
      cells.find((cell) => monthNameFromLine(cell)) ??
      cells[0];
    const monthName = monthCandidate ? monthNameFromLine(monthCandidate) ?? monthCandidate : null;
    if (!monthName || !monthNumberFromName(monthName)) continue;

    for (const column of lockedColumns) {
      if (column.lockedType === "date") {
        parseDateCell(cells[column.index] ?? "", column);
      }
    }

    for (const column of lockedMonetaryColumns) {
      const raw = cells[column.index] ?? "";
      const monetary = parseMonetaryCell(raw, column);
      if (!monetary) continue;

      const structuredLine = makeStructuredLine({
        header: monetaryHeaderLabel(column),
        amount: monetary.amount,
        monthName,
        fiscalYear,
        sourceDocumentId,
        sourceType,
        date: findAssociatedDate(cells, column, lockedDateColumns),
      });
      if (structuredLine) parsed.push(structuredLine);
    }
  }

  return parsed;
}

/**
 * Cycle 19 — ce repli texte libre (utilisé uniquement quand aucun tableau
 * structuré n'a été détecté, cf. `parseTabularRows`) avait son PROPRE jeu de
 * mots-clés, indépendant de `revenus-header-classification.ts` : seuls
 * "Loyer"/"Complément"/"Charges" étaient reconnus. Une ligne texte libre
 * "Airbnb : 350" ou "GLI : 500" ne matchait AUCUN motif — invisible, sans
 * trace ni anomalie, alors que ces natures sont déjà comprises PARTOUT
 * ailleurs (Excel, tableau structuré, colonnes OCR). Chaque terme déclencheur
 * ci-dessous vient des motifs déjà établis dans revenus-header-classification.ts
 * (PLATFORM/INSURANCE_INDEMNITY/OTHER_INCOME) — aucune nouvelle catégorie
 * inventée, seulement la parité avec ce qui est déjà reconnu ailleurs.
 */
const FALLBACK_LINE_TRIGGER_WORDS: Array<{ header: string; words: string[] }> = [
  { header: "Loyer", words: ["loyers?"] },
  {
    header: "Complément",
    words: [
      "compl[eé]?\\.?",
      "compl[eé]ment(?: de loyer)?",
      "annexe",
      "autres revenus",
      "revenu annexe",
      "revenu complementaire",
      "caf",
      "allocation",
    ],
  },
  { header: "Airbnb", words: ["airbnb"] },
  { header: "Booking", words: ["booking"] },
  { header: "Abritel", words: ["abritel"] },
  { header: "Vrbo", words: ["vrbo"] },
  { header: "GLI", words: ["gli", "garantie loyers? impayes?"] },
  { header: "Visale", words: ["visale"] },
  { header: "Indemnité", words: ["indemnit[eé]"] },
  { header: "Remboursement", words: ["remboursement"] },
  { header: "Charges", words: ["charges?"] },
];

function buildFallbackLinePatterns(): Array<{ header: string; regex: RegExp }> {
  // Le lookahead qui délimite la fin d'un montant doit s'arrêter avant N'IMPORTE
  // QUEL AUTRE déclencheur connu — sinon "Loyer: 1000 Airbnb: 350" sur une même
  // ligne capturerait "1000 Airbnb" en entier comme montant du loyer.
  const allWords = FALLBACK_LINE_TRIGGER_WORDS.flatMap((c) => c.words);
  const stopAlternation = [...allWords, "date"].join("|");

  return FALLBACK_LINE_TRIGGER_WORDS.map(({ header, words }) => ({
    header,
    regex: new RegExp(
      `(?:${words.join("|")})\\s*[:=]?\\s*([^\\n\\r|]+?)(?=\\s*(?:${stopAlternation}|$))`,
      "gi",
    ),
  }));
}

function extractColumnAmounts(
  line: string,
): Array<{ header: string; amount: number; date?: string }> {
  const found: Array<{ header: string; amount: number; date?: string }> = [];
  const patterns = buildFallbackLinePatterns();

  for (const { header, regex } of patterns) {
    for (const match of line.matchAll(regex)) {
      const raw = (match[1] ?? "").trim();
      const parsed = parseMonetaryCellWithHeader(raw, header);
      if (!parsed) continue;

      const dateMatch = line.match(/\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\b/);
      found.push({
        header,
        amount: parsed.amount,
        date: dateMatch ? normalizeDateValue(dateMatch[1]) ?? dateMatch[1] : undefined,
      });
    }
  }

  return found;
}

export function detectStructuredRevenueTable(text: string): boolean {
  const sample = text.slice(0, 4000);
  const hasRent = headerMatchesRentSynonym(sample) || /\bloyers?\b/i.test(sample);
  const hasOtherIncome = headerMatchesOtherIncomeSynonym(sample);
  const hasMois =
    /\bmois\b/i.test(sample) || FRENCH_MONTHS.some((month) => month.pattern.test(text));
  return hasRent && (hasOtherIncome || hasMois);
}

export function parseStructuredRevenueTable(
  text: string,
  fiscalYear: number,
  sourceDocumentId: string,
  sourceType: RevenueRawLineSourceType | string,
): StructuredTableParseResult {
  if (!detectStructuredRevenueTable(text)) {
    return { detected: false, lines: [] };
  }

  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const tabularLines = parseTabularRows(rows, fiscalYear, sourceDocumentId, sourceType);

  const lines: RevenueRawLine[] = [...tabularLines];

  if (tabularLines.length === 0) {
    let currentMonth: string | null = null;

    for (const row of rows) {
      const monthOnLine = monthNameFromLine(row);
      if (monthOnLine) {
        currentMonth = monthOnLine;
      }

      const monthForRow = monthOnLine ?? currentMonth;
      if (!monthForRow) continue;

      if (/^(total|sous[\s-]?total|solde|cumul)\b/i.test(row)) continue;

      const columnAmounts = extractColumnAmounts(row);
      if (columnAmounts.length === 0) continue;

      for (const item of columnAmounts) {
        const structuredLine = makeStructuredLine({
          header: item.header,
          amount: item.amount,
          monthName: monthForRow,
          fiscalYear,
          sourceDocumentId,
          sourceType,
          date: item.date ?? null,
        });
        if (structuredLine) lines.push(structuredLine);
      }
    }
  }

  const unique = dedupeStructuredLines(lines, fiscalYear);

  return {
    detected: unique.length > 0,
    lines: unique,
  };
}

function dedupeStructuredLines(lines: RevenueRawLine[], fiscalYear: number): RevenueRawLine[] {
  const seen = new Set<string>();
  const kept: RevenueRawLine[] = [];

  for (const line of lines) {
    const monthKey = monthKeyForStructuredLine(line, fiscalYear);
    const key = `${line.sourceColumnHeader}|${line.amount}|${monthKey}|${line.direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(line);
  }

  return kept;
}

export function isStructuredRawLine(line: RevenueRawLine): boolean {
  return Boolean(line.structuredTable || line.sourceColumnHeader);
}

export function monthKeyForStructuredLine(line: RevenueRawLine, fiscalYear: number): string | null {
  // Une date réelle et exploitable est toujours prioritaire (SAV-028). Si elle tombe
  // hors de l'exercice demandé, monthKeyFromDate renvoie null et c'est définitif :
  // jamais de repli sur monthLabel pour réinjecter la ligne dans l'exercice demandé.
  if (parseEventDate(line.date ?? null)) {
    return monthKeyFromDate(line.date ?? null, fiscalYear);
  }
  if (line.monthLabel) return monthKeyFromMonthName(line.monthLabel, fiscalYear);
  return null;
}

export function categoryForStructuredLine(line: RevenueRawLine): RevenueTransactionCategory | null {
  if (line.sourceColumnHeader) return categoryFromColumnHeader(line.sourceColumnHeader);
  if (line.label) return categoryFromColumnHeader(line.label);
  return null;
}

export { splitTableRow, coalesceAmountCurrencyTokens, isNormalizedMonetaryCell } from "./revenus-table-row-tokens";
