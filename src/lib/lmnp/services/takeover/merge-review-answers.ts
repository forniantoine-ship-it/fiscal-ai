/**
 * Lot 5.1 — merge EXPLICIT extrait + réponses utilisateur.
 *
 * unanswered ne remplace rien.
 * zéro / [] explicite reste zéro / [].
 * Réutilise applyCandidateCorrection / presentCandidate (pas de 2e sémantique).
 */

import type { CandidateHistoricalAsset } from "./asset-candidates";
import {
  applyCandidateCorrection,
  isCandidatePresent,
  missingCandidate,
  presentCandidate,
  type CandidateCorrectionTrail,
  type CandidateProvenance,
  type CandidateValue,
} from "./candidate-value";
import type { CandidateFiscalStocks } from "./fiscal-stocks-candidates";
import {
  explicitAnswer,
  isExplicitAnswer,
  type ExplicitTakeoverAnswer,
  type TakeoverReviewAnswers,
} from "./review-answers";

const REVIEW_DOCUMENT_ID = "takeover-review-answers";

function reviewProvenance(fieldLabel: string, sourceRef: string): CandidateProvenance {
  return {
    documentId: REVIEW_DOCUMENT_ID,
    documentRole: "other",
    fieldLabel,
    sourceRef,
    extractionMethod: "user_review_answer",
    fieldSource: "user_correction",
  };
}

function trailFromAnswer<T>(
  answer: ExplicitTakeoverAnswer<T>,
): CandidateCorrectionTrail {
  return {
    correctedAt: answer.answeredAt ?? new Date(0).toISOString(),
    correctedBy: answer.answeredBy ?? null,
    reason: answer.reason,
  };
}

/**
 * Applique une réponse explicite :
 * - present → applyCandidateCorrection ;
 * - absent → presentCandidate (user_correction) sans inventer si unanswered.
 */
export function applyExplicitAnswerToCandidate<T>(
  current: CandidateValue<T>,
  answer: ExplicitTakeoverAnswer<T> | undefined,
  fieldLabel: string,
  sourceRef: string,
): CandidateValue<T> {
  if (!isExplicitAnswer(answer)) return current;

  const trail = trailFromAnswer(answer);
  if (isCandidatePresent(current)) {
    return applyCandidateCorrection(current, answer.value, trail);
  }

  return presentCandidate(answer.value, "direct", reviewProvenance(fieldLabel, sourceRef), {
    reviewState: "corrected",
    correction: trail,
  });
}

export type MergeTakeoverReviewAnswersInput = {
  assets: readonly CandidateHistoricalAsset[];
  /**
   * Stocks documentaires initiaux (V1 : typiquement missing/missing).
   * Les answers stocks les complètent ou les corrigent.
   */
  stocks: CandidateFiscalStocks;
  reviewAnswers?: TakeoverReviewAnswers;
};

export type MergeTakeoverReviewAnswersResult = {
  assets: CandidateHistoricalAsset[];
  stocks: CandidateFiscalStocks;
};

export function mergeTakeoverReviewAnswers(
  input: MergeTakeoverReviewAnswersInput,
): MergeTakeoverReviewAnswersResult {
  const answers = input.reviewAnswers ?? {};
  const byKey = answers.byCandidateKey ?? {};

  const assets = input.assets.map((asset) => {
    const assetAnswers = byKey[asset.candidateKey];
    if (!assetAnswers) return { ...asset };

    return {
      ...asset,
      propertyId: applyExplicitAnswerToCandidate(
        asset.propertyId,
        assetAnswers.propertyId,
        "propertyId",
        `asset:${asset.candidateKey}:propertyId`,
      ),
      prorataConvention: applyExplicitAnswerToCandidate(
        asset.prorataConvention,
        assetAnswers.prorataConvention,
        "prorataConvention",
        `asset:${asset.candidateKey}:prorataConvention`,
      ),
      classification: applyExplicitAnswerToCandidate(
        asset.classification,
        assetAnswers.classification,
        "classification",
        `asset:${asset.candidateKey}:classification`,
      ),
    };
  });

  let stocks: CandidateFiscalStocks = { ...input.stocks };

  if (isExplicitAnswer(answers.deficits)) {
    const trail = trailFromAnswer(answers.deficits);
    stocks = {
      ...stocks,
      deficits: isCandidatePresent(stocks.deficits)
        ? applyCandidateCorrection(stocks.deficits, answers.deficits.value, trail)
        : presentCandidate(
            answers.deficits.value,
            "direct",
            reviewProvenance("deficits", "stocks:deficits"),
            { reviewState: "corrected", correction: trail },
          ),
    };
  }

  if (isExplicitAnswer(answers.amortissementsReportes)) {
    const trail = trailFromAnswer(answers.amortissementsReportes);
    stocks = {
      ...stocks,
      amortissementsReportes: isCandidatePresent(stocks.amortissementsReportes)
        ? applyCandidateCorrection(
            stocks.amortissementsReportes,
            answers.amortissementsReportes.value,
            trail,
          )
        : presentCandidate(
            answers.amortissementsReportes.value,
            "direct",
            reviewProvenance("amortissementsReportes", "stocks:ard"),
            { reviewState: "corrected", correction: trail },
          ),
      amortissementsReportesSource:
        answers.amortissementsReportesSource ??
        stocks.amortissementsReportesSource ??
        "manual_entry",
    };
  }

  return { assets, stocks };
}

/** Stocks V1 initiaux — jamais [] / 0 silencieux. */
export function emptyDocumentaryFiscalStocks(
  documentId = "doc-stocks-absent",
): CandidateFiscalStocks {
  return {
    deficits: missingCandidate("déficits non fournis par documents V1 (pas d'extracteur 2031)", {
      documentId,
      documentRole: "prior_tax_package",
      fieldLabel: "deficits",
    }),
    amortissementsReportes: missingCandidate(
      "ARD non fourni par documents V1 (pas d'extracteur 2031)",
      {
        documentId,
        documentRole: "prior_tax_package",
        fieldLabel: "amortissementsReportes",
      },
    ),
  };
}

export { explicitAnswer };
