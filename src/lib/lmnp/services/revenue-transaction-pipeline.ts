import { monthKeyForTransaction, monthKeyFromDate, parseEventDate } from "./revenue-aggregation";
import { logRevenueRuntimeStage } from "./revenus-runtime-trace";
import {
  categoryForStructuredLine,
  isStructuredRawLine,
  monthKeyForStructuredLine,
} from "./revenus-structured-table-parser";
import { isDateLikeValue, looksLikeCalendarInteger, rejectDateAsGridMoney } from "./revenus-column-semantics";
import { gridColumnForCategory, logRevenueRowMapping } from "./revenus-row-mapping";
import type {
  RevenueRawLine,
  RevenueTransaction,
  RevenueTransactionCategory,
} from "../types";

export const LOW_CONFIDENCE_THRESHOLD = 70;
const ISOLATED_LARGE_AMOUNT_THRESHOLD = 1200;

const SUMMARY_LINE_PATTERNS =
  /\b(total|sous[\s-]?total|solde|cumul|balance|r[eé]capitulatif|montant total|report|somme)\b/i;

const RENT_LABEL_PATTERNS =
  /\b(loyer|locatif|location|quittance|bail|locataire|tenant|rent)\b/i;
const DEPOSIT_PATTERNS = /\b(d[eé]p[oô]t|garantie|caution|deposit)\b/i;
const REIMBURSEMENT_PATTERNS = /\b(rembours|refund|avoir|trop[\s-]?perçu)\b/i;
const INTERNAL_TRANSFER_PATTERNS =
  /\b(virement interne|transfert interne|own account|compte [àa] compte|vir interne)\b/i;
const OWNER_CONTRIBUTION_PATTERNS =
  /\b(apport|contribution|virement propri[eé]taire|owner contribution|compte courant)\b/i;
const PLATFORM_PATTERNS = /\b(airbnb|booking|abritel|vrbo|plateforme|payout|versement)\b/i;
const CAF_PATTERNS = /\b(caf|apl|als|aide au logement|allocation)\b/i;
const CHARGE_PATTERNS = /\b(charges loc|provision charges|charges locatives)\b/i;
const FEE_PATTERNS = /\b(commission|frais bancaire|frais|fee)\b/i;

export type TransactionCluster = {
  id: string;
  transactions: RevenueTransaction[];
  normalizedLabel: string;
  counterparty: string | null;
  amountAnchor: number;
  direction: RevenueTransaction["direction"];
  distinctMonths: number;
  recurrenceScore: number;
  sameAmountRepeats: number;
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeLabel(label: string): string {
  const normalized = normalizeText(label);
  const tokens = normalized.split(" ").filter((token) => token.length > 2);
  return tokens.slice(0, 4).join(" ");
}

function inferLineKind(line: RevenueRawLine): RevenueRawLine["lineKind"] {
  if (line.lineKind && line.lineKind !== "atomic") return line.lineKind;
  const label = normalizeText(line.label ?? "");
  if (line.explicitlyMarkedAsRent) return "atomic";
  if (SUMMARY_LINE_PATTERNS.test(label)) {
    if (/\bsous[\s-]?total\b/i.test(label)) return "subtotal";
    if (/\bsolde\b/i.test(label) || /\bbalance\b/i.test(label)) return "balance";
    if (/\bcumul\b/i.test(label)) return "summary";
    return "total";
  }
  return "atomic";
}

/** Drop totals, subtotals, balances, and cumulative summary rows. */
export function filterAtomicLines(lines: RevenueRawLine[]): RevenueRawLine[] {
  return lines.filter((line) => {
    const kind = inferLineKind(line);
    if (kind === "atomic") return true;
    return Boolean(line.explicitlyMarkedAsRent);
  });
}

function heuristicCategory(line: RevenueRawLine): RevenueTransactionCategory {
  const label = line.label ?? "";
  if (line.explicitlyMarkedAsRent) return "rent";
  if (DEPOSIT_PATTERNS.test(label)) return "deposit";
  if (INTERNAL_TRANSFER_PATTERNS.test(label)) return "internal_transfer";
  if (OWNER_CONTRIBUTION_PATTERNS.test(label)) return "owner_contribution";
  if (REIMBURSEMENT_PATTERNS.test(label)) return "reimbursement";
  if (PLATFORM_PATTERNS.test(label)) return "platform_payout";
  if (CAF_PATTERNS.test(label)) return "caf_subsidy";
  if (FEE_PATTERNS.test(label) || (line.direction === "debit" && /\bfrais\b/i.test(label))) {
    return "fee";
  }
  if (CHARGE_PATTERNS.test(label)) return "charges";
  if (RENT_LABEL_PATTERNS.test(label)) return "rent";
  return "unknown";
}

export function rawLinesToTransactions(lines: RevenueRawLine[]): RevenueTransaction[] {
  // Cycle 17 — le signe est désormais préservé, comme pour le chemin Excel/CSV
  // structuré (Cycle 15B) : un montant négatif (régularisation, avoir) dans une
  // colonne de revenu ne doit jamais devenir une recette positive par un
  // Math.abs() aveugle. `direction` reste le signal fiscal principal (credit/
  // debit) ; `amount` porte désormais son signe réel tel qu'extrait/déclaré.
  return lines.map((line) => ({
    id: line.id ?? crypto.randomUUID(),
    date: line.date ?? null,
    description: line.label ?? "Flux détecté",
    label: line.label,
    amount: line.amount,
    direction: line.direction,
    category: heuristicCategory(line),
    accountContext: line.accountContext,
    counterparty: line.counterparty,
    explicitlyMarkedAsRent: line.explicitlyMarkedAsRent,
    lineKind: inferLineKind(line),
    sourceDocumentId: line.sourceDocumentId,
    sourceType: line.sourceType,
    confidence: line.confidence ?? 40,
  }));
}

function clusterSignature(transaction: RevenueTransaction): string {
  const labelKey = tokenizeLabel(transaction.label ?? transaction.description);
  const counterpartyKey = transaction.counterparty
    ? normalizeText(transaction.counterparty)
    : labelKey;
  const amountKey = Math.round(transaction.amount);
  return `${transaction.direction}|${counterpartyKey}|${amountKey}|${labelKey}`;
}

export function buildTransactionClusters(
  transactions: RevenueTransaction[],
  fiscalYear: number,
): TransactionCluster[] {
  const groups = new Map<string, RevenueTransaction[]>();

  for (const transaction of transactions) {
    const key = clusterSignature(transaction);
    const bucket = groups.get(key) ?? [];
    bucket.push(transaction);
    groups.set(key, bucket);
  }

  return [...groups.entries()].map(([key, clusterTransactions]) => {
    const months = new Set<string>();
    for (const transaction of clusterTransactions) {
      const monthKey = monthKeyFromDate(transaction.date, fiscalYear);
      if (monthKey) months.add(monthKey);
    }

    const amountCounts = new Map<number, number>();
    for (const transaction of clusterTransactions) {
      const rounded = Math.round(transaction.amount);
      amountCounts.set(rounded, (amountCounts.get(rounded) ?? 0) + 1);
    }
    const sameAmountRepeats = Math.max(...amountCounts.values(), 1);

    const recurrenceScore = scoreClusterRecurrence(clusterTransactions, months.size, sameAmountRepeats);
    const anchor = clusterTransactions[0];

    return {
      id: key,
      transactions: clusterTransactions,
      normalizedLabel: tokenizeLabel(anchor.label ?? anchor.description),
      counterparty: anchor.counterparty ?? null,
      amountAnchor: anchor.amount,
      direction: anchor.direction,
      distinctMonths: months.size,
      recurrenceScore,
      sameAmountRepeats,
    };
  });
}

function scoreClusterRecurrence(
  transactions: RevenueTransaction[],
  distinctMonths: number,
  sameAmountRepeats: number,
): number {
  let score = 0;

  if (distinctMonths >= 2) score += 20;
  if (distinctMonths >= 3) score += 20;
  if (distinctMonths >= 6) score += 15;
  if (sameAmountRepeats >= 2) score += 15;
  if (sameAmountRepeats >= 4) score += 10;

  const dated = transactions
    .map((transaction) => parseEventDate(transaction.date))
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime());

  if (dated.length >= 2) {
    const intervals: number[] = [];
    for (let index = 1; index < dated.length; index += 1) {
      intervals.push((dated[index].getTime() - dated[index - 1].getTime()) / 86_400_000);
    }
    const monthlyLike = intervals.filter((days) => days >= 20 && days <= 40).length;
    if (monthlyLike >= 1) score += 15;
    if (monthlyLike >= 3) score += 10;
  }

  const rentWordingHits = transactions.filter((transaction) =>
    RENT_LABEL_PATTERNS.test(transaction.label ?? transaction.description),
  ).length;
  if (rentWordingHits >= 1) score += 10;
  if (rentWordingHits >= 3) score += 10;

  return Math.min(score, 100);
}

function classifyCluster(cluster: TransactionCluster): {
  category: RevenueTransactionCategory;
  confidence: number;
} {
  const sample = cluster.transactions[0];
  const label = sample.label ?? sample.description;
  let category = sample.category;
  let confidence = 40 + Math.min(cluster.recurrenceScore * 0.25, 25);

  if (sample.explicitlyMarkedAsRent) {
    return { category: "rent", confidence: Math.max(confidence, 88) };
  }

  if (DEPOSIT_PATTERNS.test(label)) {
    return { category: "deposit", confidence: Math.max(confidence, 90) };
  }
  if (INTERNAL_TRANSFER_PATTERNS.test(label)) {
    return { category: "internal_transfer", confidence: Math.max(confidence, 82) };
  }
  if (OWNER_CONTRIBUTION_PATTERNS.test(label)) {
    return { category: "owner_contribution", confidence: Math.max(confidence, 78) };
  }
  if (REIMBURSEMENT_PATTERNS.test(label)) {
    return { category: "reimbursement", confidence: Math.max(confidence, 75) };
  }
  if (PLATFORM_PATTERNS.test(label)) {
    return { category: "platform_payout", confidence: Math.max(confidence, 72) };
  }
  if (CAF_PATTERNS.test(label)) {
    return { category: "caf_subsidy", confidence: Math.max(confidence, 74) };
  }
  if (CHARGE_PATTERNS.test(label)) {
    return { category: "charges", confidence: Math.max(confidence, 80) };
  }
  if (FEE_PATTERNS.test(label)) {
    return { category: "fee", confidence: Math.max(confidence, 80) };
  }

  const isSingleLargeCredit =
    cluster.direction === "credit" &&
    cluster.transactions.length === 1 &&
    cluster.amountAnchor >= ISOLATED_LARGE_AMOUNT_THRESHOLD;

  if (isSingleLargeCredit && cluster.recurrenceScore < 35 && !RENT_LABEL_PATTERNS.test(label)) {
    return { category: "unknown", confidence: 35 };
  }

  if (
    cluster.recurrenceScore >= 55 &&
    cluster.distinctMonths >= 3 &&
    cluster.direction === "credit" &&
    (RENT_LABEL_PATTERNS.test(label) || category === "rent" || category === "unknown")
  ) {
    category = "rent";
    confidence += 20;
  } else if (category === "rent" && cluster.recurrenceScore < 45) {
    category = "unknown";
    confidence = Math.min(confidence, 55);
  }

  if (cluster.sameAmountRepeats >= 3) confidence += 10;
  if (cluster.distinctMonths >= 3) confidence += 8;
  if (RENT_LABEL_PATTERNS.test(label)) confidence += 8;

  return { category, confidence: Math.min(Math.round(confidence), 99) };
}

export function enrichTransactionsWithClusters(
  transactions: RevenueTransaction[],
  fiscalYear: number,
): RevenueTransaction[] {
  const clusters = buildTransactionClusters(transactions, fiscalYear);

  return transactions.map((transaction) => {
    const cluster = clusters.find((item) =>
      item.transactions.some((candidate) => candidate.id === transaction.id),
    );
    if (!cluster) return transaction;

    const { category, confidence } = classifyCluster(cluster);
    return {
      ...transaction,
      clusterId: cluster.id,
      recurrenceScore: cluster.recurrenceScore,
      category,
      confidence,
    };
  });
}

export function structuredLinesToTransactions(
  lines: RevenueRawLine[],
  fiscalYear: number,
): RevenueTransaction[] {
  return lines.filter(isStructuredRawLine).flatMap((line) => {
    const category = categoryForStructuredLine(line) ?? "unknown";
    const sourceHeader = line.sourceColumnHeader ?? line.label ?? "unknown";
    // Cycle 15A : le garde-fou anti-date raisonne en valeur absolue, mais le
    // signe du montant est préservé sur la transaction elle-même — un montant
    // négatif dans une colonne revenu ne doit jamais devenir une recette positive.
    const absAmountForGuard = Math.abs(line.amount);
    const rawToken = String(line.amount);

    if (
      rejectDateAsGridMoney({
        rawValue: rawToken,
        amount: absAmountForGuard,
        header: sourceHeader,
      }) ||
      isDateLikeValue(rawToken) ||
      looksLikeCalendarInteger(rawToken)
    ) {
      return [];
    }

    const transaction: RevenueTransaction = {
      id: line.id ?? crypto.randomUUID(),
      date: line.date ?? null,
      description: sourceHeader,
      label: line.label,
      amount: line.amount,
      direction: line.direction,
      category,
      accountContext: line.accountContext,
      counterparty: line.counterparty,
      explicitlyMarkedAsRent: category === "rent",
      lineKind: "atomic",
      sourceDocumentId: line.sourceDocumentId,
      sourceType: line.sourceType,
      confidence: line.confidence ?? 98,
      structuredMapping: true,
      monthLabel: line.monthLabel,
    };

    const monthKey = monthKeyForTransaction(transaction, fiscalYear);

    if (category === "additional_income") {
      console.log("[revenue-grid-mapping]", {
        stage: "structured_transaction",
        transactionId: transaction.id,
        category,
        confidence: transaction.confidence ?? null,
        amount: transaction.amount,
        date: transaction.date,
        monthLabel: transaction.monthLabel ?? null,
        monthKey,
        entersGridPipeline: true,
      });
    }

    logRevenueRowMapping({
      sourceHeader,
      parsedAmount: transaction.amount,
      category,
      targetGridColumn: gridColumnForCategory(category),
      monthKey,
      structured: true,
    });

    return transaction;
  });
}

/** Full pipeline: atomic lines → transactions → clusters → scored categories. */
export function processRawFinancialLines(
  lines: RevenueRawLine[],
  fiscalYear: number,
): RevenueTransaction[] {
  logRevenueRuntimeStage("transaction_extraction", {
    fn: "processRawFinancialLines",
    inputLineCount: lines.length,
    fiscalYear,
  });

  if (lines.length > 0 && lines.every(isStructuredRawLine)) {
    logRevenueRuntimeStage("structured_mapping", {
      fn: "structuredLinesToTransactions",
      lineCount: lines.length,
      skipRecurrenceHeuristics: true,
    });
    return structuredLinesToTransactions(lines, fiscalYear);
  }

  const atomicLines = filterAtomicLines(lines);
  const transactions = rawLinesToTransactions(atomicLines);
  return enrichTransactionsWithClusters(transactions, fiscalYear);
}

export function isIsolatedCategory(category: RevenueTransactionCategory): boolean {
  return (
    category === "deposit" ||
    category === "internal_transfer" ||
    category === "owner_contribution"
  );
}

export function isGridEligibleTransaction(transaction: RevenueTransaction): boolean {
  if (isIsolatedCategory(transaction.category)) return false;
  if (transaction.userValidated) return true;
  return (transaction.confidence ?? 0) >= LOW_CONFIDENCE_THRESHOLD;
}

export function splitLowConfidence(transactions: RevenueTransaction[]): {
  highConfidence: RevenueTransaction[];
  lowConfidence: RevenueTransaction[];
} {
  const highConfidence: RevenueTransaction[] = [];
  const lowConfidence: RevenueTransaction[] = [];

  for (const transaction of transactions) {
    if (isGridEligibleTransaction(transaction)) highConfidence.push(transaction);
    else lowConfidence.push(transaction);
  }

  return { highConfidence, lowConfidence };
}

export function partitionTransactions(transactions: RevenueTransaction[]): {
  gridCandidates: RevenueTransaction[];
  isolated: RevenueTransaction[];
} {
  const gridCandidates: RevenueTransaction[] = [];
  const isolated: RevenueTransaction[] = [];

  for (const transaction of transactions) {
    if (isIsolatedCategory(transaction.category)) {
      isolated.push(transaction);
    } else if (isGridEligibleTransaction(transaction)) {
      gridCandidates.push(transaction);
    }
  }

  return { gridCandidates, isolated };
}
