/**
 * Layered field orchestration for taxe foncière charge extraction.
 *
 * Deterministic ranking produces candidates; semantic arbitration (GPT) may
 * choose among them later — never inventing amounts or altering parser structure.
 */

/** Semantic goal for payable property tax selection (target business field). */
export const TAXE_FONCIERE_AMOUNT_FIELD = "taxeFonciereAmount" as const;

export type TaxeFonciereSemanticTargetField = typeof TAXE_FONCIERE_AMOUNT_FIELD;

export type TaxeFonciereFieldArbitrationMode =
  | "deterministic_only"
  | "pending_semantic"
  | "semantic_resolved";

/**
 * One ranked amount candidate exposed to the semantic layer.
 * GPT may only reference `candidateId` values present in this list.
 */
export type RankedTaxeFonciereAmountCandidate = {
  candidateId: string;
  amount: number;
  context: string;
  score: number;
  rank: number;
  positiveSignals: string[];
  negativeSignals: string[];
  hardExcluded: boolean;
  /** Top pick from deterministic ranking — not semantic final truth until arbitration resolves. */
  deterministicRankWinner: boolean;
};

export type TaxeFonciereAmountFieldArbitration = {
  mode: TaxeFonciereFieldArbitrationMode;
  semanticChoiceCandidateId: string | null;
  rationale: string | null;
};

export type TaxeFonciereAmountFieldRanking = {
  targetField: TaxeFonciereSemanticTargetField;
  candidates: RankedTaxeFonciereAmountCandidate[];
  /**
   * Deterministic default (highest eligible rank). Used until semantic arbitration runs.
   * Not authoritative for final business meaning when mode is pending_semantic.
   */
  deterministicDefault: RankedTaxeFonciereAmountCandidate | null;
  arbitration: TaxeFonciereAmountFieldArbitration;
};

export function createTaxeFoncierePendingSemanticArbitration(): TaxeFonciereAmountFieldArbitration {
  return {
    mode: "pending_semantic",
    semanticChoiceCandidateId: null,
    rationale: null,
  };
}

export function createTaxeFonciereDeterministicOnlyArbitration(): TaxeFonciereAmountFieldArbitration {
  return {
    mode: "deterministic_only",
    semanticChoiceCandidateId: null,
    rationale: null,
  };
}

/**
 * Resolves the amount to use for a target field given ranking + optional semantic choice.
 * Semantic choice must reference an existing candidate id; never invents amounts.
 */
export function resolveTaxeFonciereFieldAmount(
  ranking: TaxeFonciereAmountFieldRanking,
): number | null {
  const { arbitration, candidates, deterministicDefault } = ranking;

  if (arbitration.mode === "semantic_resolved" && arbitration.semanticChoiceCandidateId) {
    const semantic = candidates.find(
      (candidate) => candidate.candidateId === arbitration.semanticChoiceCandidateId,
    );
    if (semantic && !semantic.hardExcluded) return semantic.amount;
  }

  return deterministicDefault?.amount ?? null;
}

export type TaxeFonciereSemanticArbitrationRequest = {
  targetField: TaxeFonciereSemanticTargetField;
  ranking: TaxeFonciereAmountFieldRanking;
};

export type TaxeFonciereSemanticArbitrationResult = {
  semanticChoiceCandidateId: string;
  rationale: string;
};

export function applyTaxeFonciereSemanticArbitration(
  ranking: TaxeFonciereAmountFieldRanking,
  result: TaxeFonciereSemanticArbitrationResult,
): TaxeFonciereAmountFieldRanking {
  const choice = ranking.candidates.find(
    (candidate) => candidate.candidateId === result.semanticChoiceCandidateId,
  );
  if (!choice) {
    throw new Error(
      `Semantic arbitration must choose an existing candidate id, got: ${result.semanticChoiceCandidateId}`,
    );
  }
  if (choice.hardExcluded) {
    throw new Error(
      `Semantic arbitration cannot select hard-excluded candidate: ${result.semanticChoiceCandidateId}`,
    );
  }

  return {
    ...ranking,
    candidates: ranking.candidates.map((candidate) => ({
      ...candidate,
      deterministicRankWinner:
        candidate.candidateId === ranking.deterministicDefault?.candidateId,
    })),
    arbitration: {
      mode: "semantic_resolved",
      semanticChoiceCandidateId: result.semanticChoiceCandidateId,
      rationale: result.rationale,
    },
  };
}
