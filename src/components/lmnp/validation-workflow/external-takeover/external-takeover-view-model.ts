/**
 * Lot 5.2 — view-model pur (pas de DOM, pas de logique fiscale).
 * Consomme exceptions 5.1 + candidats présents pour l'affichage.
 */

import { isAvailable, type FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening";
import type { CandidateHistoricalAsset } from "@/lib/lmnp/services/takeover/asset-candidates";
import { isCandidatePresent } from "@/lib/lmnp/services/takeover/candidate-value";
import type { TakeoverException } from "@/lib/lmnp/services/takeover/exceptions";
import type { PrepareExternalTakeoverResult } from "@/lib/lmnp/services/takeover/prepare-external-takeover";
import type { TakeoverReviewAnswers } from "@/lib/lmnp/services/takeover/review-answers";
import { explicitAnswer, isExplicitAnswer } from "@/lib/lmnp/services/takeover/review-answers";
import {
  suggestRegisterAssetClassification,
  type ClassificationSuggestion,
} from "@/lib/lmnp/services/takeover/suggest-register-asset-classification";
import type { OpeningDeficitRow } from "@/lib/lmnp/services/fiscal-year-opening/types";
import type { OpeningProrataConvention } from "@/lib/lmnp/services/fiscal-year-opening/types";
import type { CandidateAssetClassification } from "@/lib/lmnp/services/takeover/asset-candidates";
import type { Property } from "@/lib/lmnp/types";

export type ExternalTakeoverProgressStep = {
  id: "documents" | "analysis" | "exceptions" | "takeover";
  label: string;
  detail: string;
  done: boolean;
};

export type AutoConfirmedAssetRow = {
  candidateKey: string;
  label: string;
  coutBrut?: number;
  cumulOuverture?: number;
};

export type ClientExceptionQuestion =
  | {
      code: "PROPERTY_BULK_CONFIRM";
      candidateKeys: string[];
      propertyId: string;
      propertyLabel: string;
      assetCount: number;
    }
  | {
      code: "PROPERTY_MATCH_REQUIRED";
      candidateKey: string;
      assetLabel: string;
      assetHint: string;
    }
  | {
      code: "PRORATA_REQUIRED";
      candidateKey: string;
      assetLabel: string;
    }
  | {
      code: "CLASSIFICATION_SUGGESTIONS_CONFIRM";
      items: Array<{
        candidateKey: string;
        assetLabel: string;
        suggested: CandidateAssetClassification;
        proof: ClassificationSuggestion["proof"];
      }>;
    }
  | {
      code: "CLASSIFICATION_REQUIRED";
      candidateKey: string;
      assetLabel: string;
    }
  | { code: "DEFICITS_REQUIRED" }
  | { code: "ARD_REQUIRED" };

const CLIENT_CODES = new Set([
  "PROPERTY_MATCH_REQUIRED",
  "PRORATA_REQUIRED",
  "CLASSIFICATION_REQUIRED",
  "DEFICITS_REQUIRED",
  "ARD_REQUIRED",
]);

export function hasBothTakeoverDocuments(docs: {
  priorTaxPackageDocumentId?: string;
  priorDepreciationRegisterDocumentId?: string;
} | undefined): boolean {
  return Boolean(
    docs?.priorTaxPackageDocumentId && docs?.priorDepreciationRegisterDocumentId,
  );
}

export function isExternalTakeoverComplete(opening: FiscalYearOpening | undefined): boolean {
  return Boolean(
    opening &&
      opening.validation.status === "validated" &&
      opening.source.kind === "external_takeover",
  );
}

export function buildAutoConfirmedRows(
  assets: readonly CandidateHistoricalAsset[] | undefined,
): AutoConfirmedAssetRow[] {
  if (!assets) return [];
  const rows: AutoConfirmedAssetRow[] = [];
  for (const asset of assets) {
    const label = isCandidatePresent(asset.label) ? asset.label.value : asset.candidateKey;
    const row: AutoConfirmedAssetRow = {
      candidateKey: asset.candidateKey,
      label,
    };
    if (isCandidatePresent(asset.coutBrut)) row.coutBrut = asset.coutBrut.value;
    if (isCandidatePresent(asset.cumulOuverture)) {
      row.cumulOuverture = asset.cumulOuverture.value;
    }
    // Afficher uniquement s'il y a au moins une valeur présente (hors label seul).
    if (row.coutBrut !== undefined || row.cumulOuverture !== undefined) {
      rows.push(row);
    }
  }
  return rows;
}

export function buildAutoConfirmedRowsFromOpening(
  opening: FiscalYearOpening,
): AutoConfirmedAssetRow[] {
  if (!isAvailable(opening.assets)) return [];
  return opening.assets.value.map((asset) => {
    const row: AutoConfirmedAssetRow = {
      candidateKey: asset.id,
      label: asset.label,
    };
    if (isAvailable(asset.coutBrut)) row.coutBrut = asset.coutBrut.value;
    if (isAvailable(asset.cumulOuverture)) row.cumulOuverture = asset.cumulOuverture.value;
    return row;
  });
}

export function controlsLookConcordant(
  result: PrepareExternalTakeoverResult | undefined,
): boolean {
  if (!result || !("controls" in result) || !result.controls) return false;
  return (
    result.controls.totalGross.status === "concordant" &&
    result.controls.totalCumulativeDepreciation.status === "concordant"
  );
}

export function clientExceptionsFromResult(
  result: PrepareExternalTakeoverResult | undefined,
): TakeoverException[] {
  if (!result || result.status === "built") return [];
  return result.exceptions.filter(
    (e) => e.answerability === "client" && CLIENT_CODES.has(e.code),
  );
}

export function hasManualReviewState(
  result: PrepareExternalTakeoverResult | undefined,
): boolean {
  if (!result) return false;
  if (result.status === "manual_review_required") return true;
  if (result.status === "blocked") {
    return result.exceptions.some(
      (e) =>
        e.answerability === "manual_review" ||
        e.code === "CONTROL_REVIEW_REQUIRED" ||
        e.code.includes("CONFLICT"),
    );
  }
  return result.exceptions.some((e) => e.answerability === "manual_review");
}

export function hasExtractionFailure(
  result: PrepareExternalTakeoverResult | undefined,
): boolean {
  if (!result || result.status === "built") return false;
  return result.exceptions.some((e) => e.code === "DOCUMENT_EXTRACTION_FAILED");
}

export type ToClientQuestionsOptions = {
  /** Biens du dossier — requis pour proposer une confirmation groupée mono-bien. */
  properties?: readonly Property[];
  /** Réponses déjà persistées — refuse bulk si propertyBulkDeclined. */
  reviewAnswers?: TakeoverReviewAnswers;
};

/**
 * Transforme les exceptions client en questions UX.
 * Mono-bien + N property manquants → 1 PROPERTY_BULK_CONFIRM (sauf si refusé).
 * Classifications suggérables → 1 CLASSIFICATION_SUGGESTIONS_CONFIRM + individuelles pour le reste.
 */
export function toClientQuestions(
  exceptions: readonly TakeoverException[],
  assets: readonly CandidateHistoricalAsset[] | undefined,
  options?: ToClientQuestionsOptions,
): ClientExceptionQuestion[] {
  const byKey = new Map(
    (assets ?? []).map((a) => [a.candidateKey, a] as const),
  );
  const stockQuestions: ClientExceptionQuestion[] = [];
  const propertyKeys: string[] = [];
  const classificationKeys: string[] = [];
  const questions: ClientExceptionQuestion[] = [];
  const seen = new Set<string>();

  for (const ex of exceptions) {
    if (!CLIENT_CODES.has(ex.code)) continue;
    const key = `${ex.code}|${ex.candidateKey ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (ex.code === "DEFICITS_REQUIRED") {
      stockQuestions.push({ code: "DEFICITS_REQUIRED" });
      continue;
    }
    if (ex.code === "ARD_REQUIRED") {
      stockQuestions.push({ code: "ARD_REQUIRED" });
      continue;
    }

    const candidateKey = ex.candidateKey;
    if (!candidateKey) continue;

    if (ex.code === "PROPERTY_MATCH_REQUIRED") {
      propertyKeys.push(candidateKey);
      continue;
    }
    if (ex.code === "CLASSIFICATION_REQUIRED") {
      classificationKeys.push(candidateKey);
      continue;
    }
    if (ex.code === "PRORATA_REQUIRED") {
      const asset = byKey.get(candidateKey);
      const assetLabel =
        asset && isCandidatePresent(asset.label) ? asset.label.value : candidateKey;
      questions.push({ code: "PRORATA_REQUIRED", candidateKey, assetLabel });
    }
  }

  const bulkDeclined = isExplicitAnswer(options?.reviewAnswers?.propertyBulkDeclined);
  const properties = options?.properties ?? [];
  const monoProperty = properties.length === 1 ? properties[0] : undefined;

  if (monoProperty && propertyKeys.length >= 2 && !bulkDeclined) {
    questions.unshift({
      code: "PROPERTY_BULK_CONFIRM",
      candidateKeys: propertyKeys,
      propertyId: monoProperty.id,
      propertyLabel: monoProperty.label || monoProperty.address || monoProperty.id,
      assetCount: propertyKeys.length,
    });
  } else {
    for (const candidateKey of propertyKeys) {
      const asset = byKey.get(candidateKey);
      const assetLabel =
        asset && isCandidatePresent(asset.label) ? asset.label.value : candidateKey;
      const hintParts: string[] = [];
      if (asset && isCandidatePresent(asset.coutBrut)) {
        hintParts.push(`valeur ${formatEuro(asset.coutBrut.value)}`);
      }
      if (asset && isCandidatePresent(asset.cumulOuverture)) {
        hintParts.push(`amort. ${formatEuro(asset.cumulOuverture.value)}`);
      }
      questions.push({
        code: "PROPERTY_MATCH_REQUIRED",
        candidateKey,
        assetLabel,
        assetHint: hintParts.join(" · "),
      });
    }
  }

  const classSuggestDeclined = isExplicitAnswer(
    options?.reviewAnswers?.classificationSuggestionsDeclined,
  );

  const suggestedItems: Extract<
    ClientExceptionQuestion,
    { code: "CLASSIFICATION_SUGGESTIONS_CONFIRM" }
  >["items"] = [];
  const unknownClassificationKeys: string[] = [];

  for (const candidateKey of classificationKeys) {
    const asset = byKey.get(candidateKey);
    const assetLabel =
      asset && isCandidatePresent(asset.label) ? asset.label.value : candidateKey;
    const suggestion =
      classSuggestDeclined
        ? null
        : suggestRegisterAssetClassification(
            asset && isCandidatePresent(asset.label) ? asset.label.value : undefined,
          );
    if (suggestion) {
      suggestedItems.push({
        candidateKey,
        assetLabel,
        suggested: suggestion.classification,
        proof: suggestion.proof,
      });
    } else {
      unknownClassificationKeys.push(candidateKey);
    }
  }

  if (suggestedItems.length >= 1) {
    questions.push({
      code: "CLASSIFICATION_SUGGESTIONS_CONFIRM",
      items: suggestedItems,
    });
  }

  for (const candidateKey of unknownClassificationKeys) {
    const asset = byKey.get(candidateKey);
    const assetLabel =
      asset && isCandidatePresent(asset.label) ? asset.label.value : candidateKey;
    questions.push({
      code: "CLASSIFICATION_REQUIRED",
      candidateKey,
      assetLabel,
    });
  }

  return [...questions, ...stockQuestions];
}

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function buildProgress(params: {
  documentsReady: boolean;
  analyzing: boolean;
  hasResult: boolean;
  clientExceptionCount: number;
  complete: boolean;
  labels: {
    documents: string;
    analysis: string;
    exceptions: string;
    takeover: string;
    received: string;
    done: string;
    remaining: (n: number) => string;
    waiting: string;
  };
}): ExternalTakeoverProgressStep[] {
  const { documentsReady, analyzing, hasResult, clientExceptionCount, complete, labels } =
    params;
  return [
    {
      id: "documents",
      label: labels.documents,
      detail: documentsReady ? `✓ ${labels.received}` : labels.waiting,
      done: documentsReady,
    },
    {
      id: "analysis",
      label: labels.analysis,
      detail: analyzing
        ? labels.waiting
        : hasResult || complete
          ? `✓ ${labels.done}`
          : labels.waiting,
      done: !analyzing && (hasResult || complete),
    },
    {
      id: "exceptions",
      label: labels.exceptions,
      detail: complete
        ? `✓ ${labels.done}`
        : hasResult
          ? labels.remaining(clientExceptionCount)
          : labels.waiting,
      done: complete || (hasResult && clientExceptionCount === 0),
    },
    {
      id: "takeover",
      label: labels.takeover,
      detail: complete ? `✓ ${labels.done}` : labels.waiting,
      done: complete,
    },
  ];
}

/** Merge une réponse asset dans TakeoverReviewAnswers (immutable). */
export function withAssetPropertyAnswer(
  current: TakeoverReviewAnswers | undefined,
  candidateKey: string,
  propertyId: string,
  answeredAt: string,
): TakeoverReviewAnswers {
  return mergeAssetAnswer(current, candidateKey, {
    propertyId: explicitAnswer(propertyId, {
      answeredAt,
      reason: "per_asset_property_assignment",
    }),
  });
}

/**
 * Confirmation groupée mono-bien — étend en N réponses par candidateKey.
 * Jamais un singlePropertyId global silencieux.
 */
export function withBulkPropertyAnswer(
  current: TakeoverReviewAnswers | undefined,
  candidateKeys: readonly string[],
  propertyId: string,
  answeredAt: string,
): TakeoverReviewAnswers {
  let next: TakeoverReviewAnswers = {
    ...current,
    byCandidateKey: { ...current?.byCandidateKey },
    propertyBulkDeclined: undefined,
    deficits: current?.deficits,
    amortissementsReportes: current?.amortissementsReportes,
    amortissementsReportesSource: current?.amortissementsReportesSource,
  };
  for (const candidateKey of candidateKeys) {
    next = mergeAssetAnswer(next, candidateKey, {
      propertyId: explicitAnswer(propertyId, {
        answeredAt,
        reason: "bulk_property_confirmation",
      }),
    });
  }
  return next;
}

/** Client refuse le bulk → questions individuelles. */
export function withPropertyBulkDeclined(
  current: TakeoverReviewAnswers | undefined,
  answeredAt: string,
): TakeoverReviewAnswers {
  return {
    ...current,
    byCandidateKey: current?.byCandidateKey,
    propertyBulkDeclined: explicitAnswer(true, {
      answeredAt,
      reason: "property_bulk_declined",
    }),
    deficits: current?.deficits,
    amortissementsReportes: current?.amortissementsReportes,
    amortissementsReportesSource: current?.amortissementsReportesSource,
  };
}

export function withAssetProrataAnswer(
  current: TakeoverReviewAnswers | undefined,
  candidateKey: string,
  prorata: OpeningProrataConvention,
  answeredAt: string,
): TakeoverReviewAnswers {
  return mergeAssetAnswer(current, candidateKey, {
    prorataConvention: explicitAnswer(prorata, { answeredAt }),
  });
}

export function withAssetClassificationAnswer(
  current: TakeoverReviewAnswers | undefined,
  candidateKey: string,
  classification: CandidateAssetClassification,
  answeredAt: string,
  reason = "per_asset_classification",
): TakeoverReviewAnswers {
  return mergeAssetAnswer(current, candidateKey, {
    classification: explicitAnswer(classification, { answeredAt, reason }),
  });
}

/** Confirme N suggestions documentaires — chaque réponse reste par candidateKey. */
export function withBulkClassificationAnswer(
  current: TakeoverReviewAnswers | undefined,
  items: readonly { candidateKey: string; classification: CandidateAssetClassification }[],
  answeredAt: string,
): TakeoverReviewAnswers {
  let next: TakeoverReviewAnswers | undefined = {
    ...current,
    classificationSuggestionsDeclined: undefined,
  };
  for (const item of items) {
    next = withAssetClassificationAnswer(
      next,
      item.candidateKey,
      item.classification,
      answeredAt,
      "bulk_classification_confirmation",
    );
  }
  return next ?? { byCandidateKey: {} };
}

/** Refuse le groupe de suggestions → questions individuelles. */
export function withClassificationSuggestionsDeclined(
  current: TakeoverReviewAnswers | undefined,
  answeredAt: string,
): TakeoverReviewAnswers {
  return {
    ...current,
    byCandidateKey: current?.byCandidateKey,
    propertyBulkDeclined: current?.propertyBulkDeclined,
    classificationSuggestionsDeclined: explicitAnswer(true, {
      answeredAt,
      reason: "classification_suggestions_declined",
    }),
    deficits: current?.deficits,
    amortissementsReportes: current?.amortissementsReportes,
    amortissementsReportesSource: current?.amortissementsReportesSource,
  };
}

export function withDeficitsNoneAnswer(
  current: TakeoverReviewAnswers | undefined,
  answeredAt: string,
): TakeoverReviewAnswers {
  return {
    ...current,
    byCandidateKey: current?.byCandidateKey,
    deficits: explicitAnswer([], { answeredAt }),
    amortissementsReportes: current?.amortissementsReportes,
    amortissementsReportesSource: current?.amortissementsReportesSource,
  };
}

export function withDeficitsRowsAnswer(
  current: TakeoverReviewAnswers | undefined,
  rows: OpeningDeficitRow[],
  answeredAt: string,
): TakeoverReviewAnswers {
  return {
    ...current,
    byCandidateKey: current?.byCandidateKey,
    deficits: explicitAnswer(rows, { answeredAt }),
    amortissementsReportes: current?.amortissementsReportes,
    amortissementsReportesSource: current?.amortissementsReportesSource,
  };
}

export function withArdNoneAnswer(
  current: TakeoverReviewAnswers | undefined,
  answeredAt: string,
): TakeoverReviewAnswers {
  return {
    ...current,
    byCandidateKey: current?.byCandidateKey,
    deficits: current?.deficits,
    amortissementsReportes: explicitAnswer(0, { answeredAt }),
    amortissementsReportesSource: "manual_entry",
  };
}

export function withArdAmountAnswer(
  current: TakeoverReviewAnswers | undefined,
  amount: number,
  answeredAt: string,
): TakeoverReviewAnswers {
  return {
    ...current,
    byCandidateKey: current?.byCandidateKey,
    deficits: current?.deficits,
    amortissementsReportes: explicitAnswer(amount, { answeredAt }),
    amortissementsReportesSource: "manual_entry",
  };
}

function mergeAssetAnswer(
  current: TakeoverReviewAnswers | undefined,
  candidateKey: string,
  patch: NonNullable<TakeoverReviewAnswers["byCandidateKey"]>[string],
): TakeoverReviewAnswers {
  const prev = current?.byCandidateKey?.[candidateKey] ?? {};
  return {
    ...current,
    byCandidateKey: {
      ...current?.byCandidateKey,
      [candidateKey]: { ...prev, ...patch },
    },
    propertyBulkDeclined: current?.propertyBulkDeclined,
    classificationSuggestionsDeclined: current?.classificationSuggestionsDeclined,
    deficits: current?.deficits,
    amortissementsReportes: current?.amortissementsReportes,
    amortissementsReportesSource: current?.amortissementsReportesSource,
  };
}
