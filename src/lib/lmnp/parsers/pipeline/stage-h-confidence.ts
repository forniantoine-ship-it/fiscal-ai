/**
 * Stage H — confidence scoring and fallback recommendation.
 */

import {
  computeConfidenceScore,
  computeMonotonicCrdRatio,
  countPopulatedFields,
  type SpatialInstallment,
} from "../spatial-amortization-core";
import type { ConfidenceArtifact, FinancialValidationArtifact, FiscalProjectionArtifact } from "./types";

export const PIPELINE_MIN_CONFIDENCE = 35;
export const PIPELINE_MIN_INSTALLMENTS = 3;
export const GPT_FALLBACK_THRESHOLD = 60;

export function runStageH_Confidence(params: {
  installments: SpatialInstallment[];
  probableRowCount: number;
  parsedRowCount: number;
  headerRoleCount: number;
  validation: FinancialValidationArtifact;
  fiscal?: FiscalProjectionArtifact;
}): ConfidenceArtifact {
  const fieldCounts = params.installments.map((row) => countPopulatedFields(row));
  const monotonicCrdRatio = computeMonotonicCrdRatio(params.installments);

  const overallConfidence = computeConfidenceScore({
    installments: params.installments,
    probableInstallmentRows: params.probableRowCount,
    parsedInstallmentRows: params.parsedRowCount,
    headerRoleCount: params.headerRoleCount,
    fieldCounts,
    monotonicCrdRatio,
  });

  const validationPenalty =
    params.validation.invalidRowCount * 5 + params.validation.ambiguousRowCount * 2;
  const adjustedConfidence = Math.max(0, overallConfidence - validationPenalty);

  const fieldConfidences: Record<string, number> = {
    installments: adjustedConfidence / 100,
    balance: params.validation.aggregateBalanceScore,
    crd: params.validation.aggregateCrdConsistencyScore,
    temporal: params.validation.aggregateTemporalScore,
  };

  if (params.fiscal) {
    fieldConfidences.interests2025 = params.fiscal.confidence.interests;
    fieldConfidences.insurance2025 = params.fiscal.confidence.insurance;
    fieldConfidences.CRD_2025 = params.fiscal.confidence.crd;
  }

  const success =
    params.installments.length >= PIPELINE_MIN_INSTALLMENTS &&
    adjustedConfidence >= PIPELINE_MIN_CONFIDENCE;

  let recommendGptFallback = false;
  let fallbackReason: string | undefined;

  if (adjustedConfidence < GPT_FALLBACK_THRESHOLD) {
    recommendGptFallback = true;
    fallbackReason = `low_confidence_${adjustedConfidence}`;
  } else if (params.validation.invalidRowCount > params.installments.length * 0.15) {
    recommendGptFallback = true;
    fallbackReason = "high_invalid_row_ratio";
  }

  return {
    overallConfidence: adjustedConfidence,
    fieldConfidences,
    recommendGptFallback,
    fallbackReason,
    success,
  };
}
