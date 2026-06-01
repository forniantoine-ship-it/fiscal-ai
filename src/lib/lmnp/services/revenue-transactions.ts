import { monthKeyForTransaction, monthLabelFromKey } from "./revenue-aggregation";
import {
  enrichTransactionsWithClusters,
  LOW_CONFIDENCE_THRESHOLD,
  partitionTransactions,
  processRawFinancialLines,
  splitLowConfidence,
  structuredLinesToTransactions,
} from "./revenue-transaction-pipeline";
import {
  logRevenueRuntimeStage,
  logRevenueSourceOfTruth,
} from "./revenus-runtime-trace";
import { isStructuredRawLine } from "./revenus-structured-table-parser";
import {
  isDateDerivedAmount,
  isDateLikeValue,
  looksLikeCalendarInteger,
} from "./revenus-column-semantics";
import type {
  RevenueMonthlyGridRow,
  RevenueRawLine,
  RevenueTransaction,
  RevenueTransactionCategory,
} from "../types";

export {
  filterAtomicLines,
  isGridEligibleTransaction,
  isIsolatedCategory,
  LOW_CONFIDENCE_THRESHOLD,
  processRawFinancialLines,
  splitLowConfidence,
} from "./revenue-transaction-pipeline";

const LOYER_CATEGORIES = new Set<RevenueTransactionCategory>(["rent"]);
const AUTRES_CATEGORIES = new Set<RevenueTransactionCategory>([
  "additional_income",
  "platform_payout",
  "caf_subsidy",
  "reimbursement",
]);
const CHARGE_CATEGORIES = new Set<RevenueTransactionCategory>(["charges", "fee"]);

function isComplementTransaction(transaction: RevenueTransaction): boolean {
  return (
    transaction.category === "additional_income" ||
    /compl[eé]ment/i.test(transaction.label ?? transaction.description)
  );
}

function logComplementGridMapping(
  stage: "aggregate_input" | "aggregate_skip" | "aggregate_bucket",
  transaction: RevenueTransaction,
  detail: Record<string, unknown>,
): void {
  if (!isComplementTransaction(transaction)) return;
  console.log("[revenue-grid-mapping]", {
    stage,
    transactionId: transaction.id,
    category: transaction.category,
    confidence: transaction.confidence ?? null,
    amount: transaction.amount,
    date: transaction.date,
    monthLabel: transaction.monthLabel ?? null,
    structuredMapping: transaction.structuredMapping ?? false,
    ...detail,
  });
}

export function transactionCategoryLabel(category: RevenueTransactionCategory): string {
  switch (category) {
    case "rent":
      return "Loyer";
    case "additional_income":
      return "Complément / autres revenus";
    case "deposit":
      return "Dépôt de garantie";
    case "caf_subsidy":
      return "CAF / aide";
    case "reimbursement":
      return "Remboursement";
    case "internal_transfer":
      return "Virement interne";
    case "owner_contribution":
    case "owner_transfer":
      return "Apport propriétaire";
    case "platform_payout":
      return "Versement plateforme";
    case "charges":
      return "Charges";
    case "fee":
      return "Frais / commission";
    default:
      return "Flux non identifié";
  }
}

export function buildMonthKeys(fiscalYear: number): string[] {
  return Array.from({ length: 12 }, (_, index) =>
    `${fiscalYear}-${String(index + 1).padStart(2, "0")}`,
  );
}

export function createEmptyGridRows(fiscalYear: number): RevenueMonthlyGridRow[] {
  return buildMonthKeys(fiscalYear).map((monthKey) => ({
    monthKey,
    month: monthLabelFromKey(monthKey),
    loyers: 0,
    autresRevenus: 0,
    charges: 0,
  }));
}

function parseEventDate(date: string | null): Date | null {
  if (!date?.trim()) return null;
  const normalized = date.includes("/") ? date.split("/").reverse().join("-") : date;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysApart(a: string | null, b: string | null): number | null {
  const left = parseEventDate(a);
  const right = parseEventDate(b);
  if (!left || !right) return null;
  return Math.abs(left.getTime() - right.getTime()) / 86_400_000;
}

function pickPreferredTransaction(
  current: RevenueTransaction,
  candidate: RevenueTransaction,
): RevenueTransaction {
  const currentScore = current.confidence ?? 0;
  const candidateScore = candidate.confidence ?? 0;
  if (candidateScore > currentScore) {
    return {
      ...candidate,
      mergedFromIds: [...new Set([...(candidate.mergedFromIds ?? []), current.id])],
      deduplicated: true,
    };
  }
  return {
    ...current,
    mergedFromIds: [...new Set([...(current.mergedFromIds ?? []), candidate.id])],
    deduplicated: true,
  };
}

function areLikelyDuplicateTransactions(a: RevenueTransaction, b: RevenueTransaction): boolean {
  if (a.id === b.id) return false;
  if (Math.abs(a.amount - b.amount) > 1) return false;
  if (a.direction !== b.direction) return false;

  const distance = daysApart(a.date, b.date);
  if (distance === null || distance > 7) return false;

  const descA = (a.label ?? a.description).toLowerCase();
  const descB = (b.label ?? b.description).toLowerCase();
  return descA.includes(descB.slice(0, 4)) || descB.includes(descA.slice(0, 4));
}

export function deduplicateTransactions(transactions: RevenueTransaction[]): {
  transactions: RevenueTransaction[];
  deduplicatedCount: number;
} {
  const kept: RevenueTransaction[] = [];
  const removedIds = new Set<string>();
  let deduplicatedCount = 0;

  for (const transaction of transactions) {
    if (removedIds.has(transaction.id)) continue;

    let merged = { ...transaction };
    for (const other of transactions) {
      if (other.id === merged.id || removedIds.has(other.id)) continue;
      if (!areLikelyDuplicateTransactions(merged, other)) continue;
      merged = pickPreferredTransaction(merged, other);
      removedIds.add(other.id);
      deduplicatedCount += 1;
    }
    kept.push(merged);
  }

  return { transactions: kept, deduplicatedCount };
}

/**
 * Aggregate only months with observed high-confidence transactions — never infer missing months.
 */
export function aggregateTransactionsToGrid(
  transactions: RevenueTransaction[],
  fiscalYear: number,
  existingRows?: RevenueMonthlyGridRow[],
): RevenueMonthlyGridRow[] {
  const baseRows = existingRows ?? createEmptyGridRows(fiscalYear);
  const monthBuckets = new Map<string, { loyers: number; autresRevenus: number; charges: number }>();

  for (const transaction of transactions) {
    logComplementGridMapping("aggregate_input", transaction, {
      direction: transaction.direction,
      userValidated: transaction.userValidated ?? false,
    });

    const monthKey = monthKeyForTransaction(transaction, fiscalYear);
    if (!monthKey) {
      logComplementGridMapping("aggregate_skip", transaction, {
        reason: "missing_month_key",
        fiscalYear,
      });
      continue;
    }

    const bucket = monthBuckets.get(monthKey) ?? { loyers: 0, autresRevenus: 0, charges: 0 };
    const rawValue = String(transaction.amount);
    const parsedAmount = Math.abs(transaction.amount);

    if (
      isDateLikeValue(rawValue) ||
      looksLikeCalendarInteger(rawValue) ||
      isDateDerivedAmount(parsedAmount, rawValue)
    ) {
      logComplementGridMapping("aggregate_skip", transaction, {
        reason: "date_guard_rejected_amount",
        monthKey,
        rawValue,
      });
      continue;
    }

    if (transaction.direction === "credit") {
      if (LOYER_CATEGORIES.has(transaction.category)) bucket.loyers += parsedAmount;
      else if (AUTRES_CATEGORIES.has(transaction.category)) {
        bucket.autresRevenus += parsedAmount;
        logComplementGridMapping("aggregate_bucket", transaction, {
          monthKey,
          column: "autresRevenus",
          bucketValue: bucket.autresRevenus,
        });
      } else if (transaction.category === "unknown" && transaction.userValidated) {
        bucket.autresRevenus += parsedAmount;
        logComplementGridMapping("aggregate_bucket", transaction, {
          monthKey,
          column: "autresRevenus",
          bucketValue: bucket.autresRevenus,
          via: "user_validated_unknown",
        });
      } else {
        logComplementGridMapping("aggregate_skip", transaction, {
          reason: "category_not_mapped_to_autres",
          monthKey,
          category: transaction.category,
        });
      }
    } else if (CHARGE_CATEGORIES.has(transaction.category)) {
      bucket.charges += parsedAmount;
    } else {
      logComplementGridMapping("aggregate_skip", transaction, {
        reason: "non_credit_non_charge",
        monthKey,
        direction: transaction.direction,
        category: transaction.category,
      });
    }

    monthBuckets.set(monthKey, bucket);
  }

  return baseRows.map((row) => {
    const bucket = monthBuckets.get(row.monthKey);
    if (!bucket) return row;
    return {
      ...row,
      loyers: bucket.loyers,
      autresRevenus: bucket.autresRevenus,
      charges: bucket.charges,
    };
  });
}

export function processPropertyTransactions(
  input: RevenueRawLine[] | RevenueTransaction[],
  fiscalYear: number,
  existingRows?: RevenueMonthlyGridRow[],
  preserveUserGrid = false,
): {
  transactions: RevenueTransaction[];
  lowConfidenceTransactions: RevenueTransaction[];
  isolatedTransactions: RevenueTransaction[];
  rows: RevenueMonthlyGridRow[];
  deduplicatedCount: number;
  hasSecurityDeposit: boolean;
} {
  const inputKind = isRawLineInput(input) ? "RevenueRawLine[]" : "RevenueTransaction[]";
  const isStructuredBatch =
    isRawLineInput(input) && input.length > 0 && input.every(isStructuredRawLine);

  logRevenueRuntimeStage("transaction_extraction", {
    fn: "processPropertyTransactions",
    inputKind,
    preserveUserGrid,
    structuredTable: isStructuredBatch,
  });

  const atomicTransactions = isStructuredBatch
    ? structuredLinesToTransactions(input, fiscalYear)
    : isRawLineInput(input)
      ? processRawFinancialLines(input, fiscalYear)
      : enrichValidatedTransactions(input, fiscalYear);

  logRevenueRuntimeStage("normalization", {
    fn: "processPropertyTransactions",
    transactionCount: atomicTransactions.length,
  });

  const { transactions: deduped, deduplicatedCount } = isStructuredBatch
    ? { transactions: atomicTransactions, deduplicatedCount: 0 }
    : deduplicateTransactions(atomicTransactions);

  logRevenueRuntimeStage("clustering", {
    fn: isStructuredBatch
      ? "structured_mapping_only"
      : "deduplicateTransactions + splitLowConfidence + partitionTransactions",
    deduplicatedCount,
    skipRecurrenceHeuristics: isStructuredBatch,
  });

  const { highConfidence, lowConfidence } = isStructuredBatch
    ? { highConfidence: deduped, lowConfidence: [] as RevenueTransaction[] }
    : splitLowConfidence(deduped);
  const { gridCandidates, isolated } = isStructuredBatch
    ? { gridCandidates: deduped, isolated: [] as RevenueTransaction[] }
    : partitionTransactions(highConfidence);

  const rows =
    preserveUserGrid && existingRows && !isStructuredBatch
      ? existingRows
      : aggregateTransactionsToGrid(gridCandidates, fiscalYear, existingRows);

  logRevenueRuntimeStage("aggregation", {
    fn: "aggregateTransactionsToGrid",
    gridCandidateCount: gridCandidates.length,
    lowConfidenceCount: lowConfidence.length,
    isolatedCount: isolated.length,
    preserveUserGrid: preserveUserGrid && !isStructuredBatch,
    structuredTable: isStructuredBatch,
    populatedMonths: rows.filter(
      (row) => row.loyers > 0 || row.autresRevenus > 0 || row.charges > 0,
    ).length,
  });

  if (preserveUserGrid && !isStructuredBatch) {
    logRevenueSourceOfTruth("user_grid_edit", {
      fn: "processPropertyTransactions",
      action: "skipped_grid_overwrite",
    });
  } else {
    logRevenueSourceOfTruth("normalized_transactions", {
      fn: "processPropertyTransactions",
      action: "grid_from_transactions",
    });
  }

  return {
    transactions: deduped,
    lowConfidenceTransactions: lowConfidence,
    isolatedTransactions: isolated,
    rows,
    deduplicatedCount,
    hasSecurityDeposit: isolated.some((item) => item.category === "deposit"),
  };
}

function isRawLineInput(input: RevenueRawLine[] | RevenueTransaction[]): input is RevenueRawLine[] {
  if (!input.length) return true;
  return "sourceDocumentId" in input[0] && !("category" in input[0]);
}

function enrichValidatedTransactions(
  transactions: RevenueTransaction[],
  fiscalYear: number,
): RevenueTransaction[] {
  const validated = transactions.filter((transaction) => transaction.userValidated);
  const pending = transactions.filter((transaction) => !transaction.userValidated);
  return [
    ...enrichTransactionsWithClusters(pending, fiscalYear),
    ...validated.map((transaction) => ({
      ...transaction,
      confidence: Math.max(transaction.confidence ?? 0, LOW_CONFIDENCE_THRESHOLD + 5),
    })),
  ];
}

export function validatePropertyTransaction(
  transactions: RevenueTransaction[],
  transactionId: string,
  fiscalYear: number,
): RevenueTransaction[] {
  return transactions.map((transaction) =>
    transaction.id === transactionId
      ? {
          ...transaction,
          userValidated: true,
          confidence: Math.max(transaction.confidence ?? 0, LOW_CONFIDENCE_THRESHOLD + 5),
        }
      : transaction,
  );
}
