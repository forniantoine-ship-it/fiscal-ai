/**
 * Layered field orchestration for insurance charge extraction.
 *
 * Deterministic ranking produces candidates; semantic arbitration (GPT) may
 * choose among them later — never inventing amounts or altering parser structure.
 */

/** Semantic goal for insurance premium selection (target business field). */
export const INSURANCE_ANNUAL_PREMIUM_FIELD = "insuranceAnnualPremium" as const;

export type InsuranceSemanticTargetField = typeof INSURANCE_ANNUAL_PREMIUM_FIELD;

export type FieldArbitrationMode =
  | "deterministic_only"
  | "pending_semantic"
  | "semantic_resolved";

/** Parser dispatch input — excludes post-semantic output state. */
export type ParserArbitrationMode = Exclude<FieldArbitrationMode, "semantic_resolved">;

/**
 * One ranked amount candidate exposed to the semantic layer.
 * GPT may only reference `candidateId` values present in this list.
 */
export type RankedInsuranceAmountCandidate = {
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

export type InsuranceAmountFieldArbitration = {
  mode: FieldArbitrationMode;
  /** Set by the semantic layer after choosing among ranked candidates only. */
  semanticChoiceCandidateId: string | null;
  rationale: string | null;
};

/**
 * Structured output from the deterministic candidate-generation / ranking layer.
 */
export type InsuranceAmountFieldRanking = {
  targetField: InsuranceSemanticTargetField;
  candidates: RankedInsuranceAmountCandidate[];
  /**
   * Deterministic default (highest eligible rank). Used until semantic arbitration runs.
   * Not authoritative for final business meaning when mode is pending_semantic.
   */
  deterministicDefault: RankedInsuranceAmountCandidate | null;
  arbitration: InsuranceAmountFieldArbitration;
};

export function createPendingSemanticArbitration(): InsuranceAmountFieldArbitration {
  return {
    mode: "pending_semantic",
    semanticChoiceCandidateId: null,
    rationale: null,
  };
}

export function createDeterministicOnlyArbitration(): InsuranceAmountFieldArbitration {
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
export function resolveInsuranceFieldAmount(
  ranking: InsuranceAmountFieldRanking,
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

/**
 * Placeholder for future GPT semantic arbitration.
 * Must only return a candidateId from the provided ranking — never a new amount.
 */
export type InsuranceSemanticArbitrationRequest = {
  targetField: InsuranceSemanticTargetField;
  ranking: InsuranceAmountFieldRanking;
};

export type InsuranceSemanticArbitrationResult = {
  semanticChoiceCandidateId: string;
  rationale: string;
};

export function applySemanticArbitration(
  ranking: InsuranceAmountFieldRanking,
  result: InsuranceSemanticArbitrationResult,
): InsuranceAmountFieldRanking {
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
