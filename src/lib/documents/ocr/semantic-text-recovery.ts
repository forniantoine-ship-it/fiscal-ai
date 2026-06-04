/**
 * Partial-text semantic recovery eligibility for narrative/legal documents.
 * Used when OCR quality checks fail but non-empty text may still support GPT extraction.
 */

import { computeOcrQualityMetrics, type OcrQualityMetrics } from "./ocr-quality";

/** Below this length the corpus is treated as effectively empty. */
export const EFFECTIVELY_EMPTY_MIN_LENGTH = 15;

/** Minimum non-empty text to attempt semantic recovery. */
export const PARTIAL_TEXT_MIN_LENGTH = 40;

const NARRATIVE_LEGAL_FILENAME_PATTERN =
  /acte|compromis|attestation|diagnostic|vente|notaire|promesse|bail|logement|dpe|amiante|plomb|erp|electric|titre|propri[eé]t/i;

const NARRATIVE_LEGAL_TEXT_SIGNALS: RegExp[] = [
  /acte\s+(?:de\s+)?vente/i,
  /compromis\s+de\s+vente/i,
  /attestation/i,
  /diagnostic/i,
  /notaire/i,
  /cadastre/i,
  /conservateur\s+des\s+hypoth[eè]ques/i,
  /promesse\s+de\s+vente/i,
  /mandat\s+de\s+vente/i,
];

export function isNarrativeLegalDocumentHint(fileName: string): boolean {
  return NARRATIVE_LEGAL_FILENAME_PATTERN.test(fileName);
}

export function hasNarrativeLegalTextSignals(text: string): boolean {
  return NARRATIVE_LEGAL_TEXT_SIGNALS.some((pattern) => pattern.test(text));
}

export function isEffectivelyEmpty(text: string): boolean {
  return text.trim().length < EFFECTIVELY_EMPTY_MIN_LENGTH;
}

/**
 * Whether partial extracted text is worth attempting GPT semantic understanding.
 */
export function isSemanticRecoveryEligible(text: string, fileName?: string): boolean {
  const metrics = computeOcrQualityMetrics(text);
  if (metrics.textLength < PARTIAL_TEXT_MIN_LENGTH) return false;

  const narrativeHint =
    (fileName ? isNarrativeLegalDocumentHint(fileName) : false) ||
    hasNarrativeLegalTextSignals(text);

  if (narrativeHint) {
    return metrics.alphaRatio >= 0.06 || metrics.textLength >= 70;
  }

  return metrics.textLength >= 60 && metrics.alphaRatio >= 0.12;
}

export function buildSemanticRecoveryReason(
  text: string,
  fileName?: string,
): string {
  if (fileName && isNarrativeLegalDocumentHint(fileName)) {
    return "narrative_legal_document_partial_text";
  }
  if (hasNarrativeLegalTextSignals(text)) {
    return "narrative_text_signals_in_corpus";
  }
  return "partial_text_above_minimum";
}
