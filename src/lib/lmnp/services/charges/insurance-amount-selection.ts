/**
 * Deterministic insurance amount candidate scoring and ranking.
 *
 * Role: candidate generation / ranking / obvious false-positive filtering.
 * Not the semantic final truth selector — see insurance-field-orchestration.ts.
 */

import {
  createDeterministicOnlyArbitration,
  INSURANCE_ANNUAL_PREMIUM_FIELD,
  type InsuranceAmountFieldRanking,
  type RankedInsuranceAmountCandidate,
} from "./insurance-field-orchestration";
import { logInsuranceRuntime } from "./insurance-runtime-debug";

export type InsuranceAmountCandidate = {
  amount: number;
  nearbyText: string;
  page?: number;
};

/** @deprecated Prefer RankedInsuranceAmountCandidate from insurance-field-orchestration. */
export type InsuranceAmountScoredCandidate = {
  amount: number;
  nearbyText: string;
  positiveSignals: string[];
  /** Hard + soft labels (backward compatible). */
  negativeSignals: string[];
  hardNegativeSignals: string[];
  softNegativeSignals: string[];
  finalScore: number;
  hardExcluded: boolean;
  hasPrimaryAnnualSignal: boolean;
  /** True when this row is the deterministic rank winner (not semantic final truth). */
  selected: boolean;
};

const PRIMARY_ANNUAL_LABELS = new Set([
  "cotisation annuelle TTC",
  "cotisation annuelle",
  "prime annuelle TTC",
  "prime annuelle",
]);

/**
 * Target-field semantic signals for insuranceAnnualPremium.
 * Prioritizes the primary contract annual premium over prorata, taxes, and riders.
 */
const POSITIVE_SIGNALS: ReadonlyArray<{
  pattern: RegExp;
  label: string;
  weight: number;
  tier: "primary" | "secondary" | "weak";
}> = [
  // Primary — annual contract premium
  {
    pattern: /cotisation\s+annuelle\s+ttc/i,
    label: "cotisation annuelle TTC",
    weight: 130,
    tier: "primary",
  },
  {
    pattern: /cotisation\s+annuelle/i,
    label: "cotisation annuelle",
    weight: 125,
    tier: "primary",
  },
  {
    pattern: /prime\s+annuelle\s+ttc/i,
    label: "prime annuelle TTC",
    weight: 122,
    tier: "primary",
  },
  { pattern: /prime\s+annuelle/i, label: "prime annuelle", weight: 120, tier: "primary" },
  // Secondary — period / TTC lines (not annual headline)
  {
    pattern: /cotisation\s+(?:de\s+)?(?:la\s+)?p[eé]riode/i,
    label: "cotisation période",
    weight: 85,
    tier: "secondary",
  },
  { pattern: /cotisation\s+ttc/i, label: "cotisation TTC", weight: 80, tier: "secondary" },
  // Weak — avoid beating primary on tie-break noise
  { pattern: /prime\s+ttc/i, label: "prime ttc", weight: 50, tier: "weak" },
  { pattern: /montant\s+ttc/i, label: "montant ttc", weight: 45, tier: "weak" },
  { pattern: /echeance/i, label: "échéance", weight: 40, tier: "weak" },
  {
    pattern: /(?:cotisation|prime)[^.\n]{0,20}prorat/i,
    label: "cotisation prorata",
    weight: 35,
    tier: "weak",
  },
];

/** Absolute exclusion — wrong business field for insuranceAnnualPremium. */
const HARD_NEGATIVE_SIGNALS: ReadonlyArray<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /capital\s+mobilier/i, label: "capital mobilier", weight: 200 },
  { pattern: /capital\s+assur[eé]/i, label: "capital assuré", weight: 200 },
  { pattern: /montant\s+garanti/i, label: "montant garanti", weight: 150 },
  { pattern: /plafond\s+(?:de\s+)?garantie/i, label: "plafond garantie", weight: 150 },
  { pattern: /\bfranchise\b/i, label: "franchise", weight: 150 },
  { pattern: /responsabilit[eé]\s+civile/i, label: "responsabilité civile", weight: 140 },
];

/**
 * Premium breakdown lines in the same OCR window — penalize score only.
 * Waived when primary annual premium signals are present on the candidate.
 */
const SOFT_NEGATIVE_SIGNALS: ReadonlyArray<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /montant\s+des\s+taxes/i, label: "montant des taxes", weight: 85 },
  {
    pattern: /(?:^|[^\w])taxes\s*(?:ttc)?\s*[:\-]?\s*[\d\s,]/im,
    label: "taxes",
    weight: 80,
  },
  { pattern: /protection\s+juridique/i, label: "protection juridique", weight: 85 },
  { pattern: /d[eé]fense[\s-]+recours/i, label: "défense recours", weight: 85 },
  { pattern: /catastrophes?\s+naturelles?/i, label: "catastrophes naturelles", weight: 85 },
  { pattern: /contribution\s+attentat/i, label: "contribution attentat", weight: 85 },
];

function hasPrimaryAnnualSignal(positiveSignals: string[]): boolean {
  return positiveSignals.some((label) => PRIMARY_ANNUAL_LABELS.has(label));
}

function normalizeContext(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function buildCandidateId(amount: number, context: string, index: number): string {
  const contextKey = context.slice(0, 48).replace(/\s+/g, "_");
  return `amt-${amount}-${index}-${contextKey}`;
}

function normalizeAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

type RankingSortRow = {
  sourceIndex: number;
  row: InsuranceAmountScoredCandidate;
};

function logInsuranceAmountRanking(
  ranking: InsuranceAmountFieldRanking,
  params: {
    scored: InsuranceAmountScoredCandidate[];
    sortedRows: RankingSortRow[];
    eligibleWinner: RankingSortRow | undefined;
  },
): void {
  const { scored, sortedRows, eligibleWinner } = params;

  console.log("[charges-insurance-debug]", {
    stage: "ranking_summary",
    targetField: ranking.targetField,
    arbitrationMode: ranking.arbitration.mode,
    totalCandidates: ranking.candidates.length,
    sortRule:
      "finalScore descending, then amount descending (higher € wins score ties among eligible)",
    eligiblePoolRule:
      "first sorted row with hardExcluded=false (hard negatives only; soft negatives waived when primary annual signal present)",
    eligibleWinnerSourceIndex: eligibleWinner?.sourceIndex ?? null,
    deterministicDefaultAmount: ranking.deterministicDefault?.amount ?? null,
    deterministicDefaultRank: ranking.deterministicDefault?.rank ?? null,
    deterministicDefaultScore: ranking.deterministicDefault?.score ?? null,
  });

  console.log("[charges-insurance-debug]", {
    stage: "ranking_presort_scored",
    rows: scored.map((row, sourceIndex) => ({
      sourceIndex,
      amount: row.amount,
      normalizedAmount: normalizeAmount(row.amount),
      finalScore: row.finalScore,
      hardExcluded: row.hardExcluded,
      hasPrimaryAnnualSignal: row.hasPrimaryAnnualSignal,
      positiveSignals: row.positiveSignals,
      hardNegativeSignals: row.hardNegativeSignals,
      softNegativeSignals: row.softNegativeSignals,
      negativeSignals: row.negativeSignals,
    })),
  });

  console.log("[charges-insurance-debug]", {
    stage: "ranking_sort_order",
    rows: sortedRows.map((entry, position) => ({
      sortPosition: position,
      sourceIndex: entry.sourceIndex,
      amount: entry.row.amount,
      normalizedAmount: normalizeAmount(entry.row.amount),
      finalScore: entry.row.finalScore,
      hardExcluded: entry.row.hardExcluded,
      tieBreakNote:
        position > 0 &&
        sortedRows[position - 1]!.row.finalScore === entry.row.finalScore
          ? `same score as rank #${position}; ${entry.row.amount > sortedRows[position - 1]!.row.amount ? "higher amount ranks higher" : "lower amount ranks lower"}`
          : null,
    })),
  });

  for (const candidate of ranking.candidates) {
    const sourceIndex = Number.parseInt(candidate.candidateId.split("-")[2] ?? "", 10);
    const sourceRow = Number.isFinite(sourceIndex) ? scored[sourceIndex] : undefined;
    console.log("[charges-insurance-debug]", {
      stage: "ranked_candidate_full",
      candidateId: candidate.candidateId,
      sourceIndex: Number.isFinite(sourceIndex) ? sourceIndex : null,
      amount: candidate.amount,
      normalizedAmount: normalizeAmount(candidate.amount),
      nearbyContext: candidate.context,
      normalizedContext: normalizeContext(candidate.context),
      positiveSignals: candidate.positiveSignals,
      negativeSignals: candidate.negativeSignals,
      hardNegativeSignals: sourceRow?.hardNegativeSignals ?? [],
      softNegativeSignals: sourceRow?.softNegativeSignals ?? [],
      hasPrimaryAnnualSignal: sourceRow?.hasPrimaryAnnualSignal ?? false,
      finalScore: candidate.score,
      hardExcluded: candidate.hardExcluded,
      rank: candidate.rank,
      deterministicRankWinner: candidate.deterministicRankWinner,
      prescoreFinalScore: sourceRow?.finalScore ?? null,
      contextLength: candidate.context.length,
    });
  }

  if (
    ranking.deterministicDefault &&
    ranking.deterministicDefault.score === 0 &&
    !ranking.deterministicDefault.hardExcluded
  ) {
    console.log("[charges-insurance-debug]", {
      stage: "ranking_warning",
      message:
        "Deterministic default has finalScore=0 — winner may be a tie-break on amount only, not premium signals",
      deterministicDefault: {
        amount: ranking.deterministicDefault.amount,
        normalizedAmount: normalizeAmount(ranking.deterministicDefault.amount),
        rank: ranking.deterministicDefault.rank,
        nearbyContextPreview: ranking.deterministicDefault.context.slice(0, 200),
      },
      higherAmountEligibleAlternatives: ranking.candidates.filter(
        (candidate) =>
          !candidate.hardExcluded &&
          !candidate.deterministicRankWinner &&
          candidate.amount > ranking.deterministicDefault!.amount,
      ),
    });
  }
}

/**
 * Scores one insurance amount candidate from its surrounding OCR context.
 */
export function scoreInsuranceCandidate(
  candidate: InsuranceAmountCandidate,
): InsuranceAmountScoredCandidate {
  const normalized = normalizeContext(candidate.nearbyText);
  const positiveSignals: string[] = [];
  const hardNegativeSignals: string[] = [];
  const softNegativeSignals: string[] = [];

  let finalScore = 0;

  for (const positive of POSITIVE_SIGNALS) {
    if (positive.pattern.test(normalized)) {
      positiveSignals.push(positive.label);
      finalScore += positive.weight;
    }
  }

  const primaryAnnual = hasPrimaryAnnualSignal(positiveSignals);

  for (const negative of HARD_NEGATIVE_SIGNALS) {
    if (negative.pattern.test(normalized)) {
      hardNegativeSignals.push(negative.label);
      finalScore -= negative.weight;
    }
  }

  for (const negative of SOFT_NEGATIVE_SIGNALS) {
    if (negative.pattern.test(normalized)) {
      softNegativeSignals.push(negative.label);
      if (!primaryAnnual) {
        finalScore -= negative.weight;
      }
    }
  }

  const negativeSignals = [...hardNegativeSignals, ...softNegativeSignals];
  const hardExcluded = hardNegativeSignals.length > 0;

  return {
    amount: candidate.amount,
    nearbyText: candidate.nearbyText,
    positiveSignals,
    negativeSignals,
    hardNegativeSignals,
    softNegativeSignals,
    finalScore,
    hardExcluded,
    hasPrimaryAnnualSignal: primaryAnnual,
    selected: false,
  };
}

function toRankedCandidate(
  scored: InsuranceAmountScoredCandidate,
  index: number,
  rank: number,
  deterministicRankWinner: boolean,
): RankedInsuranceAmountCandidate {
  const hardExcluded = scored.hardExcluded;
  return {
    candidateId: buildCandidateId(scored.amount, scored.nearbyText, index),
    amount: scored.amount,
    context: scored.nearbyText,
    score: scored.finalScore,
    rank,
    positiveSignals: scored.positiveSignals,
    negativeSignals: scored.negativeSignals,
    hardExcluded,
    deterministicRankWinner,
  };
}

/**
 * Primary API: ranks pre-extracted candidates for semantic arbitration.
 * Filters obvious false positives (hardExcluded) from the deterministic default pool.
 */
export function rankInsuranceAmountCandidates(
  candidates: InsuranceAmountCandidate[],
  options?: { arbitrationMode?: "deterministic_only" | "pending_semantic" },
): InsuranceAmountFieldRanking {
  logInsuranceRuntime("rankInsuranceAmountCandidates_invocation", {
    candidateCount: candidates.length,
    targetField: INSURANCE_ANNUAL_PREMIUM_FIELD,
  });

  const scored = candidates.map(scoreInsuranceCandidate);

  const rankedRows: RankingSortRow[] = [...scored]
    .map((row, index) => ({ row, sourceIndex: index }))
    .sort((a, b) => {
      if (b.row.finalScore !== a.row.finalScore) return b.row.finalScore - a.row.finalScore;
      return b.row.amount - a.row.amount;
    });

  const eligibleWinner = rankedRows.find((entry) => !entry.row.hardExcluded);

  const rankedCandidates: RankedInsuranceAmountCandidate[] = rankedRows.map((entry, rankIndex) =>
    toRankedCandidate(
      entry.row,
      entry.sourceIndex,
      rankIndex + 1,
      eligibleWinner?.sourceIndex === entry.sourceIndex,
    ),
  );

  const deterministicDefault =
    rankedCandidates.find((candidate) => candidate.deterministicRankWinner) ?? null;

  const ranking: InsuranceAmountFieldRanking = {
    targetField: INSURANCE_ANNUAL_PREMIUM_FIELD,
    candidates: rankedCandidates,
    deterministicDefault,
    arbitration:
      options?.arbitrationMode === "pending_semantic"
        ? { mode: "pending_semantic", semanticChoiceCandidateId: null, rationale: null }
        : createDeterministicOnlyArbitration(),
  };

  logInsuranceAmountRanking(ranking, { scored, sortedRows: rankedRows, eligibleWinner });
  return ranking;
}

/**
 * @deprecated Use rankInsuranceAmountCandidates — kept for backward compatibility.
 * Returns legacy scored rows with `selected` marking the deterministic rank winner only.
 */
export function selectBestInsuranceCandidate(
  candidates: InsuranceAmountCandidate[],
): InsuranceAmountScoredCandidate[] {
  const ranking = rankInsuranceAmountCandidates(candidates);
  return ranking.candidates.map((ranked) => ({
    amount: ranked.amount,
    nearbyText: ranked.context,
    positiveSignals: ranked.positiveSignals,
    negativeSignals: ranked.negativeSignals,
    finalScore: ranked.score,
    selected: ranked.deterministicRankWinner,
  }));
}

/**
 * Deterministic-layer default amount (rank winner). Semantic layer may override later
 * via resolveInsuranceFieldAmount when arbitration is resolved.
 */
export function getDeterministicInsuranceAmount(
  candidates: InsuranceAmountCandidate[],
  options?: { arbitrationMode?: "deterministic_only" | "pending_semantic" },
): { amount: number | null; ranking: InsuranceAmountFieldRanking } {
  const ranking = rankInsuranceAmountCandidates(candidates, options);
  return {
    amount: ranking.deterministicDefault?.amount ?? null,
    ranking,
  };
}

/** @deprecated Use getDeterministicInsuranceAmount */
export function getSelectedInsuranceAmount(
  candidates: InsuranceAmountCandidate[],
): { amount: number | null; scored: InsuranceAmountScoredCandidate[] } {
  const { amount, ranking } = getDeterministicInsuranceAmount(candidates);
  const scored = selectBestInsuranceCandidate(candidates);
  return { amount, scored };
}
