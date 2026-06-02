/**
 * Pure spatial amortization parsing (no pdf.js, no Node/browser runtime).
 */

import {
  extractDateFromBucketCell,
  logDateNormalizationDebug,
} from "./extract-date-from-bucket-cell";

/** Y-distance (px) to treat text items as the same visual row. */
export const ROW_Y_THRESHOLD_PX = 4;

/** Max horizontal gap (px) before starting a new column within a row. */
export const COLUMN_GAP_THRESHOLD_PX = 12;

export type NormalizedPdfTextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
};

export type SpatialTableRow = {
  pageNumber: number;
  y: number;
  columns: string[];
  raw: string;
  /** Source pdf.js text items for this row (X-based bucket assignment). */
  items?: NormalizedPdfTextItem[];
};

type PdfJsTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
};

function isPdfJsTextItem(item: unknown): item is PdfJsTextItem {
  return typeof item === "object" && item !== null && "str" in item;
}

export function normalizePdfTextItem(item: PdfJsTextItem): NormalizedPdfTextItem | null {
  const text = typeof item.str === "string" ? item.str.trim() : "";
  if (!text) return null;

  const transform = item.transform;
  if (!transform || transform.length < 6) return null;

  const x = transform[4] ?? 0;
  const y = transform[5] ?? 0;
  const width = typeof item.width === "number" && item.width > 0 ? item.width : text.length * 4;

  return { text, x, y, width };
}

function mergeItemsIntoColumns(items: NormalizedPdfTextItem[]): string[] {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const columns: string[] = [];
  let buffer = "";
  let bufferEndX = 0;

  for (const item of sorted) {
    const gap = buffer ? item.x - bufferEndX : 0;
    if (buffer && gap > COLUMN_GAP_THRESHOLD_PX) {
      columns.push(buffer.trim());
      buffer = item.text;
    } else {
      buffer = buffer ? `${buffer} ${item.text}` : item.text;
    }
    bufferEndX = item.x + item.width;
  }

  if (buffer.trim()) columns.push(buffer.trim());
  return columns;
}

export function groupRowsByY(
  items: NormalizedPdfTextItem[],
  thresholdPx = ROW_Y_THRESHOLD_PX,
): Omit<SpatialTableRow, "pageNumber">[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const clusters: NormalizedPdfTextItem[][] = [];

  for (const item of sorted) {
    const lastCluster = clusters[clusters.length - 1];
    if (!lastCluster) {
      clusters.push([item]);
      continue;
    }

    const clusterY =
      lastCluster.reduce((sum, member) => sum + member.y, 0) / lastCluster.length;

    if (Math.abs(item.y - clusterY) <= thresholdPx) {
      lastCluster.push(item);
    } else {
      clusters.push([item]);
    }
  }

  return clusters.map((cluster) => {
    const y = cluster.reduce((sum, member) => sum + member.y, 0) / cluster.length;
    const columns = mergeItemsIntoColumns(cluster);
    return {
      y,
      columns,
      raw: columns.join(" "),
      items: cluster,
    };
  });
}

function digitsOnlySpatial(value: string): string {
  return value.replace(/\D/g, "");
}

export function isLikelyDateToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) return false;
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(trimmed)) return true;
  if (/^\d{4}[/.-]\d{1,2}[/.-]\d{1,2}$/.test(trimmed)) return true;

  const compact = digitsOnlySpatial(trimmed);
  if (compact.length === 8) {
    const day = Number.parseInt(compact.slice(0, 2), 10);
    const month = Number.parseInt(compact.slice(2, 4), 10);
    const year = Number.parseInt(compact.slice(4, 8), 10);
    return day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1990 && year <= 2100;
  }

  return false;
}

function rowContainsDate(columns: string[]): boolean {
  const joined = columns.join(" ");
  if (isLikelyDateToken(joined)) return true;
  return columns.some((column) => isLikelyDateToken(column));
}

function looksLikeMonetaryToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed || !/\d/.test(trimmed)) return false;
  if (isLikelyDateToken(trimmed)) return false;

  const hasCommaDecimals = /,\d{1,2}\b/.test(trimmed) || /,\d{1,2}$/.test(trimmed);
  const hasDotDecimals = /\.\d{1,2}\b/.test(trimmed);
  const hasCurrency = /€|eur/i.test(trimmed);

  if (hasCurrency || hasCommaDecimals || hasDotDecimals) return true;

  const digits = digitsOnlySpatial(trimmed);
  return digits.length >= 2 && digits.length <= 14;
}

export function extractMonetaryTokens(columns: string[]): string[] {
  const tokens: string[] = [];

  for (const column of columns) {
    const parts = column.split(/\s+/).filter(Boolean);
    let index = 0;

    while (index < parts.length) {
      const current = parts[index]!;
      const next = parts[index + 1];

      if (
        next &&
        /^\d{1,3}$/.test(current) &&
        /^\d{1,3},\d{2}$/.test(next) &&
        !isLikelyDateToken(current)
      ) {
        const merged = `${current} ${next}`;
        if (looksLikeMonetaryToken(merged)) tokens.push(merged);
        index += 2;
        continue;
      }

      if (looksLikeMonetaryToken(current)) tokens.push(current);
      index += 1;
    }
  }

  return tokens;
}

export function isLikelyDeferredTableRowColumns(columns: string[]): boolean {
  if (!rowContainsDate(columns)) return false;

  const amounts = columns
    .map((column) => parseCellAmount(column))
    .filter((value): value is number => value !== null && Math.abs(value) > DEFERRED_ZERO_EPSILON);

  if (amounts.length < 2) return false;

  const maxAmount = Math.max(...amounts.map((value) => Math.abs(value)));
  const positiveAmounts = amounts.filter((value) => value > DEFERRED_ZERO_EPSILON);
  const minPositive = positiveAmounts.length > 0 ? Math.min(...positiveAmounts) : 0;

  return maxAmount > 1_000 && minPositive > 0 && minPositive < maxAmount * 0.08;
}

export function isProbableInstallmentRow(columns: string[]): boolean {
  if (!rowContainsDate(columns)) return false;

  const monetaryTokenCount = extractMonetaryTokens(columns).length;
  if (monetaryTokenCount >= 3) return true;

  return monetaryTokenCount >= 2 && isLikelyDeferredTableRowColumns(columns);
}

/** Build spatial rows from pdf.js page text items (runtime-agnostic). */
export function spatialRowsFromTextItems(
  pageNumber: number,
  items: unknown[],
): SpatialTableRow[] {
  const normalized: NormalizedPdfTextItem[] = [];
  for (const item of items) {
    if (!isPdfJsTextItem(item)) continue;
    const textItem = normalizePdfTextItem(item);
    if (textItem) normalized.push(textItem);
  }

  return groupRowsByY(normalized).map((row) => ({
    pageNumber,
    ...row,
  }));
}

const LOG_PREFIX = "[spatial-amortization-parser]";
const LOG_ROW = "[spatial-parser-row]";
const LOG_ROW_SKIPPED = "[spatial-parser-row-skipped]";
const LOG_HEADERS = "[spatial-parser-headers]";
const LOG_ANOMALY = "[spatial-parser-anomaly]";
const LOG_DEFERRED_DEBUG = "[spatial-parser-deferred-debug]";
const LOG_PHASE_TRANSITION = "[spatial-parser-phase-transition]";
const LOG_BUSINESS_VALIDATION = "[spatial-parser-business-validation]";
const LOG_TRACE = "[spatial-parser-trace]";
const LOG_CRITICAL = "[spatial-parser-critical]";
const LOG_FINAL_MAPPING = "[spatial-parser-final-mapping]";
const LOG_COLUMN_BUCKETS = "[spatial-parser-column-buckets]";
const LOG_ROW_BALANCE_ERROR = "[spatial-parser-row-balance-error]";
const LOG_FIRST_AMORTIZATION_ROW = "[spatial-parser-first-amortization-row]";
const LOG_ROW_LIFECYCLE = "[spatial-parser-row-lifecycle]";
const LOG_DEFERRED_ROW_PRESERVED = "[spatial-parser-deferred-row-preserved]";
const LOG_ROW_LIFECYCLE_SUMMARY = "[spatial-parser-row-lifecycle-summary]";

const ROW_BALANCE_TOLERANCE_EUR = 3;

const CRITICAL_PAYMENT_MEDIAN_THRESHOLD = 10_000;
const CRITICAL_SMALL_COLUMN_MEDIAN_MAX = 500;

const DEFERRED_PHASE_MIN_ROWS = 2;
const PAYMENT_MAX_CRD_MEDIAN_RATIO = 0.2;
const PAYMENT_CRD_MEDIAN_SIMILARITY = 0.85;
const CRD_MEDIAN_DOMINANCE_FACTOR = 10;
const CRD_MONOTONIC_MIN_RATIO = 0.55;
const DEFERRED_PAYMENT_INSURANCE_MAX_RATIO = 5;
const DEFERRED_PAYMENT_MAX_ABSOLUTE = 10_000;
const DEFERRED_RUN_FOR_TRANSITION = 5;
const DEFERRED_PROPAGATION_WINDOW = 5;
const AMORTIZATION_CALIBRATION_ROWS = 10;
const DEFERRED_ZERO_EPSILON = 0.01;

type LoanPhase = "deferred" | "amortization";

type ColumnMedianContext = {
  insuranceMedian?: number;
  paymentMedian?: number;
  crdMedian?: number;
};

export type RowParsingContext = {
  loanPhase: LoanPhase | "unknown";
  enableDeferredHeuristics: boolean;
  enableDeferredDuplicatePreservation: boolean;
  preserveOrderedAmountRepeats: boolean;
  columnMedians?: ColumnMedianContext;
  previousInstallment?: SpatialInstallment;
};

const DEFAULT_ROW_PARSING_CONTEXT: RowParsingContext = {
  loanPhase: "unknown",
  enableDeferredHeuristics: false,
  enableDeferredDuplicatePreservation: false,
  preserveOrderedAmountRepeats: false,
};

export type EnginePhaseSegment = {
  phase: LoanPhase;
  start: number;
  end: number;
};

export type EnginePhaseTransition = {
  installmentIndex: number;
  rowIndex: number;
  pdfPage: number;
  previousPhase: LoanPhase;
  nextPhase: LoanPhase;
  transitionReason: string;
  resetHeuristics: string[];
};

export type InstallmentParseRecord = {
  installmentIndex: number;
  sourceRowIndex: number;
  row: SpatialTableRow;
  location: RowLocation;
  headerColumnCount: number;
  installment: SpatialInstallment;
  assignmentMode: string;
  reconstruction: RowReconstructionDiagnostics;
};

const HEADER_LOOKUP_DISTANCE = 5;

export type RowLocation = {
  pdfPage: number;
  rowIndexOnPage: number;
  rowY: number;
};

type MappedFieldsDebug = {
  payment?: number;
  principal?: number;
  interest?: number;
  insurance?: number;
  remainingCapital?: number;
};

function columnRoleMappingToObject(mapping: ColumnRoleMapping): Record<string, ColumnRole> {
  const out: Record<string, ColumnRole> = {};
  for (const [index, role] of mapping) {
    out[String(index)] = role;
  }
  return out;
}

function logSpatialParserTrace(params: {
  functionName: string;
  entered: boolean;
  rowCount?: number;
  loanPhase?: LoanPhase | "unknown";
  rolesBeforeValidation?: Record<string, ColumnRole>;
  rolesAfterValidation?: Record<string, ColumnRole>;
  extra?: Record<string, unknown>;
}): void {
  console.log(LOG_TRACE, {
    functionName: params.functionName,
    entered: params.entered,
    rowCount: params.rowCount ?? null,
    loanPhase: params.loanPhase ?? null,
    rolesBeforeValidation: params.rolesBeforeValidation ?? null,
    rolesAfterValidation: params.rolesAfterValidation ?? null,
    ...params.extra,
  });
}

function inferCrdMedianFromStats(
  statsByColumn: Map<number, ColumnNumericStats>,
  mapping: ColumnRoleMapping,
): number {
  const crdIndex = findColumnIndexForRole(mapping, "remainingCapital");
  const crdStats = crdIndex !== undefined ? statsByColumn.get(crdIndex) : undefined;
  if (crdStats && crdStats.median > 0) return crdStats.median;

  let bestCrdLike = 0;
  for (const stats of statsByColumn.values()) {
    if (isColumnCrdLike(stats, statsByColumn) && stats.median > bestCrdLike) {
      bestCrdLike = stats.median;
    }
  }
  if (bestCrdLike > 0) return bestCrdLike;

  const medians = [...statsByColumn.values()]
    .map((stats) => stats.median)
    .filter((value) => value > 0);
  return medians.length > 0 ? Math.max(...medians) : 0;
}

function enforceCriticalPaymentCrdSeparation(
  mapping: ColumnRoleMapping,
  statsByColumn: Map<number, ColumnNumericStats>,
  loanPhase: LoanPhase | "unknown",
): ColumnRoleMapping {
  let next = new Map(mapping);
  const paymentIndex = findColumnIndexForRole(next, "payment");
  const paymentStats = paymentIndex !== undefined ? statsByColumn.get(paymentIndex) : undefined;

  const alternativeSmallColumns = [...statsByColumn.values()]
    .filter(
      (stats) =>
        stats.columnIndex !== paymentIndex &&
        stats.median > DEFERRED_ZERO_EPSILON &&
        stats.median < CRITICAL_SMALL_COLUMN_MEDIAN_MAX,
    )
    .map((stats) => ({
      columnIndex: stats.columnIndex,
      median: roundStat(stats.median),
      flatRatio: roundStat(stats.flatRatio),
    }))
    .sort((a, b) => a.median - b.median);

  if (
    !paymentStats ||
    paymentStats.median <= CRITICAL_PAYMENT_MEDIAN_THRESHOLD ||
    alternativeSmallColumns.length === 0
  ) {
    return next;
  }

  const crdIndex = findColumnIndexForRole(next, "remainingCapital");
  const exclude = new Set<number>();
  if (crdIndex !== undefined) exclude.add(crdIndex);

  const replacementIndex =
    loanPhase === "deferred"
      ? findSmallestRepeatedNonZeroColumn(statsByColumn, exclude)
      : alternativeSmallColumns[0]?.columnIndex;

  console.log(LOG_CRITICAL, {
    issue: "CRD_MAPPED_AS_PAYMENT",
    paymentColumn: paymentIndex ?? null,
    paymentMedian: roundStat(paymentStats.median),
    alternativeSmallColumns,
    loanPhase,
    replacementColumn: replacementIndex ?? null,
  });

  if (paymentIndex !== undefined) next.delete(paymentIndex);
  for (const [columnIndex, role] of [...next]) {
    if (role === "payment") next.delete(columnIndex);
  }

  if (replacementIndex !== undefined) {
    next.set(replacementIndex, "payment");
  }

  const crdCandidate = [...statsByColumn.values()]
    .filter((stats) => isColumnCrdLike(stats, statsByColumn))
    .sort((a, b) => b.median - a.median)[0];

  if (crdCandidate) {
    for (const [columnIndex, role] of [...next]) {
      if (role === "remainingCapital") next.delete(columnIndex);
    }
    next.set(crdCandidate.columnIndex, "remainingCapital");
  }

  return next;
}

function logSpatialParserFinalMapping(params: {
  mapping: ColumnRoleMapping;
  statsByColumn: Map<number, ColumnNumericStats>;
  installments: SpatialInstallment[];
  source: string;
}): void {
  const paymentColumn = findColumnIndexForRole(params.mapping, "payment");
  const remainingCapitalColumn = findColumnIndexForRole(params.mapping, "remainingCapital");
  const insuranceColumn = findColumnIndexForRole(params.mapping, "insurance");
  const principalColumn = findColumnIndexForRole(params.mapping, "principal");
  const interestColumn = findColumnIndexForRole(params.mapping, "interest");

  const sampleRows = params.installments.slice(0, 8).map((row) => ({
    date: row.date,
    payment: row.payment,
    principal: row.principal,
    interest: row.interest,
    insurance: row.insurance,
    remainingCapital: row.remainingCapital,
  }));

  console.log(LOG_FINAL_MAPPING, {
    source: params.source,
    paymentColumn: paymentColumn ?? null,
    paymentColumnMedian:
      paymentColumn !== undefined
        ? roundStat(params.statsByColumn.get(paymentColumn)?.median ?? 0)
        : null,
    remainingCapitalColumn: remainingCapitalColumn ?? null,
    remainingCapitalColumnMedian:
      remainingCapitalColumn !== undefined
        ? roundStat(params.statsByColumn.get(remainingCapitalColumn)?.median ?? 0)
        : null,
    insuranceColumn: insuranceColumn ?? null,
    principalColumn: principalColumn ?? null,
    interestColumn: interestColumn ?? null,
    rolesByIndex: columnRoleMappingToObject(params.mapping),
    sampleRows,
  });
}

type OrderedAmountExtraction = {
  raw: number[];
  deduped: number[];
  deduplicationApplied: string | null;
};

type RowReconstructionDiagnostics = {
  rawColumns: string[];
  mergedColumns: string[];
  parsedAmounts: Array<{ columnIndex: number; column: string; amount: number | null }>;
  columnIndexes: number[];
  orderedAmountsRaw: number[];
  deduplicatedColumns: number[];
  deduplicationApplied: string | null;
  repeatedAdjacentAmounts: Array<{ leftIndex: number; rightIndex: number; value: number }>;
};

function findRepeatedAdjacentColumnAmounts(
  amountsByColumn: Map<number, number>,
): Array<{ leftIndex: number; rightIndex: number; value: number }> {
  const indexes = [...amountsByColumn.keys()].sort((a, b) => a - b);
  const pairs: Array<{ leftIndex: number; rightIndex: number; value: number }> = [];

  for (let index = 0; index < indexes.length - 1; index += 1) {
    const leftIndex = indexes[index]!;
    const rightIndex = indexes[index + 1]!;
    const leftValue = amountsByColumn.get(leftIndex)!;
    const rightValue = amountsByColumn.get(rightIndex)!;

    if (leftValue > 0 && Math.abs(leftValue - rightValue) < DEFERRED_ZERO_EPSILON) {
      pairs.push({ leftIndex, rightIndex, value: leftValue });
    }
  }

  return pairs;
}

function looksLikeDeferredOrderedAmounts(amounts: number[]): boolean {
  if (amounts.length < 3) return false;

  const absAmounts = amounts.map((value) => Math.abs(value));
  const maxValue = Math.max(...absAmounts);
  if (maxValue < 100) return false;

  const smallPositive = absAmounts.filter((value) => value > DEFERRED_ZERO_EPSILON && value < maxValue * 0.05);
  const zeroCount = absAmounts.filter((value) => value <= DEFERRED_ZERO_EPSILON).length;

  return smallPositive.length >= 1 && zeroCount >= 1 && maxValue > 1_000;
}

function shouldPreserveMirroredDuplicateColumns(
  amounts: number[],
  amountsByColumn: Map<number, number>,
): boolean {
  const repeatedAdjacent = findRepeatedAdjacentColumnAmounts(amountsByColumn);
  if (repeatedAdjacent.length === 0) return false;
  if (!looksLikeDeferredOrderedAmounts(amounts)) return false;

  if (amounts.length >= 6 && amounts.length % 2 === 0) {
    const half = amounts.length / 2;
    const first = amounts.slice(0, half);
    const second = amounts.slice(half);
    if (first.every((value, index) => value === second[index])) return true;
  }

  return repeatedAdjacent.length > 0;
}

function getAlignedColumnRolesForRow(
  row: SpatialTableRow,
  headerMapping: ColumnRoleMapping,
): ColumnRoleMapping {
  const span = mappingColumnSpan(headerMapping) || row.columns.length;
  return alignColumnRolesToDataRow(row, headerMapping, span);
}

function getRoleAmountFromRow(
  row: SpatialTableRow,
  alignedRoles: ColumnRoleMapping,
  role: Exclude<ColumnRole, "rank" | "date">,
): number | null {
  const columnIndex = findColumnIndexForRole(alignedRoles, role);
  if (columnIndex === undefined) return null;

  const amountsByColumn = extractAmountsByColumnIndex(row);
  const fromColumn = amountsByColumn.get(columnIndex);
  if (fromColumn !== undefined) return fromColumn;

  return parseCellAmount(row.columns[columnIndex]!);
}

function isRawAmortizationShapeFromRow(
  row: SpatialTableRow,
  headerMapping: ColumnRoleMapping,
): boolean {
  const alignedRoles = getAlignedColumnRolesForRow(row, headerMapping);
  const principal = getRoleAmountFromRow(row, alignedRoles, "principal");
  const interest = getRoleAmountFromRow(row, alignedRoles, "interest");

  if (principal !== null && principal > DEFERRED_ZERO_EPSILON) return true;
  if (interest !== null && interest > DEFERRED_ZERO_EPSILON) return true;

  const orderedMeta = extractOrderedAmountsWithMeta(row, { preserveDeferredRepeats: false });
  const amounts = orderedMeta.deduped;
  if (amounts.length >= 4) {
    if (amounts[1]! > DEFERRED_ZERO_EPSILON || amounts[2]! > DEFERRED_ZERO_EPSILON) {
      return true;
    }
  }

  return false;
}

function isRawDeferredShapeFromRow(
  row: SpatialTableRow,
  headerMapping: ColumnRoleMapping,
): boolean {
  if (isRawAmortizationShapeFromRow(row, headerMapping)) return false;

  const alignedRoles = getAlignedColumnRolesForRow(row, headerMapping);
  const principal = getRoleAmountFromRow(row, alignedRoles, "principal") ?? 0;
  const interest = getRoleAmountFromRow(row, alignedRoles, "interest") ?? 0;

  if (
    Math.abs(principal) > DEFERRED_ZERO_EPSILON ||
    Math.abs(interest) > DEFERRED_ZERO_EPSILON
  ) {
    return false;
  }

  const crd = getRoleAmountFromRow(row, alignedRoles, "remainingCapital");
  if (crd === null || crd <= 0) return false;

  const payment = getRoleAmountFromRow(row, alignedRoles, "payment") ?? 0;
  const insurance = getRoleAmountFromRow(row, alignedRoles, "insurance") ?? 0;
  const maxComponent = Math.max(payment, insurance);

  if (maxComponent <= DEFERRED_ZERO_EPSILON) {
    const amounts = [...extractAmountsByColumnIndex(row).values()].filter((value) => value > 0);
    const smallAmount = amounts.find((value) => value < crd * 0.5);
    return smallAmount !== undefined;
  }

  return maxComponent < crd * 0.5;
}

function extractOrderedAmountsWithMeta(
  row: SpatialTableRow,
  options?: { preserveDeferredRepeats?: boolean },
): OrderedAmountExtraction {
  const raw: number[] = [];

  for (let index = 0; index < row.columns.length; index += 1) {
    const cell = row.columns[index]!;
    if (index === 0 && parseRankValue(cell) !== undefined) continue;
    if (isLikelyDateToken(cell)) continue;

    const amount = parseCellAmount(cell);
    if (amount !== null) raw.push(amount);
  }

  const amountsByColumn = extractAmountsByColumnIndex(row);
  let deduped = [...raw];
  let deduplicationApplied: string | null = null;

  if (
    options?.preserveDeferredRepeats !== false &&
    shouldPreserveMirroredDuplicateColumns(raw, amountsByColumn)
  ) {
    return { raw, deduped: raw, deduplicationApplied: "preserved_deferred_repeats" };
  }

  if (raw.length >= 6 && raw.length % 2 === 0) {
    const half = raw.length / 2;
    const first = raw.slice(0, half);
    const second = raw.slice(half);
    const mirrored = first.every((value, index) => value === second[index]);
    if (mirrored) {
      deduped = first;
      deduplicationApplied = "mirrored_block_halved";
    }
  }

  if (deduplicationApplied === null && raw.length > 4) {
    let maxIndex = 0;
    for (let index = 1; index < raw.length; index += 1) {
      if (Math.abs(raw[index]!) > Math.abs(raw[maxIndex]!)) maxIndex = index;
    }

    const maxValue = raw[maxIndex]!;
    const hasTrailingDuplicate =
      maxIndex >= 3 &&
      maxIndex < raw.length - 1 &&
      maxValue > 1_000 &&
      raw[maxIndex + 1] === raw[0];

    if (hasTrailingDuplicate) {
      deduped = raw.slice(0, maxIndex + 1);
      deduplicationApplied = "trailing_duplicate_block_trimmed";
    }
  }

  return { raw, deduped, deduplicationApplied };
}

function buildRowReconstructionDiagnostics(
  row: SpatialTableRow,
  columnRoles: ColumnRoleMapping,
): RowReconstructionDiagnostics {
  const amountsByColumn = extractAmountsByColumnIndex(row);
  const orderedMeta = extractOrderedAmountsWithMeta(row);
  const parsedAmounts = row.columns.map((column, columnIndex) => ({
    columnIndex,
    column,
    amount: parseCellAmount(column),
  }));

  return {
    rawColumns: [...row.columns],
    mergedColumns: [...row.columns],
    parsedAmounts,
    columnIndexes: [...amountsByColumn.keys()],
    orderedAmountsRaw: orderedMeta.raw,
    deduplicatedColumns: orderedMeta.deduped,
    deduplicationApplied: orderedMeta.deduplicationApplied,
    repeatedAdjacentAmounts: findRepeatedAdjacentColumnAmounts(amountsByColumn),
  };
}

function buildNormalizedAmountsDebug(row: SpatialTableRow): {
  orderedAmounts: number[];
  monetaryTokens: string[];
  perColumnParsed: Array<{ column: string; parsed: number | null }>;
  orderedAmountsRaw: number[];
  deduplicationApplied: string | null;
} {
  const orderedMeta = extractOrderedAmountsWithMeta(row);
  return {
    orderedAmounts: orderedMeta.deduped,
    orderedAmountsRaw: orderedMeta.raw,
    deduplicationApplied: orderedMeta.deduplicationApplied,
    monetaryTokens: extractMonetaryTokens(row.columns),
    perColumnParsed: row.columns.map((column) => ({
      column,
      parsed: parseCellAmount(column),
    })),
  };
}

function logSpatialParserDeferredDebug(params: {
  location: RowLocation;
  installment: SpatialInstallment;
  reconstruction: RowReconstructionDiagnostics;
  assignmentMode: string;
  phaseId?: number;
}): void {
  console.log(LOG_DEFERRED_DEBUG, {
    pdfPage: params.location.pdfPage,
    rowIndexOnPage: params.location.rowIndexOnPage,
    rowY: params.location.rowY,
    date: params.installment.date,
    phaseId: params.phaseId ?? null,
    rawColumns: params.reconstruction.rawColumns,
    mergedColumns: params.reconstruction.mergedColumns,
    parsedAmounts: params.reconstruction.parsedAmounts,
    columnIndexes: params.reconstruction.columnIndexes,
    deduplicatedColumns: params.reconstruction.deduplicatedColumns,
    orderedAmountsRaw: params.reconstruction.orderedAmountsRaw,
    deduplicationApplied: params.reconstruction.deduplicationApplied,
    repeatedAdjacentAmounts: params.reconstruction.repeatedAdjacentAmounts,
    assignmentMode: params.assignmentMode,
    mappedFields: {
      payment: params.installment.payment,
      principal: params.installment.principal,
      interest: params.installment.interest,
      insurance: params.installment.insurance,
      remainingCapital: params.installment.remainingCapital,
    },
  });
}

function buildMappingDebug(
  row: SpatialTableRow,
  columnRoles: ColumnRoleMapping,
  headerColumnCount: number,
): {
  headerColumnCount: number;
  nearbyOrGlobalRoles: Record<string, ColumnRole>;
  alignedColumnRoles: Record<string, ColumnRole>;
  amountRolesInOrder: ColumnRole[];
  assignmentMode: "column_index" | "semantic" | "positional";
} {
  const alignedColumnRoles = alignColumnRolesToDataRow(row, columnRoles, headerColumnCount);
  const amounts = extractOrderedAmountsWithMeta(row).deduped;
  const amountRoles = getAmountRolesInColumnOrder(alignedColumnRoles);
  const columnMapped = assignAmountsFromColumnRoles(
    {},
    row,
    columnRoles,
  );
  const assignmentMode = columnMapped
    ? "column_index"
    : shouldUseSemanticAmountOrder(amountRoles, amounts)
      ? "semantic"
      : "positional";

  return {
    headerColumnCount,
    nearbyOrGlobalRoles: columnRoleMappingToObject(columnRoles),
    alignedColumnRoles: columnRoleMappingToObject(alignedColumnRoles),
    amountRolesInOrder: amountRoles,
    assignmentMode,
  };
}

function logSpatialParserHeaders(rows: SpatialTableRow[]): void {
  for (const row of rows) {
    if (!isHeaderRow(row)) continue;

    const mapping = buildColumnRoleMapping(row);
    const detectedColumns = row.columns
      .map((column) => {
        const role = detectColumnRole(column);
        return role ? ROLE_DISPLAY_LABELS[role] : column.trim();
      })
      .filter(Boolean);

    console.log(LOG_HEADERS, {
      pdfPage: row.pageNumber,
      rowY: Math.round(row.y * 100) / 100,
      detectedColumns,
      headerRowText: row.raw,
      columnRolesByIndex: columnRoleMappingToObject(mapping),
      rawColumns: row.columns,
    });
  }
}

function logSpatialParserRow(params: {
  location: RowLocation;
  rawColumns: string[];
  normalizedAmounts: ReturnType<typeof buildNormalizedAmountsDebug>;
  detectedDate?: string;
  mappedFields: MappedFieldsDebug;
  rank?: number;
  mappingDebug: ReturnType<typeof buildMappingDebug>;
}): void {
  console.log(LOG_ROW, {
    pdfPage: params.location.pdfPage,
    rowIndexOnPage: params.location.rowIndexOnPage,
    rowY: params.location.rowY,
    rank: params.rank,
    rawColumns: params.rawColumns,
    normalizedAmounts: params.normalizedAmounts,
    detectedDate: params.detectedDate,
    mappedFields: params.mappedFields,
    columnMapping: params.mappingDebug,
  });
}

function logSpatialParserRowSkipped(params: {
  location: RowLocation;
  reason: string;
  rawColumns: string[];
  extra?: Record<string, unknown>;
}): void {
  console.log(LOG_ROW_SKIPPED, {
    pdfPage: params.location.pdfPage,
    rowIndexOnPage: params.location.rowIndexOnPage,
    rowY: params.location.rowY,
    reason: params.reason,
    rawColumns: params.rawColumns,
    ...params.extra,
  });
}

export type SpatialInstallment = {
  rank?: number;
  date?: string;
  payment?: number;
  principal?: number;
  interest?: number;
  insurance?: number;
  remainingCapital?: number;
};

export type SpatialAmortizationParseResult = {
  success: boolean;
  confidenceScore: number;
  installments: SpatialInstallment[];
  detectedColumns: string[];
  detectedInstallmentRows: number;
};

export type ColumnRole =
  | "rank"
  | "date"
  | "payment"
  | "principal"
  | "interest"
  | "insurance"
  | "remainingCapital";

export type ColumnRoleMapping = Map<number, ColumnRole>;

export type ColumnSlot = {
  columnIndex: number;
  role: ColumnRole | null;
  minX: number;
  maxX: number;
};

export type ColumnBucketEntry = {
  role: ColumnRole | null;
  columnIndex: number;
  minX: number;
  maxX: number;
  assignedTokens: Array<{ text: string; x: number; width: number }>;
  assignedText: string;
  parsedValue: number | null;
};

const HEADER_ROLE_RULES: Array<{ role: ColumnRole; pattern: RegExp }> = [
  { role: "rank", pattern: /\b(n°|numero|numéro|rang|echeance\s*n)\b/i },
  { role: "date", pattern: /\bdate\b/i },
  {
    role: "payment",
    pattern:
      /\b(montant\s+a\s+recouvrer|echeance|échéance|mensualite|mensualité|montant\s+de\s+l['']?echeance)\b/i,
  },
  { role: "principal", pattern: /\bcapital\s+amorti\b/i },
  {
    role: "interest",
    pattern: /\b(part\s+(des?\s+)?)?interet|intérêt|interets|intérêts\b/i,
  },
  {
    role: "insurance",
    pattern: /\b(assurances?\s+et\s+accessoires|assurances?|accessoires)\b/i,
  },
  { role: "remainingCapital", pattern: /\bcapital\s+restant(\s+du)?\b/i },
];

const AMOUNT_COLUMN_ROLES: ColumnRole[] = [
  "payment",
  "principal",
  "interest",
  "insurance",
  "remainingCapital",
];

const MIN_STATS_SAMPLES = 8;

const TOTAL_ROW_PATTERN =
  /\b(total|totaux|sous[\s-]?total|somme|récapitulatif|recapitulatif|cumulative)\b/i;

function normalizeLabelText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Parses French-formatted amounts (spaces as thousands, comma decimals).
 * Examples: "53 132,92" => 53132.92, "-0,28" => -0.28
 */
export function parseFrenchAmount(raw: string): number | null {
  let cleaned = raw
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/eur/gi, "")
    .replace(/€/g, "")
    .trim();

  if (!cleaned || /[a-z]{2,}/.test(cleaned.replace(/[.,\d\s+\-−]/g, ""))) {
    return null;
  }

  const negative = /^[-−]/.test(cleaned);
  if (negative) cleaned = cleaned.replace(/^[-−]/, "").trim();

  const spacedFrench = cleaned.match(/^([\d\s]+),(\d{1,2})$/);
  if (spacedFrench) {
    const whole = spacedFrench[1]!.replace(/\s/g, "");
    const value = Number.parseFloat(`${whole}.${spacedFrench[2]}`);
    if (!Number.isFinite(value) || Math.abs(value) > 50_000_000) return null;
    const rounded = Math.round(value * 100) / 100;
    return negative ? -rounded : rounded;
  }

  const frenchComma = cleaned.match(/^(\d{1,3}(?:\.\d{3})*|\d+),(\d{1,2})$/);
  if (frenchComma) {
    const whole = frenchComma[1]!.replace(/\./g, "");
    const value = Number.parseFloat(`${whole}.${frenchComma[2]}`);
    if (!Number.isFinite(value) || Math.abs(value) > 50_000_000) return null;
    const rounded = Math.round(value * 100) / 100;
    return negative ? -rounded : rounded;
  }

  const plainComma = cleaned.match(/^(\d+),(\d{1,2})$/);
  if (plainComma) {
    const value = Number.parseFloat(`${plainComma[1]}.${plainComma[2]}`);
    if (!Number.isFinite(value) || Math.abs(value) > 50_000_000) return null;
    const rounded = Math.round(value * 100) / 100;
    return negative ? -rounded : rounded;
  }

  const intOnly = cleaned.match(/^\d+$/);
  if (intOnly) {
    const value = Number.parseFloat(cleaned);
    if (!Number.isFinite(value) || Math.abs(value) > 50_000_000) return null;
    return negative ? -value : value;
  }

  return null;
}

function parseFrenchDateToIsoDirect(token: string): string | undefined {
  const trimmed = token.trim();
  if (!trimmed) return undefined;

  const numeric = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (numeric) {
    let year = numeric[3]!;
    if (year.length === 2) {
      year = Number.parseInt(year, 10) >= 70 ? `19${year}` : `20${year}`;
    }
    const day = Number.parseInt(numeric[1]!, 10);
    const month = Number.parseInt(numeric[2]!, 10);
    const y = Number.parseInt(year, 10);
    if (day < 1 || day > 31 || month < 1 || month > 12 || y < 1990 || y > 2100) return undefined;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const iso = trimmed.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (iso) {
    const y = Number.parseInt(iso[1]!, 10);
    const month = Number.parseInt(iso[2]!, 10);
    const day = Number.parseInt(iso[3]!, 10);
    if (day < 1 || day > 31 || month < 1 || month > 12 || y < 1990 || y > 2100) return undefined;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const compact = digitsOnly(trimmed);
  if (compact.length === 8) {
    const day = Number.parseInt(compact.slice(0, 2), 10);
    const month = Number.parseInt(compact.slice(2, 4), 10);
    const year = Number.parseInt(compact.slice(4, 8), 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1990 && year <= 2100) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return undefined;
}

function parseFrenchDateToIso(
  token: string,
  logContext?: { rowIndex?: number; columnIndex?: number; pdfPage?: number },
): string | undefined {
  const direct = parseFrenchDateToIsoDirect(token);
  if (direct) return direct;

  const extracted = extractDateFromBucketCell(token);
  if (!extracted) return undefined;

  const iso = parseFrenchDateToIsoDirect(extracted);
  if (iso) {
    logDateNormalizationDebug({
      rawCell: token,
      extractedDate: extracted,
      isoDate: iso,
      context: logContext,
    });
  }

  return iso;
}

function detectColumnRole(label: string): ColumnRole | null {
  const normalized = normalizeLabelText(label);
  for (const rule of HEADER_ROLE_RULES) {
    if (rule.pattern.test(normalized)) return rule.role;
  }
  return null;
}

function isHeaderRow(row: SpatialTableRow): boolean {
  if (isProbableInstallmentRow(row.columns)) return false;

  let keywordHits = 0;
  for (const column of row.columns) {
    if (detectColumnRole(column)) keywordHits += 1;
  }

  const joined = normalizeLabelText(row.raw);
  for (const rule of HEADER_ROLE_RULES) {
    if (rule.pattern.test(joined)) keywordHits += 1;
  }

  return keywordHits >= 2;
}

function buildColumnRoleMapping(row: SpatialTableRow): ColumnRoleMapping {
  const mapping: ColumnRoleMapping = new Map();

  for (let index = 0; index < row.columns.length; index += 1) {
    const role = detectColumnRole(row.columns[index]!);
    if (role && !mapping.has(index)) mapping.set(index, role);
  }

  if (mapping.size === 0) {
    const joinedRoles = detectColumnRolesFromJoinedText(row.raw);
    for (const [index, role] of joinedRoles) mapping.set(index, role);
  }

  return mapping;
}

function detectColumnRolesFromJoinedText(raw: string): ColumnRoleMapping {
  const mapping: ColumnRoleMapping = new Map();
  const normalized = normalizeLabelText(raw);

  const fragments: Array<{ role: ColumnRole; pattern: RegExp }> = [
    { role: "rank", pattern: /n°|numero|numéro|rang/i },
    { role: "date", pattern: /\bdate\b/i },
    { role: "payment", pattern: /echeance|échéance|montant a recouvrer/i },
    { role: "principal", pattern: /capital amorti/i },
    { role: "interest", pattern: /interet|intérêt/i },
    { role: "insurance", pattern: /assurances?\s+et\s+accessoires|assurances?/i },
    { role: "remainingCapital", pattern: /capital\s+restant\s+du|capital restant/i },
  ];

  let cursor = 0;
  for (const fragment of fragments) {
    const match = normalized.slice(cursor).match(fragment.pattern);
    if (!match || match.index === undefined) continue;
    const absoluteIndex = cursor + match.index;
    mapping.set(mapping.size, fragment.role);
    cursor = absoluteIndex + match[0].length;
  }

  return mapping;
}

function isTotalOrSubtotalRow(row: SpatialTableRow): boolean {
  const normalized = normalizeLabelText(row.raw);
  if (TOTAL_ROW_PATTERN.test(normalized)) return true;

  return row.columns.some((column) => {
    const label = normalizeLabelText(column);
    return TOTAL_ROW_PATTERN.test(label) && !isLikelyDateToken(column);
  });
}

function findNearbyHeaderMapping(
  rows: SpatialTableRow[],
  rowIndex: number,
): ColumnRoleMapping | null {
  const target = rows[rowIndex];
  if (!target) return null;

  for (
    let offset = 1;
    offset <= HEADER_LOOKUP_DISTANCE && rowIndex - offset >= 0;
    offset += 1
  ) {
    const candidate = rows[rowIndex - offset];
    if (!candidate || candidate.pageNumber !== target.pageNumber) continue;
    if (!isHeaderRow(candidate)) continue;
    const mapping = buildColumnRoleMapping(candidate);
    if (mapping.size > 0) return mapping;
  }

  return null;
}

const ROLE_DISPLAY_LABELS: Record<ColumnRole, string> = {
  rank: "Rang / N°",
  date: "Date",
  payment: "Échéance / Montant à recouvrer",
  principal: "Capital amorti",
  interest: "Intérêts",
  insurance: "Assurances",
  remainingCapital: "Capital restant dû",
};

function extractDetectedColumnLabels(rows: SpatialTableRow[]): string[] {
  const labels = new Set<string>();

  for (const row of rows) {
    if (!isHeaderRow(row)) continue;
    const joined = normalizeLabelText(row.raw);
    for (const rule of HEADER_ROLE_RULES) {
      if (rule.pattern.test(joined)) labels.add(ROLE_DISPLAY_LABELS[rule.role]);
    }
    for (const column of row.columns) {
      const role = detectColumnRole(column);
      if (role) labels.add(ROLE_DISPLAY_LABELS[role]);
    }
  }

  return [...labels];
}

function itemCenterX(item: NormalizedPdfTextItem): number {
  return item.x + item.width / 2;
}

function itemsPerSequentialColumnIndex(
  items: NormalizedPdfTextItem[],
): Map<number, NormalizedPdfTextItem[]> {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const result = new Map<number, NormalizedPdfTextItem[]>();
  let columnIndex = 0;
  let buffer: NormalizedPdfTextItem[] = [];
  let bufferEndX = 0;

  for (const item of sorted) {
    const gap = buffer.length > 0 ? item.x - bufferEndX : 0;
    if (buffer.length > 0 && gap > COLUMN_GAP_THRESHOLD_PX) {
      result.set(columnIndex, buffer);
      columnIndex += 1;
      buffer = [item];
    } else {
      buffer.push(item);
    }
    bufferEndX = item.x + item.width;
  }

  if (buffer.length > 0) result.set(columnIndex, buffer);
  return result;
}

function aggregateXRangesPerColumnIndex(
  rows: SpatialTableRow[],
  roleMapping: ColumnRoleMapping,
): Map<number, { minX: number[]; maxX: number[]; centers: number[] }> {
  const aggregated = new Map<number, { minX: number[]; maxX: number[]; centers: number[] }>();
  const span = mappingColumnSpan(roleMapping);

  const ingestRow = (row: SpatialTableRow): void => {
    if (!row.items?.length) return;
    const perColumn = itemsPerSequentialColumnIndex(row.items);
    for (let columnIndex = 0; columnIndex < span; columnIndex += 1) {
      const itemsInColumn = perColumn.get(columnIndex);
      if (!itemsInColumn?.length) continue;

      const minX = Math.min(...itemsInColumn.map((item) => item.x));
      const maxX = Math.max(...itemsInColumn.map((item) => item.x + item.width));
      const center = (minX + maxX) / 2;
      const bucket = aggregated.get(columnIndex) ?? { minX: [], maxX: [], centers: [] };
      bucket.minX.push(minX);
      bucket.maxX.push(maxX);
      bucket.centers.push(center);
      aggregated.set(columnIndex, bucket);
    }
  };

  for (const row of rows) {
    if (isHeaderRow(row)) ingestRow(row);
  }

  for (const row of rows) {
    if (!isProbableInstallmentRow(row.columns) || !row.items?.length) continue;
    const perColumn = itemsPerSequentialColumnIndex(row.items);
    if (perColumn.size < Math.max(span - 2, 3)) continue;
    ingestRow(row);
  }

  return aggregated;
}

function finalizeSlotBoundariesWithMidpoints(slots: ColumnSlot[]): ColumnSlot[] {
  const sorted = [...slots].sort((a, b) => a.columnIndex - b.columnIndex);
  if (sorted.length === 0) return sorted;

  const centers = sorted.map((slot) => {
    if (slot.minX > 0 || slot.maxX > 0) {
      return (slot.minX + slot.maxX) / 2;
    }
    return slot.columnIndex * 100;
  });

  for (let index = 0; index < sorted.length; index += 1) {
    const prevCenter = index > 0 ? centers[index - 1]! : centers[index]! - 100;
    const currentCenter = centers[index]!;
    const nextCenter =
      index < sorted.length - 1 ? centers[index + 1]! : centers[index]! + 100;

    sorted[index]!.minX = index === 0 ? -Infinity : (prevCenter + currentCenter) / 2;
    sorted[index]!.maxX =
      index === sorted.length - 1 ? Infinity : (currentCenter + nextCenter) / 2;
  }

  return sorted;
}

export function learnColumnSlotLayout(
  rows: SpatialTableRow[],
  roleMapping: ColumnRoleMapping,
): ColumnSlot[] {
  const span = mappingColumnSpan(roleMapping);
  if (span === 0) return [];

  const aggregated = aggregateXRangesPerColumnIndex(rows, roleMapping);
  const slots: ColumnSlot[] = [];

  for (let columnIndex = 0; columnIndex < span; columnIndex += 1) {
    const ranges = aggregated.get(columnIndex);
    const role = roleMapping.get(columnIndex) ?? null;

    if (!ranges || ranges.centers.length === 0) {
      slots.push({
        columnIndex,
        role,
        minX: 0,
        maxX: 0,
      });
      continue;
    }

    slots.push({
      columnIndex,
      role,
      minX: medianOf(ranges.minX),
      maxX: medianOf(ranges.maxX),
    });
  }

  const withGeometry = slots.filter((slot) => slot.minX > 0 || slot.maxX > 0);
  if (withGeometry.length === 0) return finalizeSlotBoundariesWithMidpoints(slots);

  const finalized = finalizeSlotBoundariesWithMidpoints(
    withGeometry.map((slot) => ({
      ...slot,
      role: roleMapping.get(slot.columnIndex) ?? slot.role,
    })),
  );

  const byIndex = new Map(finalized.map((slot) => [slot.columnIndex, slot]));
  const output: ColumnSlot[] = [];
  for (let columnIndex = 0; columnIndex < span; columnIndex += 1) {
    output.push(
      byIndex.get(columnIndex) ?? {
        columnIndex,
        role: roleMapping.get(columnIndex) ?? null,
        minX: -Infinity,
        maxX: Infinity,
      },
    );
  }

  return finalizeSlotBoundariesWithMidpoints(output);
}

function findSlotForCenterX(centerX: number, slots: ColumnSlot[]): ColumnSlot | undefined {
  const ordered = [...slots].sort((a, b) => a.columnIndex - b.columnIndex);

  for (const slot of ordered) {
    const inRange =
      centerX >= slot.minX &&
      (centerX < slot.maxX || (slot.maxX === Infinity && centerX >= slot.minX));
    if (inRange) return slot;
  }

  let nearest: ColumnSlot | undefined;
  let nearestDistance = Infinity;
  for (const slot of ordered) {
    const slotCenter =
      Number.isFinite(slot.minX) && Number.isFinite(slot.maxX)
        ? (slot.minX + slot.maxX) / 2
        : slot.columnIndex * 100;
    const distance = Math.abs(centerX - slotCenter);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = slot;
    }
  }

  return nearest;
}

export function assignRowToFixedColumnSlots(
  items: NormalizedPdfTextItem[],
  slots: ColumnSlot[],
): { columns: string[]; buckets: ColumnBucketEntry[] } {
  const maxIndex = Math.max(...slots.map((slot) => slot.columnIndex), 0);
  const columns = new Array<string>(maxIndex + 1).fill("");
  const itemsByColumn = new Map<number, NormalizedPdfTextItem[]>();

  for (let columnIndex = 0; columnIndex <= maxIndex; columnIndex += 1) {
    itemsByColumn.set(columnIndex, []);
  }

  for (const item of items) {
    const slot = findSlotForCenterX(itemCenterX(item), slots);
    if (!slot) continue;
    itemsByColumn.get(slot.columnIndex)?.push(item);
  }

  const buckets: ColumnBucketEntry[] = slots
    .sort((a, b) => a.columnIndex - b.columnIndex)
    .map((slot) => {
      const assigned = [...(itemsByColumn.get(slot.columnIndex) ?? [])].sort(
        (a, b) => a.x - b.x,
      );
      const assignedText = assigned
        .map((item) => item.text)
        .join(" ")
        .trim();
      const parsedValue = parseCellAmount(assignedText);

      return {
        role: slot.role,
        columnIndex: slot.columnIndex,
        minX: roundStat(slot.minX),
        maxX: roundStat(slot.maxX),
        assignedTokens: assigned.map((item) => ({
          text: item.text,
          x: roundStat(item.x),
          width: roundStat(item.width),
        })),
        assignedText,
        parsedValue,
      };
    });

  for (const bucket of buckets) {
    columns[bucket.columnIndex] = bucket.assignedText;
  }

  return { columns, buckets };
}

export function applyColumnBucketLayoutToRows(
  rows: SpatialTableRow[],
  slots: ColumnSlot[],
): void {
  if (slots.length === 0) return;

  for (const row of rows) {
    if (!row.items?.length) continue;
    const { columns } = assignRowToFixedColumnSlots(row.items, slots);
    row.columns = columns;
    row.raw = columns.join(" ");
  }
}

function slotBoundariesForLog(slots: ColumnSlot[]): Array<{
  columnIndex: number;
  role: ColumnRole | null;
  minX: number;
  maxX: number;
}> {
  return slots
    .sort((a, b) => a.columnIndex - b.columnIndex)
    .map((slot) => ({
      columnIndex: slot.columnIndex,
      role: slot.role,
      minX: roundStat(slot.minX),
      maxX: roundStat(slot.maxX),
    }));
}

function logSpatialParserColumnBuckets(params: {
  pdfPage: number;
  rowIndex: number;
  rawColumns: string[];
  detectedColumnBoundaries: ReturnType<typeof slotBoundariesForLog>;
  columnBuckets: ColumnBucketEntry[];
  extra?: Record<string, unknown>;
}): void {
  console.log(LOG_COLUMN_BUCKETS, {
    pdfPage: params.pdfPage,
    rowIndex: params.rowIndex,
    rawColumns: params.rawColumns,
    detectedColumnBoundaries: params.detectedColumnBoundaries,
    columnBuckets: params.columnBuckets,
    ...params.extra,
  });
}

function validateAmortizationRowBalance(
  installment: SpatialInstallment,
  parsingContext: RowParsingContext,
  logContext: { pdfPage: number; rowIndex: number; date?: string },
): void {
  const principal = installment.principal ?? 0;
  const interest = installment.interest ?? 0;
  if (principal <= DEFERRED_ZERO_EPSILON && interest <= DEFERRED_ZERO_EPSILON) return;

  const payment = installment.payment ?? 0;
  if (payment <= DEFERRED_ZERO_EPSILON) return;

  const components = principal + interest + (installment.insurance ?? 0);
  const delta = Math.abs(payment - components);

  if (delta <= ROW_BALANCE_TOLERANCE_EUR) return;

  console.log(LOG_ROW_BALANCE_ERROR, {
    pdfPage: logContext.pdfPage,
    rowIndex: logContext.rowIndex,
    date: logContext.date,
    loanPhase: parsingContext.loanPhase,
    payment: roundStat(payment),
    principal: roundStat(principal),
    interest: roundStat(interest),
    insurance: roundStat(installment.insurance ?? 0),
    componentSum: roundStat(components),
    delta: roundStat(delta),
    tolerance: ROW_BALANCE_TOLERANCE_EUR,
  });
}

function collectGlobalHeaderMapping(rows: SpatialTableRow[]): {
  mapping: ColumnRoleMapping;
  detectedColumns: string[];
} {
  let bestMapping: ColumnRoleMapping = new Map();
  let bestScore = 0;

  for (const row of rows) {
    if (!isHeaderRow(row)) continue;
    const mapping = buildColumnRoleMapping(row);
    const score = mapping.size;
    if (score > bestScore) {
      bestScore = score;
      bestMapping = mapping;
    }
  }

  const detectedColumns = extractDetectedColumnLabels(rows);

  return { mapping: bestMapping, detectedColumns };
}

function parseRankValue(cell: string): number | undefined {
  const trimmed = cell.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return undefined;
  const rank = Number.parseInt(trimmed, 10);
  return Number.isFinite(rank) ? rank : undefined;
}

function parseCellAmount(cell: string): number | null {
  const direct = parseFrenchAmount(cell);
  if (direct !== null) return direct;

  const tokens = cell.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const merged = tokens.join(" ");
    return parseFrenchAmount(merged);
  }

  return null;
}

function isAmountRole(role: ColumnRole): role is Exclude<ColumnRole, "rank" | "date"> {
  return (
    role === "payment" ||
    role === "principal" ||
    role === "interest" ||
    role === "insurance" ||
    role === "remainingCapital"
  );
}

function setInstallmentAmount(
  installment: SpatialInstallment,
  role: Exclude<ColumnRole, "rank" | "date">,
  amount: number,
): void {
  installment[role] = amount;
}

function mappingColumnSpan(mapping: ColumnRoleMapping): number {
  if (mapping.size === 0) return 0;
  return Math.max(...mapping.keys()) + 1;
}

function roundStat(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export type ColumnNumericStats = {
  columnIndex: number;
  sampleCount: number;
  mean: number;
  median: number;
  max: number;
  zeroRatio: number;
  monotonicDecreaseRatio: number;
  flatRatio: number;
};

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function computeMonotonicDecreaseRatio(series: number[]): number {
  if (series.length < 2) return 0;

  let decreasing = 0;
  let comparable = 0;

  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1]!;
    const current = series[index]!;
    if (previous <= 0 && current <= 0) continue;
    comparable += 1;
    if (current <= previous + 0.01) decreasing += 1;
  }

  return comparable === 0 ? 0 : decreasing / comparable;
}

function computeFlatRatio(series: number[]): number {
  if (series.length < 2) return 0;

  let flat = 0;
  for (let index = 1; index < series.length; index += 1) {
    if (Math.abs(series[index]! - series[index - 1]!) < 0.02) flat += 1;
  }

  return flat / (series.length - 1);
}

function extractAmountsByColumnIndex(row: SpatialTableRow): Map<number, number> {
  const amounts = new Map<number, number>();

  for (let index = 0; index < row.columns.length; index += 1) {
    const cell = row.columns[index]!;
    if (index === 0 && parseRankValue(cell) !== undefined) continue;
    if (isLikelyDateToken(cell)) continue;

    const amount = parseCellAmount(cell);
    if (amount !== null) amounts.set(index, amount);
  }

  return amounts;
}

function computeColumnNumericStats(rows: SpatialTableRow[]): Map<number, ColumnNumericStats> {
  const seriesByColumn = new Map<number, number[]>();

  for (const row of rows) {
    const amounts = extractAmountsByColumnIndex(row);
    for (const [columnIndex, value] of amounts) {
      const series = seriesByColumn.get(columnIndex) ?? [];
      series.push(value);
      seriesByColumn.set(columnIndex, series);
    }
  }

  const stats = new Map<number, ColumnNumericStats>();

  for (const [columnIndex, series] of seriesByColumn) {
    if (series.length < MIN_STATS_SAMPLES) continue;

    const absValues = series.map((value) => Math.abs(value));
    const mean = absValues.reduce((sum, value) => sum + value, 0) / absValues.length;
    const zeroRatio = absValues.filter((value) => Math.abs(value) < 0.01).length / absValues.length;

    stats.set(columnIndex, {
      columnIndex,
      sampleCount: series.length,
      mean,
      median: medianOf(absValues),
      max: Math.max(...absValues),
      zeroRatio,
      monotonicDecreaseRatio: computeMonotonicDecreaseRatio(series),
      flatRatio: computeFlatRatio(series),
    });
  }

  return stats;
}

function scoreColumnForRole(
  columnStats: ColumnNumericStats,
  role: ColumnRole,
  crdReferenceMean: number,
): number {
  switch (role) {
    case "remainingCapital":
      return (
        columnStats.monotonicDecreaseRatio * 50 +
        (columnStats.mean > 10_000 ? 25 : columnStats.mean / 500) +
        (columnStats.max >= columnStats.mean * 0.85 ? 10 : 0)
      );
    case "insurance": {
      const crdLike =
        crdReferenceMean > 0 && columnStats.mean > crdReferenceMean * 0.35;
      return (
        (1 - columnStats.monotonicDecreaseRatio) * 35 +
        columnStats.zeroRatio * 20 +
        (columnStats.mean < crdReferenceMean * 0.12 ? 15 : 0) +
        (crdLike ? -50 : 0)
      );
    }
    case "payment": {
      const crdLikeMonotonic =
        columnStats.monotonicDecreaseRatio >= CRD_MONOTONIC_MIN_RATIO &&
        columnStats.median > crdReferenceMean * PAYMENT_MAX_CRD_MEDIAN_RATIO;
      const tooLargeForPayment =
        crdReferenceMean > 0 && columnStats.median > crdReferenceMean * PAYMENT_MAX_CRD_MEDIAN_RATIO;
      return (
        (1 - columnStats.monotonicDecreaseRatio) * 20 +
        columnStats.zeroRatio * 8 +
        (columnStats.mean > 0 && columnStats.mean < crdReferenceMean * 0.08 ? 12 : 18) +
        (crdLikeMonotonic ? -80 : 0) +
        (tooLargeForPayment ? -60 : 0)
      );
    }
    case "principal":
    case "interest":
      return (
        columnStats.zeroRatio * 28 +
        (1 - columnStats.monotonicDecreaseRatio) * 12 +
        (columnStats.mean < crdReferenceMean * 0.05 ? 12 : 0)
      );
    default:
      return 0;
  }
}

function findColumnIndexForRole(mapping: ColumnRoleMapping, role: ColumnRole): number | undefined {
  for (const [index, mappedRole] of mapping) {
    if (mappedRole === role) return index;
  }
  return undefined;
}

function logSpatialParserAnomaly(params: {
  reason: string;
  row?: SpatialTableRow;
  installment?: SpatialInstallment;
  extra?: Record<string, unknown>;
}): void {
  console.log(LOG_ANOMALY, {
    reason: params.reason,
    pdfPage: params.row?.pageNumber,
    rowY: params.row ? Math.round(params.row.y * 100) / 100 : undefined,
    installment: params.installment,
    ...params.extra,
  });
}

function logColumnAggregateStats(
  headerMapping: ColumnRoleMapping,
  refinedMapping: ColumnRoleMapping,
  statsByColumn: Map<number, ColumnNumericStats>,
): void {
  const entries = [...statsByColumn.values()]
    .sort((a, b) => a.columnIndex - b.columnIndex)
    .map((stats) => {
      let monotonicTrend: "decreasing" | "flat" | "variable" = "variable";
      if (stats.monotonicDecreaseRatio >= 0.65) monotonicTrend = "decreasing";
      else if (stats.flatRatio >= 0.45) monotonicTrend = "flat";

      return {
        columnIndex: stats.columnIndex,
        headerRole: headerMapping.get(stats.columnIndex) ?? null,
        refinedRole: refinedMapping.get(stats.columnIndex) ?? null,
        mean: roundStat(stats.mean),
        median: roundStat(stats.median),
        max: roundStat(stats.max),
        zeroRatio: roundStat(stats.zeroRatio),
        monotonicTrend,
        monotonicDecreaseRatio: roundStat(stats.monotonicDecreaseRatio),
        flatRatio: roundStat(stats.flatRatio),
        sampleCount: stats.sampleCount,
      };
    });

  console.log(LOG_PREFIX, "column_aggregate_stats", { columns: entries });
}

type ColumnRoleRefinementOptions = {
  loanPhase?: LoanPhase | "unknown";
};

function medianOfOtherMonetaryColumns(
  statsByColumn: Map<number, ColumnNumericStats>,
  excludeColumnIndex: number,
): number {
  const medians = [...statsByColumn.entries()]
    .filter(([columnIndex]) => columnIndex !== excludeColumnIndex)
    .map(([, stats]) => stats.median)
    .filter((value) => value > DEFERRED_ZERO_EPSILON);

  return medians.length > 0 ? medianOf(medians) : 0;
}

function isColumnCrdLike(
  columnStats: ColumnNumericStats,
  statsByColumn: Map<number, ColumnNumericStats>,
): boolean {
  const otherMedian = medianOfOtherMonetaryColumns(statsByColumn, columnStats.columnIndex);
  const dominatesOthers =
    otherMedian > 0 && columnStats.median >= otherMedian * CRD_MEDIAN_DOMINANCE_FACTOR;
  const isMonotonic = columnStats.monotonicDecreaseRatio >= CRD_MONOTONIC_MIN_RATIO;
  const isNearlyMonotonic =
    columnStats.monotonicDecreaseRatio >= 0.4 && columnStats.flatRatio < 0.35;

  if (dominatesOthers && (isMonotonic || isNearlyMonotonic)) return true;

  return columnStats.median > 10_000 && isMonotonic;
}

function isInvalidPaymentColumnAssignment(
  columnStats: ColumnNumericStats,
  crdMedian: number,
  crdStats?: ColumnNumericStats,
): { invalid: boolean; reason: string } {
  if (crdMedian <= 0) {
    return { invalid: false, reason: "" };
  }

  if (columnStats.median > crdMedian * PAYMENT_MAX_CRD_MEDIAN_RATIO) {
    return { invalid: true, reason: "payment_median_gt_20pct_crd" };
  }

  if (columnStats.median / crdMedian >= PAYMENT_CRD_MEDIAN_SIMILARITY) {
    return { invalid: true, reason: "payment_median_similar_to_crd" };
  }

  if (
    columnStats.monotonicDecreaseRatio >= CRD_MONOTONIC_MIN_RATIO &&
    columnStats.median > crdMedian * 0.15
  ) {
    return { invalid: true, reason: "payment_column_crd_monotonic_behavior" };
  }

  if (
    crdStats &&
    Math.abs(columnStats.median - crdStats.median) / Math.max(crdStats.median, 1) < 0.05
  ) {
    return { invalid: true, reason: "payment_median_near_crd_median" };
  }

  return { invalid: false, reason: "" };
}

function logSpatialParserBusinessValidation(params: {
  rejectedPaymentColumn: number | null;
  reassignedRemainingCapitalColumn: number | null;
  reassignedPaymentColumn: number | null;
  paymentMedian: number;
  remainingCapitalMedian: number;
  insuranceMedian: number | null;
  reason: string;
  loanPhase: LoanPhase | "unknown";
}): void {
  console.log(LOG_BUSINESS_VALIDATION, {
    rejectedPaymentColumn: params.rejectedPaymentColumn,
    reassignedRemainingCapitalColumn: params.reassignedRemainingCapitalColumn,
    reassignedPaymentColumn: params.reassignedPaymentColumn,
    paymentMedian: roundStat(params.paymentMedian),
    remainingCapitalMedian: roundStat(params.remainingCapitalMedian),
    insuranceMedian:
      params.insuranceMedian === null ? null : roundStat(params.insuranceMedian),
    reason: params.reason,
    loanPhase: params.loanPhase,
  });
}

function findSmallestRepeatedNonZeroColumn(
  statsByColumn: Map<number, ColumnNumericStats>,
  excludeColumns: Set<number>,
): number | undefined {
  let best: { columnIndex: number; score: number } | undefined;

  for (const stats of statsByColumn.values()) {
    if (excludeColumns.has(stats.columnIndex)) continue;
    if (stats.median <= DEFERRED_ZERO_EPSILON || stats.median > DEFERRED_PAYMENT_MAX_ABSOLUTE) {
      continue;
    }

    const score =
      stats.flatRatio * 45 +
      (stats.median < 500 ? 35 : 15) -
      stats.monotonicDecreaseRatio * 40 -
      (stats.median > 2_000 ? 25 : 0);

    if (!best || score > best.score) {
      best = { columnIndex: stats.columnIndex, score };
    }
  }

  return best?.columnIndex;
}

function findBestPaymentColumnCandidate(
  statsByColumn: Map<number, ColumnNumericStats>,
  excludeColumns: Set<number>,
  crdMedian: number,
  crdStats?: ColumnNumericStats,
): number | undefined {
  let best: { columnIndex: number; score: number } | undefined;

  for (const stats of statsByColumn.values()) {
    if (excludeColumns.has(stats.columnIndex)) continue;

    const invalid = isInvalidPaymentColumnAssignment(stats, crdMedian, crdStats);
    if (invalid.invalid) continue;

    const score = scoreColumnForRole(stats, "payment", crdMedian);
    if (!best || score > best.score) {
      best = { columnIndex: stats.columnIndex, score };
    }
  }

  return best?.columnIndex;
}

function findCoupledInsuranceColumn(
  statsByColumn: Map<number, ColumnNumericStats>,
  excludeColumns: Set<number>,
  paymentColumnIndex: number,
  crdMedian: number,
): number | undefined {
  const paymentMedian = statsByColumn.get(paymentColumnIndex)?.median ?? 0;

  for (const stats of statsByColumn.values()) {
    if (excludeColumns.has(stats.columnIndex) || stats.columnIndex === paymentColumnIndex) {
      continue;
    }
    if (stats.median <= DEFERRED_ZERO_EPSILON || stats.median >= crdMedian * 0.2) continue;
    if (Math.abs(stats.median - paymentMedian) <= Math.max(paymentMedian * 0.2, 5)) {
      return stats.columnIndex;
    }
  }

  return undefined;
}

function forceRemainingCapitalOnCrdLikeColumns(
  mapping: ColumnRoleMapping,
  statsByColumn: Map<number, ColumnNumericStats>,
): { mapping: ColumnRoleMapping; forcedColumn: number | null } {
  const next = new Map(mapping);
  let forcedColumn: number | null = null;
  let bestCandidate: ColumnNumericStats | undefined;

  for (const stats of statsByColumn.values()) {
    if (!isColumnCrdLike(stats, statsByColumn)) continue;
    if (!bestCandidate || stats.median > bestCandidate.median) {
      bestCandidate = stats;
    }
  }

  if (!bestCandidate) {
    return { mapping: next, forcedColumn: null };
  }

  for (const [columnIndex, role] of [...next]) {
    if (columnIndex === bestCandidate.columnIndex) {
      next.delete(columnIndex);
    }
    if (role === "remainingCapital") {
      next.delete(columnIndex);
    }
  }

  next.set(bestCandidate.columnIndex, "remainingCapital");
  forcedColumn = bestCandidate.columnIndex;

  return { mapping: next, forcedColumn };
}

function fillMissingAmountRolesAfterValidation(
  mapping: ColumnRoleMapping,
  statsByColumn: Map<number, ColumnNumericStats>,
  options: ColumnRoleRefinementOptions,
): ColumnRoleMapping {
  const next = new Map(mapping);
  const lockedColumns = new Set(next.keys());
  const lockedRoles = new Set(next.values());

  const crdIndex = findColumnIndexForRole(next, "remainingCapital");
  const crdStats = crdIndex !== undefined ? statsByColumn.get(crdIndex) : undefined;
  const crdMedian = crdStats?.median ?? 0;
  const crdReferenceMean = crdStats?.mean ?? crdMedian;

  const rolesToFill = AMOUNT_COLUMN_ROLES.filter((role) => !lockedRoles.has(role));
  const columnsToFill = [...statsByColumn.keys()].filter((index) => !lockedColumns.has(index));

  const pairScores: Array<{ columnIndex: number; role: ColumnRole; score: number }> = [];
  for (const columnIndex of columnsToFill) {
    const columnStats = statsByColumn.get(columnIndex);
    if (!columnStats) continue;

    for (const role of rolesToFill) {
      if (role === "payment") {
        const invalid = isInvalidPaymentColumnAssignment(columnStats, crdMedian, crdStats);
        if (invalid.invalid) continue;
      }
      if (role === "insurance" && crdReferenceMean > 0 && columnStats.mean > crdReferenceMean * 0.35) {
        continue;
      }

      pairScores.push({
        columnIndex,
        role,
        score: scoreColumnForRole(columnStats, role, crdReferenceMean),
      });
    }
  }

  pairScores.sort((a, b) => b.score - a.score);

  for (const pair of pairScores) {
    if (lockedColumns.has(pair.columnIndex) || lockedRoles.has(pair.role)) continue;

    const columnStats = statsByColumn.get(pair.columnIndex);
    if (!columnStats) continue;

    if (pair.role === "remainingCapital" && pair.score < 35) continue;
    if (pair.role === "insurance" && crdReferenceMean > 0 && columnStats.mean > crdReferenceMean * 0.35) {
      continue;
    }

    next.set(pair.columnIndex, pair.role);
    lockedColumns.add(pair.columnIndex);
    lockedRoles.add(pair.role);
  }

  return next;
}

function applyBusinessColumnRoleValidation(
  mapping: ColumnRoleMapping,
  statsByColumn: Map<number, ColumnNumericStats>,
  options: ColumnRoleRefinementOptions = {},
): ColumnRoleMapping {
  const loanPhase = options.loanPhase ?? "unknown";
  const isDeferredPhase = loanPhase === "deferred";
  const rolesBeforeValidation = columnRoleMappingToObject(mapping);

  logSpatialParserTrace({
    functionName: "applyBusinessColumnRoleValidation",
    entered: true,
    rowCount: statsByColumn.size,
    loanPhase,
    rolesBeforeValidation,
  });

  const { mapping: afterCrdForce, forcedColumn: reassignedRemainingCapitalColumn } =
    forceRemainingCapitalOnCrdLikeColumns(mapping, statsByColumn);

  let validated = fillMissingAmountRolesAfterValidation(afterCrdForce, statsByColumn, options);

  const crdIndex =
    findColumnIndexForRole(validated, "remainingCapital") ??
    reassignedRemainingCapitalColumn ??
    undefined;
  const crdStats = crdIndex !== undefined ? statsByColumn.get(crdIndex) : undefined;
  const crdMedian = inferCrdMedianFromStats(statsByColumn, validated);

  let paymentIndex = findColumnIndexForRole(validated, "payment");
  const insuranceIndex = findColumnIndexForRole(validated, "insurance");
  const paymentStats = paymentIndex !== undefined ? statsByColumn.get(paymentIndex) : undefined;
  const insuranceStats = insuranceIndex !== undefined ? statsByColumn.get(insuranceIndex) : undefined;

  let rejectedPaymentColumn: number | null = null;
  let reassignedPaymentColumn: number | null = null;
  let validationReason = "";

  if (paymentStats && paymentIndex !== undefined) {
    const invalidPayment =
      crdMedian > 0
        ? isInvalidPaymentColumnAssignment(paymentStats, crdMedian, crdStats)
        : paymentStats.median > CRITICAL_PAYMENT_MEDIAN_THRESHOLD
          ? { invalid: true, reason: "payment_median_high_without_crd_role" }
          : { invalid: false, reason: "" };
    const paymentApproxCrd =
      crdMedian > 0 && Math.abs(paymentStats.median - crdMedian) / crdMedian < 0.05;
    const deferredPaymentTooHigh =
      isDeferredPhase &&
      insuranceStats !== undefined &&
      insuranceStats.median > DEFERRED_ZERO_EPSILON &&
      paymentStats.median > insuranceStats.median * DEFERRED_PAYMENT_INSURANCE_MAX_RATIO;

    const shouldReject =
      invalidPayment.invalid || paymentApproxCrd || deferredPaymentTooHigh;

    if (shouldReject) {
      rejectedPaymentColumn = paymentIndex;
      validationReason =
        invalidPayment.reason ||
        (paymentApproxCrd
          ? "payment_approx_remaining_capital"
          : "payment_median_gt_5x_insurance_deferred");

      validated.delete(paymentIndex);

      const excludeColumns = new Set<number>();
      if (crdIndex !== undefined) excludeColumns.add(crdIndex);

      const newPaymentIndex = isDeferredPhase
        ? findSmallestRepeatedNonZeroColumn(statsByColumn, excludeColumns)
        : findBestPaymentColumnCandidate(statsByColumn, excludeColumns, crdMedian, crdStats);

      if (newPaymentIndex !== undefined) {
        validated.set(newPaymentIndex, "payment");
        reassignedPaymentColumn = newPaymentIndex;
        excludeColumns.add(newPaymentIndex);

        if (isDeferredPhase) {
          const coupledInsurance = findCoupledInsuranceColumn(
            statsByColumn,
            excludeColumns,
            newPaymentIndex,
            crdMedian,
          );
          if (coupledInsurance !== undefined) {
            for (const [columnIndex, role] of [...validated]) {
              if (role === "insurance") validated.delete(columnIndex);
            }
            validated.set(coupledInsurance, "insurance");
          } else if (insuranceIndex === rejectedPaymentColumn || insuranceIndex === undefined) {
            for (const [columnIndex, role] of [...validated]) {
              if (role === "insurance") validated.delete(columnIndex);
            }
            const insuranceCandidate = findSmallestRepeatedNonZeroColumn(
              statsByColumn,
              excludeColumns,
            );
            if (
              insuranceCandidate !== undefined &&
              insuranceCandidate !== newPaymentIndex
            ) {
              validated.set(insuranceCandidate, "insurance");
            }
          }
        }
      }

      validated = fillMissingAmountRolesAfterValidation(validated, statsByColumn, options);
      paymentIndex = findColumnIndexForRole(validated, "payment");
    }
  }

  if (isDeferredPhase && crdIndex !== undefined && crdMedian > 0) {
    const paymentIdx = findColumnIndexForRole(validated, "payment");
    const paymentColStats = paymentIdx !== undefined ? statsByColumn.get(paymentIdx) : undefined;
    if (paymentColStats && paymentColStats.median >= crdMedian * PAYMENT_MAX_CRD_MEDIAN_RATIO) {
      if (paymentIdx !== undefined) validated.delete(paymentIdx);
      const exclude = new Set<number>([crdIndex]);
      const smallPayment = findSmallestRepeatedNonZeroColumn(statsByColumn, exclude);
      if (smallPayment !== undefined) {
        validated.set(smallPayment, "payment");
        const insuranceColumnAfterForce = findColumnIndexForRole(validated, "insurance");
        logSpatialParserBusinessValidation({
          rejectedPaymentColumn: paymentIdx ?? null,
          reassignedRemainingCapitalColumn,
          reassignedPaymentColumn: smallPayment,
          paymentMedian: statsByColumn.get(smallPayment)?.median ?? 0,
          remainingCapitalMedian: crdMedian,
          insuranceMedian:
            insuranceColumnAfterForce !== undefined
              ? statsByColumn.get(insuranceColumnAfterForce)?.median ?? null
              : null,
          reason: "deferred_force_small_payment_column",
          loanPhase,
        });
      }
      validated = fillMissingAmountRolesAfterValidation(validated, statsByColumn, options);
    }
  }

  validated = enforceCriticalPaymentCrdSeparation(validated, statsByColumn, loanPhase);
  validated = fillMissingAmountRolesAfterValidation(validated, statsByColumn, options);

  logSpatialParserBusinessValidation({
    rejectedPaymentColumn,
    reassignedRemainingCapitalColumn,
    reassignedPaymentColumn,
    paymentMedian: roundStat(
      statsByColumn.get(findColumnIndexForRole(validated, "payment") ?? -1)?.median ?? 0,
    ),
    remainingCapitalMedian: roundStat(crdMedian),
    insuranceMedian: (() => {
      const insuranceCol = findColumnIndexForRole(validated, "insurance");
      return insuranceCol !== undefined
        ? statsByColumn.get(insuranceCol)?.median ?? null
        : null;
    })(),
    reason: validationReason || "business_validation_pass_completed",
    loanPhase,
  });

  logSpatialParserTrace({
    functionName: "applyBusinessColumnRoleValidation",
    entered: false,
    rowCount: statsByColumn.size,
    loanPhase,
    rolesBeforeValidation,
    rolesAfterValidation: columnRoleMappingToObject(validated),
  });

  return validated;
}

function refineColumnRoleMapping(
  headerMapping: ColumnRoleMapping,
  statsByColumn: Map<number, ColumnNumericStats>,
  options: ColumnRoleRefinementOptions = {},
): ColumnRoleMapping {
  logSpatialParserTrace({
    functionName: "refineColumnRoleMapping",
    entered: true,
    rowCount: statsByColumn.size,
    loanPhase: options.loanPhase ?? "unknown",
    rolesBeforeValidation: columnRoleMappingToObject(headerMapping),
  });

  const refined: ColumnRoleMapping = new Map(headerMapping);
  const lockedColumns = new Set<number>();
  const lockedRoles = new Set<ColumnRole>();

  for (const [index, role] of headerMapping) {
    if (!isAmountRole(role)) continue;
    lockedColumns.add(index);
    lockedRoles.add(role);
  }

  const crdCandidates = [...statsByColumn.values()].sort(
    (a, b) => b.monotonicDecreaseRatio - a.monotonicDecreaseRatio || b.mean - a.mean,
  );
  const crdReferenceMean = crdCandidates[0]?.mean ?? 0;

  const headerCrdIndex = findColumnIndexForRole(headerMapping, "remainingCapital");
  if (
    headerCrdIndex === undefined &&
    crdCandidates[0] &&
    crdCandidates[0].monotonicDecreaseRatio >= 0.55
  ) {
    refined.set(crdCandidates[0].columnIndex, "remainingCapital");
    lockedColumns.add(crdCandidates[0].columnIndex);
    lockedRoles.add("remainingCapital");
  }

  const insuranceHeaderIndex = findColumnIndexForRole(headerMapping, "insurance");
  const insuranceStats = insuranceHeaderIndex !== undefined
    ? statsByColumn.get(insuranceHeaderIndex)
    : undefined;

  if (
    insuranceHeaderIndex !== undefined &&
    insuranceStats &&
    crdReferenceMean > 0 &&
    insuranceStats.mean > crdReferenceMean * 0.35
  ) {
    refined.delete(insuranceHeaderIndex);
    lockedColumns.delete(insuranceHeaderIndex);
    lockedRoles.delete("insurance");
    logSpatialParserAnomaly({
      reason: "duplicated_crd_mapping",
      extra: {
        columnIndex: insuranceHeaderIndex,
        insuranceMean: roundStat(insuranceStats.mean),
        crdReferenceMean: roundStat(crdReferenceMean),
      },
    });
  }

  const rolesToFill = AMOUNT_COLUMN_ROLES.filter((role) => !lockedRoles.has(role));
  const columnsToFill = [...statsByColumn.keys()].filter((index) => !lockedColumns.has(index));

  const pairScores: Array<{ columnIndex: number; role: ColumnRole; score: number }> = [];
  for (const columnIndex of columnsToFill) {
    const columnStats = statsByColumn.get(columnIndex);
    if (!columnStats) continue;

    for (const role of rolesToFill) {
      pairScores.push({
        columnIndex,
        role,
        score: scoreColumnForRole(columnStats, role, crdReferenceMean),
      });
    }
  }

  pairScores.sort((a, b) => b.score - a.score);

  for (const pair of pairScores) {
    if (lockedColumns.has(pair.columnIndex) || lockedRoles.has(pair.role)) continue;

    const columnStats = statsByColumn.get(pair.columnIndex);
    if (!columnStats) continue;

    if (pair.role === "remainingCapital" && pair.score < 35) continue;
    if (pair.role === "insurance" && columnStats.mean > crdReferenceMean * 0.35) continue;

    refined.set(pair.columnIndex, pair.role);
    lockedColumns.add(pair.columnIndex);
    lockedRoles.add(pair.role);
  }

  const validated = applyBusinessColumnRoleValidation(refined, statsByColumn, options);

  logSpatialParserTrace({
    functionName: "refineColumnRoleMapping",
    entered: false,
    rowCount: statsByColumn.size,
    loanPhase: options.loanPhase ?? "unknown",
    rolesAfterValidation: columnRoleMappingToObject(validated),
  });

  return validated;
}

function buildColumnMedianContext(
  mapping: ColumnRoleMapping,
  statsByColumn: Map<number, ColumnNumericStats>,
): ColumnMedianContext {
  const context: ColumnMedianContext = {};

  for (const [columnIndex, role] of mapping) {
    const stats = statsByColumn.get(columnIndex);
    if (!stats) continue;

    if (role === "insurance") context.insuranceMedian = stats.median;
    if (role === "payment") context.paymentMedian = stats.median;
    if (role === "remainingCapital") context.crdMedian = stats.median;
  }

  return context;
}

function crdIsUnchanged(
  current: SpatialInstallment,
  previous: SpatialInstallment | undefined,
): boolean {
  const currentCrd = current.remainingCapital;
  const previousCrd = previous?.remainingCapital;
  if (currentCrd === undefined || previousCrd === undefined) return false;
  return Math.abs(currentCrd - previousCrd) < 0.02;
}

function chooseAmountForRole(
  role: Exclude<ColumnRole, "rank" | "date">,
  values: number[],
  installment: SpatialInstallment,
): number {
  if (values.length === 0) return 0;

  if (role === "remainingCapital") {
    return values.reduce(
      (best, value) => (Math.abs(value) > Math.abs(best) ? value : best),
      values[0]!,
    );
  }

  if (role === "principal" || role === "interest") {
    return values.find((value) => Math.abs(value) > DEFERRED_ZERO_EPSILON) ?? values[0]!;
  }

  const crd = installment.remainingCapital;
  const nonCrdLike = values.filter((value) => crd === undefined || value < crd * 0.5);
  return (
    nonCrdLike.find((value) => value > DEFERRED_ZERO_EPSILON) ??
    values.find((value) => value > DEFERRED_ZERO_EPSILON) ??
    values[0]!
  );
}

function preserveDeferredDuplicateSemantics(
  installment: SpatialInstallment,
  amountsByColumn: Map<number, number>,
  row: SpatialTableRow,
): void {
  if (
    Math.abs(installment.principal ?? 0) > DEFERRED_ZERO_EPSILON ||
    Math.abs(installment.interest ?? 0) > DEFERRED_ZERO_EPSILON
  ) {
    return;
  }

  const crd = installment.remainingCapital;
  const repeatedPairs = findRepeatedAdjacentColumnAmounts(amountsByColumn);
  const repeatedValues = repeatedPairs
    .map((pair) => pair.value)
    .filter((value) => crd === undefined || value < crd * 0.5);

  let payment = installment.payment ?? 0;
  let insurance = installment.insurance ?? 0;

  const repeatedSmall =
    repeatedValues.find((value) => value > DEFERRED_ZERO_EPSILON && value < 10_000) ??
    repeatedValues[0];

  if (payment <= DEFERRED_ZERO_EPSILON && repeatedSmall !== undefined) {
    payment = repeatedSmall;
    installment.payment = payment;
  }

  if (insurance <= DEFERRED_ZERO_EPSILON && payment > DEFERRED_ZERO_EPSILON) {
    installment.insurance = payment;
    return;
  }

  if (
    payment > DEFERRED_ZERO_EPSILON &&
    insurance <= DEFERRED_ZERO_EPSILON &&
    repeatedSmall !== undefined &&
    Math.abs(payment - repeatedSmall) < DEFERRED_ZERO_EPSILON
  ) {
    installment.insurance = payment;
    return;
  }

  if (
    insurance > DEFERRED_ZERO_EPSILON &&
    payment <= DEFERRED_ZERO_EPSILON &&
    !row.columns.some((cell) => isLikelyDateToken(cell) && parseCellAmount(cell) === insurance)
  ) {
    installment.payment = insurance;
  }
}

function applyDeferredPeriodHeuristics(
  installment: SpatialInstallment,
  previous: SpatialInstallment | undefined,
  columnRoles: ColumnRoleMapping,
  row: SpatialTableRow,
  parsingContext: RowParsingContext = DEFAULT_ROW_PARSING_CONTEXT,
): void {
  if (!parsingContext.enableDeferredHeuristics || parsingContext.loanPhase === "amortization") {
    return;
  }

  if (
    Math.abs(installment.principal ?? 0) > DEFERRED_ZERO_EPSILON ||
    Math.abs(installment.interest ?? 0) > DEFERRED_ZERO_EPSILON
  ) {
    return;
  }

  const amountsByColumn = extractAmountsByColumnIndex(row);
  preserveDeferredDuplicateSemantics(installment, amountsByColumn, row);

  const payment = installment.payment ?? 0;
  const insurance = installment.insurance ?? 0;
  const crdStable = crdIsUnchanged(installment, previous);
  const repeatedAdjacent = findRepeatedAdjacentColumnAmounts(amountsByColumn);

  if (payment <= DEFERRED_ZERO_EPSILON && insurance <= DEFERRED_ZERO_EPSILON && repeatedAdjacent.length === 0) {
    return;
  }

  const hasInsuranceColumn = findColumnIndexForRole(columnRoles, "insurance") !== undefined;
  const inDeferredShape =
    crdStable ||
    repeatedAdjacent.length > 0 ||
    (installment.remainingCapital !== undefined && payment > 0 && payment < (installment.remainingCapital ?? 0) * 0.05);

  if (!inDeferredShape) return;

  if (payment > DEFERRED_ZERO_EPSILON && insurance <= DEFERRED_ZERO_EPSILON) {
    installment.insurance = payment;
    return;
  }

  if (insurance > DEFERRED_ZERO_EPSILON && payment <= DEFERRED_ZERO_EPSILON) {
    installment.payment = insurance;
    return;
  }

  if (hasInsuranceColumn && payment > DEFERRED_ZERO_EPSILON && insurance > payment * 1.5) {
    installment.insurance = payment;
  }
}

function detectInstallmentAnomalies(
  installment: SpatialInstallment,
  medians: ColumnMedianContext,
): string[] {
  const reasons: string[] = [];
  const payment = installment.payment ?? 0;
  const insurance = installment.insurance ?? 0;
  const crd = installment.remainingCapital ?? 0;
  const principal = installment.principal ?? 0;
  const interest = installment.interest ?? 0;

  if (insurance > 0 && payment > 0 && insurance > payment * 1.02) {
    reasons.push("insurance_gt_payment");
  }

  if (insurance > 0 && crd > 0 && insurance >= crd * 0.5) {
    reasons.push("insurance_gt_remaining_capital");
  }

  if (
    insurance > 0 &&
    medians.crdMedian !== undefined &&
    medians.crdMedian > 0 &&
    insurance >= medians.crdMedian * 0.45
  ) {
    reasons.push("duplicated_crd_mapping");
  }

  if (payment > 0 && principal === 0 && interest === 0 && insurance === 0) {
    reasons.push("impossible_zero_breakdown");
  }

  return reasons;
}

function correctInstallmentFromAnomalies(
  installment: SpatialInstallment,
  reasons: string[],
  previous: SpatialInstallment | undefined,
  columnRoles: ColumnRoleMapping,
  row: SpatialTableRow,
  parsingContext: RowParsingContext = DEFAULT_ROW_PARSING_CONTEXT,
): SpatialInstallment {
  const corrected: SpatialInstallment = { ...installment };

  if (
    reasons.includes("duplicated_crd_mapping") ||
    reasons.includes("insurance_gt_remaining_capital")
  ) {
    const insurance = corrected.insurance ?? 0;
    const crd = corrected.remainingCapital ?? 0;

    if (crd > 0 && insurance > 0 && insurance >= crd * 0.45) {
      corrected.insurance = undefined;
    }

    if (
      corrected.insurance !== undefined &&
      corrected.remainingCapital !== undefined &&
      Math.abs(corrected.insurance - corrected.remainingCapital) < 0.02
    ) {
      corrected.insurance = undefined;
    }
  }

  if (reasons.includes("insurance_gt_payment")) {
    const payment = corrected.payment ?? 0;
    const insurance = corrected.insurance ?? 0;
    if (insurance > payment && payment > 0) {
      corrected.insurance = undefined;
    }
  }

  if (parsingContext.enableDeferredHeuristics) {
    applyDeferredPeriodHeuristics(corrected, previous, columnRoles, row, parsingContext);

    if (reasons.includes("impossible_zero_breakdown")) {
      applyDeferredPeriodHeuristics(corrected, previous, columnRoles, row, parsingContext);
    }
  }

  return corrected;
}

function effectiveMaxColumnIndex(
  row: SpatialTableRow,
  columnRoles: ColumnRoleMapping,
): number {
  const span = mappingColumnSpan(columnRoles);
  if (span === 0) return row.columns.length;

  const leadingRank = parseRankValue(row.columns[0] ?? "") !== undefined;
  const maxIndex = span + (leadingRank ? 1 : 0);
  return Math.min(row.columns.length, maxIndex);
}

function assignAmountsFromColumnRoles(
  installment: SpatialInstallment,
  row: SpatialTableRow,
  columnRoles: ColumnRoleMapping,
  parsingContext: RowParsingContext = DEFAULT_ROW_PARSING_CONTEXT,
): boolean {
  const alignedRoles = alignColumnRolesToDataRow(row, columnRoles, mappingColumnSpan(columnRoles));
  const maxColumn = effectiveMaxColumnIndex(row, alignedRoles);
  const amountsByColumn = extractAmountsByColumnIndex(row);
  const valuesByRole = new Map<Exclude<ColumnRole, "rank" | "date">, number[]>();
  let assignedAmountFields = 0;

  for (let index = 0; index < maxColumn; index += 1) {
    const role = alignedRoles.get(index);
    if (!role || !isAmountRole(role)) continue;

    const amount = amountsByColumn.get(index) ?? parseCellAmount(row.columns[index]!);
    if (amount === null) continue;

    const values = valuesByRole.get(role) ?? [];
    values.push(amount);
    valuesByRole.set(role, values);
    assignedAmountFields += 1;
  }

  for (const [role, values] of valuesByRole) {
    setInstallmentAmount(installment, role, chooseAmountForRole(role, values, installment));
  }

  if (parsingContext.enableDeferredDuplicatePreservation) {
    preserveDeferredDuplicateSemantics(installment, amountsByColumn, row);
  }

  return assignedAmountFields >= 3;
}

function extractOrderedAmounts(row: SpatialTableRow): number[] {
  return extractOrderedAmountsWithMeta(row).deduped;
}

function alignColumnRolesToDataRow(
  row: SpatialTableRow,
  headerMapping: ColumnRoleMapping,
  headerColumnCount: number,
): ColumnRoleMapping {
  if (headerMapping.size === 0) return headerMapping;

  const leadingRank =
    row.columns.length > headerColumnCount && parseRankValue(row.columns[0] ?? "") !== undefined;
  const offset = leadingRank ? 1 : 0;
  const aligned: ColumnRoleMapping = new Map();

  for (const [index, role] of headerMapping) {
    aligned.set(index + offset, role);
  }

  return aligned;
}

function assignAmountsByPosition(
  installment: SpatialInstallment,
  amounts: number[],
): SpatialInstallment {
  if (amounts.length === 0) return installment;

  if (amounts.length >= 5) {
    installment.payment = amounts[0];
    installment.principal = amounts[1];
    installment.interest = amounts[2];
    installment.insurance = amounts[3];
    installment.remainingCapital = amounts[amounts.length - 1];
    return installment;
  }

  if (amounts.length === 4) {
    installment.payment = amounts[0];
    installment.principal = amounts[1];
    installment.interest = amounts[2];
    installment.remainingCapital = amounts[3];
    return installment;
  }

  installment.payment = amounts[0];
  installment.principal = amounts[1];
  installment.interest = amounts[2];
  if (amounts.length > 3) {
    installment.remainingCapital = amounts[amounts.length - 1];
  }

  return installment;
}

function getAmountRolesInColumnOrder(columnRoles: ColumnRoleMapping): ColumnRole[] {
  const amountRoles: ColumnRole[] = [];
  const sortedIndexes = [...columnRoles.keys()].sort((a, b) => a - b);

  for (const index of sortedIndexes) {
    const role = columnRoles.get(index);
    if (!role) continue;
    if (
      role === "payment" ||
      role === "principal" ||
      role === "interest" ||
      role === "insurance" ||
      role === "remainingCapital"
    ) {
      amountRoles.push(role);
    }
  }

  return amountRoles;
}

function shouldUseSemanticAmountOrder(
  amountRoles: ColumnRole[],
  amounts: number[],
): boolean {
  if (amountRoles.length < 3 || amounts.length < 3) return false;
  if (amountRoles.length !== amounts.length) return false;

  const uniqueRoles = new Set(amountRoles.filter(isAmountRole));
  return uniqueRoles.size === amountRoles.length;
}

function assignAmountsBySemanticOrder(
  installment: SpatialInstallment,
  amounts: number[],
  amountRoles: ColumnRole[],
): void {
  if (shouldUseSemanticAmountOrder(amountRoles, amounts)) {
    for (let index = 0; index < amounts.length; index += 1) {
      const role = amountRoles[index]!;
      if (!isAmountRole(role)) continue;
      setInstallmentAmount(installment, role, amounts[index]!);
    }
    return;
  }

  assignAmountsByPosition(installment, amounts);
}

function rowToInstallment(
  row: SpatialTableRow,
  columnRoles: ColumnRoleMapping,
  headerColumnCount: number,
  parsingContext: RowParsingContext = DEFAULT_ROW_PARSING_CONTEXT,
): { installment: SpatialInstallment; assignmentMode: "column_index" | "semantic" | "positional" } {
  if (columnRoles.size === 0) {
    logSpatialParserTrace({
      functionName: "rowToInstallment",
      entered: true,
      loanPhase: parsingContext.loanPhase,
      extra: { warning: "empty_column_roles", pdfPage: row.pageNumber },
    });
  }

  const installment: SpatialInstallment = {};
  const alignedRoles = alignColumnRolesToDataRow(row, columnRoles, headerColumnCount);

  for (let index = 0; index < row.columns.length; index += 1) {
    const cell = row.columns[index]!;
    const role = alignedRoles.get(index);
    const dateLogContext = {
      rowIndex: row.pageNumber,
      columnIndex: index,
      pdfPage: row.pageNumber,
    };
    if (role === "rank") {
      const rank = parseRankValue(cell);
      if (rank !== undefined) installment.rank = rank;
    }
    if (role === "date" || (!installment.date && isLikelyDateToken(cell))) {
      const iso = parseFrenchDateToIso(cell, dateLogContext);
      if (iso) installment.date = iso;
    }
  }

  if (!installment.date) {
    for (let index = 0; index < row.columns.length; index += 1) {
      const cell = row.columns[index]!;
      const iso = parseFrenchDateToIso(cell, {
        rowIndex: row.pageNumber,
        columnIndex: index,
        pdfPage: row.pageNumber,
      });
      if (iso) {
        installment.date = iso;
        break;
      }
    }
  }

  if (installment.rank === undefined) {
    const first = row.columns[0];
    if (first) {
      const rank = parseRankValue(first);
      if (rank !== undefined) installment.rank = rank;
    }
  }

  const mappedByColumn = assignAmountsFromColumnRoles(
    installment,
    row,
    columnRoles,
    parsingContext,
  );

  let assignmentMode: "column_index" | "semantic" | "positional" = mappedByColumn
    ? "column_index"
    : "positional";

  if (!mappedByColumn) {
    const amounts = extractOrderedAmountsWithMeta(row, {
      preserveDeferredRepeats: parsingContext.preserveOrderedAmountRepeats,
    }).deduped;
    const amountRoles = getAmountRolesInColumnOrder(alignedRoles);
    if (shouldUseSemanticAmountOrder(amountRoles, amounts)) assignmentMode = "semantic";
    assignAmountsBySemanticOrder(installment, amounts, amountRoles);
  }

  applyDeferredPeriodHeuristics(
    installment,
    parsingContext.previousInstallment,
    columnRoles,
    row,
    parsingContext,
  );

  const medians = parsingContext.columnMedians ?? {};
  const anomalies = detectInstallmentAnomalies(installment, medians);
  if (anomalies.length === 0) {
    return { installment, assignmentMode };
  }

  for (const reason of anomalies) {
    logSpatialParserAnomaly({
      reason,
      row,
      installment,
    });
  }

  const corrected = correctInstallmentFromAnomalies(
    installment,
    anomalies,
    parsingContext.previousInstallment,
    columnRoles,
    row,
    parsingContext,
  );

  return { installment: corrected, assignmentMode };
}

type DeferredBlock = {
  phaseId: number;
  start: number;
  end: number;
  stableCrd: number;
  phasePayment: number;
};

function isDeferredInstallmentShape(
  row: SpatialInstallment,
  stableCrd?: number,
): boolean {
  if (
    Math.abs(row.principal ?? 0) > DEFERRED_ZERO_EPSILON ||
    Math.abs(row.interest ?? 0) > DEFERRED_ZERO_EPSILON
  ) {
    return false;
  }

  const payment = row.payment ?? 0;
  const insurance = row.insurance ?? 0;
  const crd = row.remainingCapital;

  if (crd === undefined) return false;
  if (stableCrd !== undefined && Math.abs(crd - stableCrd) > 0.02) return false;

  if (payment <= DEFERRED_ZERO_EPSILON && insurance <= DEFERRED_ZERO_EPSILON) {
    return stableCrd !== undefined && Math.abs(crd - stableCrd) <= 0.02;
  }

  const maxComponent = Math.max(payment, insurance);
  if (maxComponent >= crd * 0.5) return false;

  return true;
}

function detectDeferredBlocks(installments: SpatialInstallment[]): DeferredBlock[] {
  const blocks: DeferredBlock[] = [];
  let start = -1;
  let stableCrd: number | undefined;
  let phaseId = 0;

  for (let index = 0; index < installments.length; index += 1) {
    const row = installments[index]!;
    const inBlock = isDeferredInstallmentShape(row, stableCrd);

    if (inBlock) {
      if (start < 0) {
        start = index;
        stableCrd = row.remainingCapital;
      } else if (row.remainingCapital !== undefined && stableCrd !== undefined) {
        stableCrd = (stableCrd + row.remainingCapital) / 2;
      }
      continue;
    }

    if (start >= 0 && index - start >= DEFERRED_PHASE_MIN_ROWS - 1) {
      const slice = installments.slice(start, index);
      const crds = slice
        .map((item) => item.remainingCapital)
        .filter((value): value is number => value !== undefined);
      const payments = slice
        .map((item) => item.payment ?? item.insurance ?? 0)
        .filter((value) => value > DEFERRED_ZERO_EPSILON);

      blocks.push({
        phaseId,
        start,
        end: index - 1,
        stableCrd: stableCrd ?? (crds.length > 0 ? medianOf(crds) : 0),
        phasePayment: payments.length > 0 ? mode(payments) : 0,
      });
      phaseId += 1;
    }

    start = -1;
    stableCrd = undefined;
  }

  if (start >= 0 && installments.length - start >= DEFERRED_PHASE_MIN_ROWS - 1) {
    const slice = installments.slice(start);
    const crds = slice
      .map((item) => item.remainingCapital)
      .filter((value): value is number => value !== undefined);
    const payments = slice
      .map((item) => item.payment ?? item.insurance ?? 0)
      .filter((value) => value > DEFERRED_ZERO_EPSILON);

    blocks.push({
      phaseId,
      start,
      end: installments.length - 1,
      stableCrd: stableCrd ?? (crds.length > 0 ? medianOf(crds) : 0),
      phasePayment: payments.length > 0 ? mode(payments) : 0,
    });
  }

  return blocks;
}

function applyDeferredBlockMapping(
  installments: SpatialInstallment[],
  block: DeferredBlock,
): void {
  for (let index = block.start; index <= block.end; index += 1) {
    const row = installments[index]!;
    if (
      Math.abs(row.principal ?? 0) > DEFERRED_ZERO_EPSILON ||
      Math.abs(row.interest ?? 0) > DEFERRED_ZERO_EPSILON
    ) {
      continue;
    }

    const payment = row.payment ?? 0;
    const insurance = row.insurance ?? 0;
    const effectivePayment =
      payment > DEFERRED_ZERO_EPSILON
        ? payment
        : insurance > DEFERRED_ZERO_EPSILON
          ? insurance
          : block.phasePayment;

    if (effectivePayment <= DEFERRED_ZERO_EPSILON) continue;

    row.payment = effectivePayment;
    row.insurance = effectivePayment;
    row.principal = 0;
    row.interest = 0;

    if (row.remainingCapital === undefined && block.stableCrd > 0) {
      row.remainingCapital = block.stableCrd;
    } else if (
      row.remainingCapital !== undefined &&
      Math.abs(row.remainingCapital - block.stableCrd) <= 0.02
    ) {
      row.remainingCapital = block.stableCrd;
    }
  }
}

function propagateDeferredInsuranceConsistencyInRange(
  installments: SpatialInstallment[],
  rangeStart: number,
  rangeEnd: number,
  windowSize: number,
): void {
  for (let index = rangeStart; index <= rangeEnd; index += 1) {
    const windowStart = Math.max(rangeStart, index - windowSize + 1);
    const window = installments.slice(windowStart, index + 1);
    if (window.length < windowSize) continue;

    const crdValues = window
      .map((row) => row.remainingCapital)
      .filter((value): value is number => value !== undefined);
    if (crdValues.length < windowSize) continue;

    const stableCrd = medianOf(crdValues);
    if (stableCrd <= 0) continue;

    const crdStable = crdValues.every((value) => Math.abs(value - stableCrd) <= 0.02);
    if (!crdStable) continue;

    const zeroPrincipalInterest = window.filter(
      (row) =>
        Math.abs(row.principal ?? 0) <= DEFERRED_ZERO_EPSILON &&
        Math.abs(row.interest ?? 0) <= DEFERRED_ZERO_EPSILON,
    );
    if (zeroPrincipalInterest.length < windowSize) continue;

    const paymentValues = zeroPrincipalInterest
      .map((row) => row.payment ?? row.insurance ?? 0)
      .filter((value) => value > DEFERRED_ZERO_EPSILON);
    if (paymentValues.length < 2) continue;

    const referencePayment = mode(paymentValues);

    for (const row of zeroPrincipalInterest) {
      const payment = row.payment ?? 0;
      const insurance = row.insurance ?? 0;
      const effectivePayment =
        payment > DEFERRED_ZERO_EPSILON
          ? payment
          : insurance > DEFERRED_ZERO_EPSILON
            ? insurance
            : referencePayment;

      if (effectivePayment <= DEFERRED_ZERO_EPSILON) continue;
      if (effectivePayment >= stableCrd * 0.5) continue;

      row.payment = effectivePayment;
      row.insurance = effectivePayment;
      row.principal = 0;
      row.interest = 0;
      row.remainingCapital = stableCrd;
    }
  }
}

function propagateDeferredInsuranceConsistency(
  installments: SpatialInstallment[],
  windowSize: number,
): void {
  if (installments.length === 0) return;
  propagateDeferredInsuranceConsistencyInRange(installments, 0, installments.length - 1, windowSize);
}

function logSpatialParserPhaseTransition(transition: EnginePhaseTransition): void {
  console.log(LOG_PHASE_TRANSITION, {
    previousPhase: transition.previousPhase,
    nextPhase: transition.nextPhase,
    rowIndex: transition.rowIndex,
    installmentIndex: transition.installmentIndex,
    pdfPage: transition.pdfPage,
    transitionReason: transition.transitionReason,
    resetHeuristics: transition.resetHeuristics,
  });
}

function rowPhaseSignal(
  row: SpatialTableRow,
  headerMapping: ColumnRoleMapping,
): "deferred" | "amortizing" | "ambiguous" {
  if (isRawAmortizationShapeFromRow(row, headerMapping)) return "amortizing";
  if (isRawDeferredShapeFromRow(row, headerMapping)) return "deferred";
  return "ambiguous";
}

function buildPhasePlan(
  records: InstallmentParseRecord[],
  headerMapping: ColumnRoleMapping,
): { segments: EnginePhaseSegment[]; transitions: EnginePhaseTransition[] } {
  const labels: LoanPhase[] = new Array(records.length).fill("amortization");
  const transitions: EnginePhaseTransition[] = [];

  let consecutiveDeferred = 0;
  let activeDeferredStart = -1;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const signal = rowPhaseSignal(record.row, headerMapping);

    if (signal === "deferred") {
      consecutiveDeferred += 1;
      if (consecutiveDeferred >= DEFERRED_RUN_FOR_TRANSITION) {
        if (activeDeferredStart < 0) activeDeferredStart = index - consecutiveDeferred + 1;
        for (let labelIndex = activeDeferredStart; labelIndex <= index; labelIndex += 1) {
          labels[labelIndex] = "deferred";
        }
      }
      continue;
    }

    if (signal === "amortizing" && consecutiveDeferred >= DEFERRED_RUN_FOR_TRANSITION) {
      const deferredStart = activeDeferredStart >= 0 ? activeDeferredStart : index - consecutiveDeferred;
      for (let labelIndex = deferredStart; labelIndex < index; labelIndex += 1) {
        labels[labelIndex] = "deferred";
      }

      transitions.push({
        installmentIndex: index,
        rowIndex: record.sourceRowIndex,
        pdfPage: record.location.pdfPage,
        previousPhase: "deferred",
        nextPhase: "amortization",
        transitionReason: "principal_or_interest_positive_after_deferred_block",
        resetHeuristics: [
          "insurance_equals_payment",
          "deferred_duplicate_preservation",
          "repeated_adjacent_amount_semantics",
          "stable_crd_deferred_assumptions",
          "global_column_stats",
        ],
      });

      activeDeferredStart = -1;
      consecutiveDeferred = 0;
      continue;
    }

    if (signal === "amortizing") {
      consecutiveDeferred = 0;
      activeDeferredStart = -1;
      continue;
    }

    if (activeDeferredStart >= 0 && consecutiveDeferred >= DEFERRED_RUN_FOR_TRANSITION) {
      labels[index] = "deferred";
    }
  }

  const segments: EnginePhaseSegment[] = [];
  if (records.length === 0) return { segments, transitions };

  let segmentPhase = labels[0]!;
  let segmentStart = 0;

  for (let index = 1; index <= records.length; index += 1) {
    const nextPhase = index < records.length ? labels[index]! : null;
    if (nextPhase === segmentPhase && index < records.length) continue;

    segments.push({ phase: segmentPhase, start: segmentStart, end: index - 1 });
    if (nextPhase === null) break;
    segmentPhase = nextPhase;
    segmentStart = index;
  }

  return { segments, transitions };
}

function reparseDeferredSegment(
  records: InstallmentParseRecord[],
  installments: SpatialInstallment[],
  segment: EnginePhaseSegment,
  headerMapping: ColumnRoleMapping,
): void {
  logSpatialParserTrace({
    functionName: "reparseDeferredSegment",
    entered: true,
    rowCount: segment.end - segment.start + 1,
    loanPhase: "deferred",
    extra: { segmentStart: segment.start, segmentEnd: segment.end },
  });

  const calibrationRows = records
    .slice(segment.start, segment.end + 1)
    .map((record) => record.row);
  const deferredStats = computeColumnNumericStats(calibrationRows);
  const deferredMapping = refineColumnRoleMapping(headerMapping, deferredStats, {
    loanPhase: "deferred",
  });
  const deferredMedians = buildColumnMedianContext(deferredMapping, deferredStats);

  const headerColumnCount =
    mappingColumnSpan(deferredMapping) || records[segment.start]?.headerColumnCount || 0;

  let previousInstallment =
    segment.start > 0 ? installments[segment.start - 1] : undefined;

  for (let index = segment.start; index <= segment.end; index += 1) {
    const record = records[index]!;
    const parsingContext: RowParsingContext = {
      loanPhase: "deferred",
      enableDeferredHeuristics: true,
      enableDeferredDuplicatePreservation: true,
      preserveOrderedAmountRepeats: true,
      columnMedians: deferredMedians,
      previousInstallment,
    };

    const { installment, assignmentMode } = rowToInstallment(
      record.row,
      deferredMapping,
      headerColumnCount || record.headerColumnCount,
      parsingContext,
    );

    installments[index] = installment;
    record.installment = installment;
    record.assignmentMode = assignmentMode;
    previousInstallment = installment;
  }

  logSpatialParserTrace({
    functionName: "reparseDeferredSegment",
    entered: false,
    rowCount: segment.end - segment.start + 1,
    loanPhase: "deferred",
    rolesAfterValidation: columnRoleMappingToObject(deferredMapping),
  });
}

function applyDeferredPhasePostProcessingScoped(
  records: InstallmentParseRecord[],
  installments: SpatialInstallment[],
  segments: EnginePhaseSegment[],
  headerMapping: ColumnRoleMapping,
): DeferredBlock[] {
  const blocks: DeferredBlock[] = [];
  let phaseId = 0;

  for (const segment of segments) {
    if (segment.phase !== "deferred") continue;

    reparseDeferredSegment(records, installments, segment, headerMapping);

    const slice = installments.slice(segment.start, segment.end + 1);
    const subBlocks = detectDeferredBlocks(slice);

    for (const subBlock of subBlocks) {
      const globalBlock: DeferredBlock = {
        ...subBlock,
        phaseId,
        start: subBlock.start + segment.start,
        end: subBlock.end + segment.start,
      };
      applyDeferredBlockMapping(installments, globalBlock);
      blocks.push(globalBlock);
      phaseId += 1;
    }

    propagateDeferredInsuranceConsistencyInRange(
      installments,
      segment.start,
      segment.end,
      DEFERRED_PROPAGATION_WINDOW,
    );
  }

  return blocks;
}

function reparseAmortizationSegment(
  records: InstallmentParseRecord[],
  installments: SpatialInstallment[],
  segment: EnginePhaseSegment,
  headerMapping: ColumnRoleMapping,
): void {
  logSpatialParserTrace({
    functionName: "reparseAmortizationSegment",
    entered: true,
    rowCount: segment.end - segment.start + 1,
    loanPhase: "amortization",
    extra: { segmentStart: segment.start, segmentEnd: segment.end },
  });

  const calibrationEnd = Math.min(
    segment.end + 1,
    segment.start + AMORTIZATION_CALIBRATION_ROWS,
  );
  const calibrationRows = records.slice(segment.start, calibrationEnd).map((record) => record.row);
  const amortizationStats = computeColumnNumericStats(calibrationRows);
  const amortizationMapping = refineColumnRoleMapping(headerMapping, amortizationStats, {
    loanPhase: "amortization",
  });
  const amortizationMedians = buildColumnMedianContext(amortizationMapping, amortizationStats);

  const headerColumnCount =
    mappingColumnSpan(amortizationMapping) || records[segment.start]?.headerColumnCount || 0;

  let previousInstallment =
    segment.start > 0 ? installments[segment.start - 1] : undefined;

  for (let index = segment.start; index <= segment.end; index += 1) {
    const record = records[index]!;
    const parsingContext: RowParsingContext = {
      loanPhase: "amortization",
      enableDeferredHeuristics: false,
      enableDeferredDuplicatePreservation: false,
      preserveOrderedAmountRepeats: false,
      columnMedians: amortizationMedians,
      previousInstallment,
    };

    const { installment, assignmentMode } = rowToInstallment(
      record.row,
      amortizationMapping,
      headerColumnCount || record.headerColumnCount,
      parsingContext,
    );

    installments[index] = installment;
    record.installment = installment;
    record.assignmentMode = assignmentMode;
    previousInstallment = installment;
  }

  logSpatialParserTrace({
    functionName: "reparseAmortizationSegment",
    entered: false,
    rowCount: segment.end - segment.start + 1,
    loanPhase: "amortization",
    rolesAfterValidation: columnRoleMappingToObject(amortizationMapping),
  });
}

function applyLoanPhaseLifecycle(
  records: InstallmentParseRecord[],
  installments: SpatialInstallment[],
  headerMapping: ColumnRoleMapping,
): { segments: EnginePhaseSegment[]; transitions: EnginePhaseTransition[]; deferredBlocks: DeferredBlock[] } {
  logSpatialParserTrace({
    functionName: "applyLoanPhaseLifecycle",
    entered: true,
    rowCount: records.length,
    loanPhase: "unknown",
  });

  const { segments, transitions } = buildPhasePlan(records, headerMapping);

  for (const transition of transitions) {
    logSpatialParserPhaseTransition(transition);
  }

  const deferredBlocks = applyDeferredPhasePostProcessingScoped(
    records,
    installments,
    segments,
    headerMapping,
  );

  for (const segment of segments) {
    if (segment.phase !== "amortization") continue;
    reparseAmortizationSegment(records, installments, segment, headerMapping);
  }

  logSpatialParserTrace({
    functionName: "applyLoanPhaseLifecycle",
    entered: false,
    rowCount: records.length,
    extra: {
      segmentCount: segments.length,
      transitionCount: transitions.length,
      deferredBlockCount: deferredBlocks.length,
    },
  });

  return { segments, transitions, deferredBlocks };
}

function isDeferredRowForDebug(
  installment: SpatialInstallment,
  reconstruction: RowReconstructionDiagnostics,
): boolean {
  if (
    Math.abs(installment.principal ?? 0) > DEFERRED_ZERO_EPSILON ||
    Math.abs(installment.interest ?? 0) > DEFERRED_ZERO_EPSILON
  ) {
    return false;
  }

  if (reconstruction.repeatedAdjacentAmounts.length > 0) return true;
  if (looksLikeDeferredOrderedAmounts(reconstruction.orderedAmountsRaw)) return true;

  const payment = installment.payment ?? 0;
  const crd = installment.remainingCapital ?? 0;
  return payment > 0 && crd > 0 && payment < crd * 0.05;
}

function countPopulatedFields(installment: SpatialInstallment): number {
  return [
    installment.date,
    installment.payment,
    installment.principal,
    installment.interest,
    installment.insurance,
    installment.remainingCapital,
  ].filter((value) => value !== undefined).length;
}

function isAcceptableDeferredInstallment(installment: SpatialInstallment): boolean {
  if (!installment.date?.trim()) return false;

  const remainingCapital = installment.remainingCapital;
  if (remainingCapital === undefined || remainingCapital <= 0) return false;

  const principal = installment.principal ?? 0;
  const interest = installment.interest ?? 0;
  if (
    Math.abs(principal) > DEFERRED_ZERO_EPSILON ||
    Math.abs(interest) > DEFERRED_ZERO_EPSILON
  ) {
    return false;
  }

  const payment = installment.payment ?? 0;
  const insurance = installment.insurance ?? 0;
  return payment > DEFERRED_ZERO_EPSILON || insurance > DEFERRED_ZERO_EPSILON;
}

function isWellFormedInstallment(installment: SpatialInstallment): boolean {
  if (!installment.date) return false;
  if (isAcceptableDeferredInstallment(installment)) return true;
  return countPopulatedFields(installment) >= 3;
}

function detectPhaseLabelForRow(
  row: SpatialTableRow,
  installment: SpatialInstallment | undefined,
  headerMapping: ColumnRoleMapping,
): "deferred" | "amortization" | "ambiguous" | "unknown" {
  if (installment && isAcceptableDeferredInstallment(installment)) return "deferred";

  if (installment) {
    const principal = installment.principal ?? 0;
    const interest = installment.interest ?? 0;
    if (principal > DEFERRED_ZERO_EPSILON || interest > DEFERRED_ZERO_EPSILON) {
      return "amortization";
    }
  }

  const signal = rowPhaseSignal(row, headerMapping);
  if (signal === "deferred") return "deferred";
  if (signal === "amortizing") return "amortization";
  return "ambiguous";
}

function shouldTraceRowLifecycle(row: SpatialTableRow): boolean {
  if (isTotalOrSubtotalRow(row)) return false;
  if (isHeaderRow(row)) return false;
  return row.columns.some((column) => column.trim().length > 0);
}

function logSpatialParserRowLifecycle(params: {
  sourceRowIndex: number;
  pdfPage: number;
  rowIndexOnPage: number;
  rawColumns: string[];
  bucketAlignedColumns: string[];
  detectedPhase: string;
  isProbableInstallmentRow: boolean;
  survivedFiltering: boolean;
  filteredReason: string | null;
  parsedInstallment: SpatialInstallment | null;
  extra?: Record<string, unknown>;
}): void {
  console.log(LOG_ROW_LIFECYCLE, {
    rowIndex: params.rowIndexOnPage,
    sourceRowIndex: params.sourceRowIndex,
    pdfPage: params.pdfPage,
    rawColumns: params.rawColumns,
    bucketAlignedColumns: params.bucketAlignedColumns,
    detectedPhase: params.detectedPhase,
    isProbableInstallmentRow: params.isProbableInstallmentRow,
    survivedFiltering: params.survivedFiltering,
    filteredReason: params.filteredReason,
    parsedInstallment: params.parsedInstallment,
    ...params.extra,
  });
}

function logSpatialParserDeferredRowPreserved(params: {
  pdfPage: number;
  rowIndex: number;
  sourceRowIndex: number;
  installment: SpatialInstallment;
  reason: string;
}): void {
  console.log(LOG_DEFERRED_ROW_PRESERVED, {
    pdfPage: params.pdfPage,
    rowIndex: params.rowIndex,
    sourceRowIndex: params.sourceRowIndex,
    reason: params.reason,
    installment: params.installment,
  });
}

function isAmortizationPhaseInstallment(installment: SpatialInstallment): boolean {
  const principal = installment.principal ?? 0;
  const interest = installment.interest ?? 0;
  return principal > DEFERRED_ZERO_EPSILON || interest > DEFERRED_ZERO_EPSILON;
}

function mode(values: number[]): number {
  if (values.length === 0) return 0;
  const tally = new Map<number, number>();
  for (const value of values) {
    tally.set(value, (tally.get(value) ?? 0) + 1);
  }
  let best = values[0]!;
  let bestCount = 0;
  for (const [value, count] of tally) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function computeMonotonicCrdRatio(installments: SpatialInstallment[]): number {
  const crdValues = installments
    .map((row) => row.remainingCapital)
    .filter((value): value is number => value !== undefined);

  if (crdValues.length < 2) return 0;

  let decreasing = 0;
  let comparable = 0;

  for (let index = 1; index < crdValues.length; index += 1) {
    const previous = crdValues[index - 1]!;
    const current = crdValues[index]!;
    if (previous <= 0 || current <= 0) continue;
    comparable += 1;
    if (current <= previous + 0.01) decreasing += 1;
  }

  return comparable === 0 ? 0 : decreasing / comparable;
}

function computeConfidenceScore(params: {
  installments: SpatialInstallment[];
  probableInstallmentRows: number;
  parsedInstallmentRows: number;
  headerRoleCount: number;
  fieldCounts: number[];
  monotonicCrdRatio: number;
}): number {
  const {
    installments,
    probableInstallmentRows,
    parsedInstallmentRows,
    headerRoleCount,
    fieldCounts,
    monotonicCrdRatio,
  } = params;

  if (installments.length === 0 || probableInstallmentRows === 0) return 0;

  const parseRatio = Math.min(parsedInstallmentRows / probableInstallmentRows, 1);
  const dominantCount = mode(fieldCounts);
  const consistentRows =
    dominantCount > 0 ? fieldCounts.filter((count) => count === dominantCount).length : 0;
  const consistencyRatio = fieldCounts.length > 0 ? consistentRows / fieldCounts.length : 0;
  const datedRows = installments.filter((row) => row.date).length;
  const dateRatio = datedRows / installments.length;
  const headerRatio = Math.min(headerRoleCount / 5, 1);
  const volumeRatio = Math.min(installments.length / 12, 1);

  const raw =
    parseRatio * 30 +
    consistencyRatio * 25 +
    dateRatio * 15 +
    headerRatio * 15 +
    monotonicCrdRatio * 10 +
    volumeRatio * 5;

  return Math.round(Math.min(100, Math.max(0, raw)));
}

export async function parseSpatialAmortizationFromRows(
  rows: SpatialTableRow[],
  meta: { totalPages: number; source: string; fiscalYear?: number },
): Promise<SpatialAmortizationParseResult> {
  const LOG = "[spatial-parser-trace]";
  const { logPipelineEntry, logPipelineEntryCatch } = await import(
    "@/lib/lmnp/services/pipeline-entry-debug"
  );

  logPipelineEntry({
    functionName: "parseSpatialAmortizationFromRows",
    entered: true,
    extra: { source: meta.source, totalPages: meta.totalPages, rowCount: rows.length },
  });

  console.log(LOG, {
    functionName: "parseSpatialAmortizationFromRows",
    entered: true,
    rowCount: rows.length,
    extra: { source: meta.source, totalPages: meta.totalPages },
  });

  try {
    const { runAmortizationPipeline } = await import("./pipeline/run-amortization-pipeline");
    const { logPipelineDebug, logPipelineResultValidity } = await import(
      "./pipeline/pipeline-instrumentation"
    );

    const pipelineResult = runAmortizationPipeline(rows, {
      source: meta.source,
      totalPages: meta.totalPages,
      fiscalYear: meta.fiscalYear,
      enableDebugLogs: true,
    });

    logPipelineResultValidity({
      source: meta.source,
      pipelineResult,
      ctxErrors: [],
    });

    const datedCount = pipelineResult.installments.filter((row) => Boolean(row.date?.trim())).length;

    logPipelineDebug("parseSpatialAmortizationFromRows_result", {
      source: meta.source,
      pipelineSuccess: pipelineResult.success,
      confidenceScore: pipelineResult.confidenceScore,
      installmentCount: pipelineResult.installments.length,
      datedInstallmentCount: datedCount,
      spatialParseResultSuccess: pipelineResult.success,
      traceStageH: pipelineResult.trace.stageH,
    });

    const result: SpatialAmortizationParseResult = {
      success: pipelineResult.success,
      confidenceScore: pipelineResult.confidenceScore,
      installments: pipelineResult.installments,
      detectedColumns: pipelineResult.detectedColumns,
      detectedInstallmentRows: pipelineResult.detectedInstallmentRows,
    };

    console.log(LOG, {
      functionName: "parseSpatialAmortizationFromRows",
      entered: false,
      rowCount: rows.length,
      extra: {
        success: result.success,
        confidenceScore: result.confidenceScore,
        installmentCount: result.installments.length,
        datedInstallmentCount: datedCount,
      },
    });

    logPipelineEntry({
      functionName: "parseSpatialAmortizationFromRows",
      returned: true,
      success: result.success,
      failureReason: result.success ? null : `confidence_${result.confidenceScore}`,
      installmentCount: result.installments.length,
      datedInstallmentCount: datedCount,
      extra: { source: meta.source },
    });

    return result;
  } catch (error) {
    logPipelineEntryCatch("parseSpatialAmortizationFromRows", error, {
      extra: { source: meta.source, rowCount: rows.length },
    });
    console.error("[amortization-pipeline-debug] parseSpatialAmortizationFromRows_throw", {
      source: meta.source,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      rowCount: rows.length,
    });
    throw error;
  }
}

/** @internal Amortization pipeline bridge — do not import from app code. */
export {
  isTotalOrSubtotalRow,
  isHeaderRow,
  collectGlobalHeaderMapping,
  computeColumnNumericStats,
  refineColumnRoleMapping,
  buildColumnMedianContext,
  findNearbyHeaderMapping,
  mappingColumnSpan,
  rowToInstallment,
  buildPhasePlan,
  parseCellAmount,
  parseFrenchDateToIso,
  isAcceptableDeferredInstallment,
  isWellFormedInstallment,
  countPopulatedFields,
  computeMonotonicCrdRatio,
  computeConfidenceScore,
  columnRoleMappingToObject,
  isAmortizationPhaseInstallment,
  scoreColumnForRole,
  slotBoundariesForLog,
};
