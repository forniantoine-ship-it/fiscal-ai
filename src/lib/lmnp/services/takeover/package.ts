/**
 * Lot 4B — agrégat des propositions documentaires de reprise.
 *
 * Pas un second FiscalYearOpening. Pas de décision AUTO/REVIEW/BLOCK.
 */

import type { CandidateHistoricalAsset } from "./asset-candidates";
import type { CandidateFiscalStocks } from "./fiscal-stocks-candidates";

export type TakeoverCandidatePackage = {
  /** Identifiant du lot de propositions (orchestration future). */
  packageId: string;
  /** Exercice N-1 documentaire lorsque connu. */
  sourceFiscalYear?: number;
  stocks: CandidateFiscalStocks;
  assets: CandidateHistoricalAsset[];
};
