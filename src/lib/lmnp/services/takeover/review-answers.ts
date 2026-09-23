/**
 * Lot 5.1 — réponses d'exception utilisateur pour reprise externe.
 *
 * UNANSWERED ≠ EXPLICIT ZERO / EMPTY :
 * - champ absent / unanswered → ne remplace rien ;
 * - answered([]) / answered(0) → zéro explicite.
 *
 * Pas un questionnaire complet — uniquement ce que 4F.1 peut exiger
 * et que les documents V1 ne fournissent pas (stocks, propertyId, prorata…).
 */

import type { OpeningProrataConvention } from "@/lib/lmnp/services/fiscal-year-opening/types";
import type {
  CandidateAssetClassification,
  CandidateAssetKey,
} from "./asset-candidates";
import type {
  AmortissementsReportesCandidateSource,
  CandidateDeficitRow,
} from "./fiscal-stocks-candidates";

/**
 * Réponse explicite — la présence de l'objet = answered.
 * Absence du champ parent = unanswered.
 */
export type ExplicitTakeoverAnswer<T> = {
  value: T;
  answeredAt?: string;
  answeredBy?: string | null;
  reason?: string;
};

export type TakeoverAssetReviewAnswers = {
  propertyId?: ExplicitTakeoverAnswer<string>;
  prorataConvention?: ExplicitTakeoverAnswer<OpeningProrataConvention>;
  classification?: ExplicitTakeoverAnswer<CandidateAssetClassification>;
};

/**
 * Réponses persistables (reprise navigateur).
 * Stocks : uniquement via answers en V1 (pas d'extracteur 2031).
 */
export type TakeoverReviewAnswers = {
  /**
   * Mapping / overrides par candidateKey (jamais un singlePropertyId global).
   * Une confirmation groupée mono-bien DOIT s'étendre en N réponses
   * par candidateKey — jamais un fallback silencieux properties[0].
   */
  byCandidateKey?: Readonly<Record<CandidateAssetKey, TakeoverAssetReviewAnswers>>;
  /**
   * Client a refusé l'affectation groupée mono-bien.
   * Absent = bulk encore proposable si éligible.
   * Explicit true = questions propertyId individuelles.
   */
  propertyBulkDeclined?: ExplicitTakeoverAnswer<true>;
  /**
   * Client a refusé la confirmation groupée des suggestions de classification.
   * Explicit true = questions classification individuelles (y compris pour les
   * libellés qui auraient été suggérables).
   */
  classificationSuggestionsDeclined?: ExplicitTakeoverAnswer<true>;
  /**
   * undefined = unanswered (≠ []).
   * ExplicitTakeoverAnswer([]) = aucun déficit déclaré.
   */
  deficits?: ExplicitTakeoverAnswer<CandidateDeficitRow[]>;
  /**
   * undefined = unanswered (≠ 0).
   * ExplicitTakeoverAnswer(0) = aucun ARD.
   */
  amortissementsReportes?: ExplicitTakeoverAnswer<number>;
  /**
   * Qualifie la source ARD lorsque amortissementsReportes est answered.
   * Défaut merge : manual_entry.
   */
  amortissementsReportesSource?: AmortissementsReportesCandidateSource;
};

export function isExplicitAnswer<T>(
  value: ExplicitTakeoverAnswer<T> | undefined,
): value is ExplicitTakeoverAnswer<T> {
  return value !== undefined;
}

export function explicitAnswer<T>(
  value: T,
  meta?: Omit<ExplicitTakeoverAnswer<T>, "value">,
): ExplicitTakeoverAnswer<T> {
  return { value, ...meta };
}
