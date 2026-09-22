/**
 * Lot 5.1 — write path unique pour l'Opening externe finale.
 *
 * Refuse toute Opening non utilisable (4F.2 guard).
 * Ne persiste jamais pending / manual_review / blocked comme preuve finale.
 */

import type { FiscalYear } from "@/lib/lmnp/types/domain";
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";
import { isUsableExternalTakeoverOpening } from "@/lib/lmnp/services/fiscal-year-opening/is-usable-external-takeover-opening";
import type { TakeoverReviewAnswers } from "./review-answers";

export type PersistExternalTakeoverOpeningInput = {
  fiscalYear: FiscalYear;
  opening: FiscalYearOpening;
  /** Référence takeover / package — stockée comme sourceRef. */
  sourceRef: string;
  /** Horodatage de mise à jour FiscalYear. */
  updatedAt?: string;
};

export type PersistExternalTakeoverOpeningResult =
  | {
      status: "persisted";
      fiscalYear: FiscalYear;
    }
  | {
      status: "refused";
      code: "OPENING_NOT_USABLE";
      message: string;
    };

/**
 * Enregistre l'Opening externe finale sur FiscalYear.
 * Précondition : isUsableExternalTakeoverOpening(opening, fiscalYear.year).
 */
export function persistExternalTakeoverOpening(
  input: PersistExternalTakeoverOpeningInput,
): PersistExternalTakeoverOpeningResult {
  const { fiscalYear, opening, sourceRef } = input;

  if (!isUsableExternalTakeoverOpening(opening, fiscalYear.year)) {
    return {
      status: "refused",
      code: "OPENING_NOT_USABLE",
      message:
        "Refuse de persister une Opening non utilisable (validated + external_takeover + bon exercice requis).",
    };
  }

  const now = input.updatedAt ?? new Date().toISOString();
  return {
    status: "persisted",
    fiscalYear: {
      ...fiscalYear,
      externalTakeoverOpening: {
        sourceRef,
        opening,
      },
      updatedAt: now,
    },
  };
}

export type PersistExternalTakeoverReviewAnswersInput = {
  fiscalYear: FiscalYear;
  reviewAnswers: TakeoverReviewAnswers;
  updatedAt?: string;
};

/**
 * Persiste uniquement les réponses utilisateur (reprise navigateur).
 * Ne touche pas à externalTakeoverOpening.
 */
export function persistExternalTakeoverReviewAnswers(
  input: PersistExternalTakeoverReviewAnswersInput,
): FiscalYear {
  const now = input.updatedAt ?? new Date().toISOString();
  return {
    ...input.fiscalYear,
    externalTakeoverReviewAnswers: input.reviewAnswers,
    updatedAt: now,
  };
}
