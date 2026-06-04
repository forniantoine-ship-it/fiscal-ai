/**
 * Deterministic taxe foncière amount candidate scoring and ranking.
 *
 * Role: candidate generation / ranking / obvious false-positive filtering.
 * Not the semantic final truth selector — see taxe-fonciere-field-orchestration.ts.
 */

import {
  createTaxeFonciereDeterministicOnlyArbitration,
  TAXE_FONCIERE_AMOUNT_FIELD,
  type TaxeFonciereAmountFieldRanking,
  type RankedTaxeFonciereAmountCandidate,
} from "./taxe-fonciere-field-orchestration";
import { logTaxeFonciereRuntime } from "./taxe-fonciere-runtime-debug";

export type TaxeFonciereAmountCandidate = {
  amount: number;
  nearbyText: string;
  page?: number;
};

export type TaxeFonciereAmountScoredCandidate = {
  amount: number;
  nearbyText: string;
  positiveSignals: string[];
  negativeSignals: string[];
  hardNegativeSignals: string[];
  softNegativeSignals: string[];
  finalScore: number;
  hardExcluded: boolean;
  hasPrimaryPayableSignal: boolean;
  selected: boolean;
};

const PRIMARY_PAYABLE_LABELS = new Set([
  "net à payer",
  "montant à payer",
  "total des impôts",
  "total à payer",
  "solde à payer",
]);

/**
 * Target-field semantic signals for taxeFonciereAmount.
 * Prioritizes payable totals over cadastral bases and breakdown lines.
 */
const POSITIVE_SIGNALS: ReadonlyArray<{
  pattern: RegExp;
  label: string;
  weight: number;
  tier: "primary" | "secondary" | "weak";
}> = [
  { pattern: /net\s+a\s+payer/i, label: "net à payer", weight: 130, tier: "primary" },
  { pattern: /montant\s+a\s+payer/i, label: "montant à payer", weight: 128, tier: "primary" },
  {
    pattern: /total\s+des\s+imp[oô]ts/i,
    label: "total des impôts",
    weight: 125,
    tier: "primary",
  },
  { pattern: /total\s+a\s+payer/i, label: "total à payer", weight: 122, tier: "primary" },
  { pattern: /solde\s+a\s+payer/i, label: "solde à payer", weight: 120, tier: "primary" },
  {
    pattern: /imp[oô]t\s+(?:d[uû]|a\s+payer)/i,
    label: "impôt à payer",
    weight: 115,
    tier: "primary",
  },
  {
    pattern: /taxe\s+fonci[eè]re[^.\n]{0,40}(?:total|montant|payer)/i,
    label: "taxe foncière payable",
    weight: 110,
    tier: "secondary",
  },
  {
    pattern: /propri[eé]t[eé]s\s+b[aâ]ties[^.\n]{0,40}(?:total|montant)/i,
    label: "propriétés bâties total",
    weight: 95,
    tier: "secondary",
  },
  { pattern: /imp[oô]ts?\s+locaux/i, label: "impôts locaux", weight: 70, tier: "weak" },
  { pattern: /dgfip|finances\s+publiques/i, label: "DGFiP", weight: 35, tier: "weak" },
];

/** Absolute exclusion — wrong business field for taxeFonciereAmount. */
const HARD_NEGATIVE_SIGNALS: ReadonlyArray<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /valeur\s+locative\s+cadastrale/i, label: "valeur locative cadastrale", weight: 200 },
  { pattern: /revenu\s+cadastral/i, label: "revenu cadastral", weight: 190 },
  { pattern: /base\s+d['']?imposition/i, label: "base d'imposition", weight: 170 },
  { pattern: /taux\s+d['']?imposition/i, label: "taux d'imposition", weight: 160 },
  { pattern: /\b\d+[,.]?\d*\s*%/i, label: "pourcentage", weight: 150 },
  { pattern: /exon[eé]ration/i, label: "exonération", weight: 140 },
  { pattern: /abattement/i, label: "abattement", weight: 130 },
  { pattern: /quote[\s-]?part/i, label: "quote-part", weight: 120 },
  { pattern: /r[eé]f[eé]rence\s+cadastrale/i, label: "référence cadastrale", weight: 120 },
];

const SOFT_NEGATIVE_SIGNALS: ReadonlyArray<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /frais\s+de\s+gestion/i, label: "frais de gestion", weight: 70 },
  { pattern: /ordures\s+m[eé]nag[eè]res/i, label: "ordures ménagères", weight: 65 },
  { pattern: /teom|tom\b/i, label: "TEOM/TOM", weight: 60 },
  { pattern: /commune\s+de/i, label: "commune (context)", weight: 25 },
];

function hasPrimaryPayableSignal(positiveSignals: string[]): boolean {
  return positiveSignals.some((label) => PRIMARY_PAYABLE_LABELS.has(label));
}

/** Amount sits on the payable label line (not a distant cadastral/base row). */
function amountAnchoredToPayableLabel(normalized: string, amount: number): boolean {
  const anchors = [
    /net\s+a\s+payer\s*[^0-9]{0,18}([\d\s.,]+)/i,
    /montant\s+a\s+payer\s*[^0-9]{0,18}([\d\s.,]+)/i,
    /total\s+des\s+imp[oô]ts\s+(?:a\s+payer\s*)?[^0-9]{0,18}([\d\s.,]+)/i,
    /total\s+a\s+payer\s*[^0-9]{0,18}([\d\s.,]+)/i,
    /solde\s+a\s+payer\s*[^0-9]{0,18}([\d\s.,]+)/i,
  ];
  const normalizedAmount = normalizeAmount(amount);
  for (const anchor of anchors) {
    const match = normalized.match(anchor);
    if (!match?.[1]) continue;
    const parsed = Number.parseFloat(match[1].replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(parsed) && normalizeAmount(parsed) === normalizedAmount) {
      return true;
    }
  }
  return false;
}

function normalizeContext(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function buildCandidateId(amount: number, context: string, index: number): string {
  const contextKey = context.slice(0, 48).replace(/\s+/g, "_");
  return `tf-${amount}-${index}-${contextKey}`;
}

function normalizeAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

type RankingSortRow = {
  sourceIndex: number;
  row: TaxeFonciereAmountScoredCandidate;
};

function logTaxeFonciereAmountRanking(
  ranking: TaxeFonciereAmountFieldRanking,
  params: {
    scored: TaxeFonciereAmountScoredCandidate[];
    sortedRows: RankingSortRow[];
    eligibleWinner: RankingSortRow | undefined;
  },
): void {
  const { scored, sortedRows, eligibleWinner } = params;

  console.log("[charges-taxe-fonciere-debug]", {
    stage: "ranking_summary",
    targetField: ranking.targetField,
    arbitrationMode: ranking.arbitration.mode,
    totalCandidates: ranking.candidates.length,
    eligibleWinnerSourceIndex: eligibleWinner?.sourceIndex ?? null,
    deterministicDefaultAmount: ranking.deterministicDefault?.amount ?? null,
  });

  for (const candidate of ranking.candidates) {
    const sourceIndex = Number.parseInt(candidate.candidateId.split("-")[2] ?? "", 10);
    const sourceRow = Number.isFinite(sourceIndex) ? scored[sourceIndex] : undefined;
    console.log("[charges-taxe-fonciere-debug]", {
      stage: "ranked_candidate_full",
      candidateId: candidate.candidateId,
      amount: candidate.amount,
      normalizedAmount: normalizeAmount(candidate.amount),
      nearbyContextPreview: candidate.context.slice(0, 200),
      positiveSignals: candidate.positiveSignals,
      negativeSignals: candidate.negativeSignals,
      hardNegativeSignals: sourceRow?.hardNegativeSignals ?? [],
      softNegativeSignals: sourceRow?.softNegativeSignals ?? [],
      hasPrimaryPayableSignal: sourceRow?.hasPrimaryPayableSignal ?? false,
      finalScore: candidate.score,
      hardExcluded: candidate.hardExcluded,
      rank: candidate.rank,
      deterministicRankWinner: candidate.deterministicRankWinner,
    });
  }

  console.log("[charges-taxe-fonciere-debug]", {
    stage: "ranking_sort_order",
    rows: sortedRows.map((entry, position) => ({
      sortPosition: position,
      sourceIndex: entry.sourceIndex,
      amount: entry.row.amount,
      finalScore: entry.row.finalScore,
      hardExcluded: entry.row.hardExcluded,
    })),
  });
}

export function scoreTaxeFonciereCandidate(
  candidate: TaxeFonciereAmountCandidate,
): TaxeFonciereAmountScoredCandidate {
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

  const primaryPayable = hasPrimaryPayableSignal(positiveSignals);
  if (amountAnchoredToPayableLabel(normalized, candidate.amount)) {
    positiveSignals.push("amount on payable label");
    finalScore += 200;
  }

  for (const negative of HARD_NEGATIVE_SIGNALS) {
    if (negative.pattern.test(normalized)) {
      hardNegativeSignals.push(negative.label);
      finalScore -= negative.weight;
    }
  }

  for (const negative of SOFT_NEGATIVE_SIGNALS) {
    if (negative.pattern.test(normalized)) {
      softNegativeSignals.push(negative.label);
      if (!primaryPayable) {
        finalScore -= negative.weight;
      }
    }
  }

  const negativeSignals = [...hardNegativeSignals, ...softNegativeSignals];
  const waivableHardWhenPayable = new Set([
    "valeur locative cadastrale",
    "revenu cadastral",
    "base d'imposition",
    "pourcentage",
  ]);
  const hardExcluded =
    hardNegativeSignals.length > 0 &&
    !(
      primaryPayable &&
      hardNegativeSignals.every((label) => waivableHardWhenPayable.has(label))
    );

  return {
    amount: candidate.amount,
    nearbyText: candidate.nearbyText,
    positiveSignals,
    negativeSignals,
    hardNegativeSignals,
    softNegativeSignals,
    finalScore,
    hardExcluded,
    hasPrimaryPayableSignal: primaryPayable,
    selected: false,
  };
}

function toRankedCandidate(
  scored: TaxeFonciereAmountScoredCandidate,
  index: number,
  rank: number,
  deterministicRankWinner: boolean,
): RankedTaxeFonciereAmountCandidate {
  return {
    candidateId: buildCandidateId(scored.amount, scored.nearbyText, index),
    amount: scored.amount,
    context: scored.nearbyText,
    score: scored.finalScore,
    rank,
    positiveSignals: scored.positiveSignals,
    negativeSignals: scored.negativeSignals,
    hardExcluded: scored.hardExcluded,
    deterministicRankWinner,
  };
}

export function rankTaxeFonciereAmountCandidates(
  candidates: TaxeFonciereAmountCandidate[],
  options?: { arbitrationMode?: "deterministic_only" | "pending_semantic" },
): TaxeFonciereAmountFieldRanking {
  logTaxeFonciereRuntime("rankTaxeFonciereAmountCandidates_invocation", {
    candidateCount: candidates.length,
    targetField: TAXE_FONCIERE_AMOUNT_FIELD,
  });

  const scored = candidates.map(scoreTaxeFonciereCandidate);

  const rankedRows: RankingSortRow[] = [...scored]
    .map((row, index) => ({ row, sourceIndex: index }))
    .sort((a, b) => {
      if (b.row.finalScore !== a.row.finalScore) return b.row.finalScore - a.row.finalScore;
      return b.row.amount - a.row.amount;
    });

  const eligibleWinner = rankedRows.find((entry) => !entry.row.hardExcluded);

  const rankedCandidates: RankedTaxeFonciereAmountCandidate[] = rankedRows.map((entry, rankIndex) =>
    toRankedCandidate(
      entry.row,
      entry.sourceIndex,
      rankIndex + 1,
      eligibleWinner?.sourceIndex === entry.sourceIndex,
    ),
  );

  const deterministicDefault =
    rankedCandidates.find((candidate) => candidate.deterministicRankWinner) ?? null;

  const ranking: TaxeFonciereAmountFieldRanking = {
    targetField: TAXE_FONCIERE_AMOUNT_FIELD,
    candidates: rankedCandidates,
    deterministicDefault,
    arbitration:
      options?.arbitrationMode === "pending_semantic"
        ? { mode: "pending_semantic", semanticChoiceCandidateId: null, rationale: null }
        : createTaxeFonciereDeterministicOnlyArbitration(),
  };

  logTaxeFonciereAmountRanking(ranking, { scored, sortedRows: rankedRows, eligibleWinner });
  return ranking;
}

export function getDeterministicTaxeFonciereAmount(
  candidates: TaxeFonciereAmountCandidate[],
  options?: { arbitrationMode?: "deterministic_only" | "pending_semantic" },
): { amount: number | null; ranking: TaxeFonciereAmountFieldRanking } {
  const ranking = rankTaxeFonciereAmountCandidates(candidates, options);
  return {
    amount: ranking.deterministicDefault?.amount ?? null,
    ranking,
  };
}
