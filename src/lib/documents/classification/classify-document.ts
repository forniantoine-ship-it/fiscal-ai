import { CONFIDENCE_THRESHOLDS, createConfidenceScore } from "../types/confidence-score";
import type { ClassificationCandidate, ClassificationResult } from "../types/classification-result";
import type { DocumentTunnel } from "../types/document-tunnel";
import type { DocumentType } from "../types/document-type";
import {
  CLASSIFICATION_SCHEMA_VERSION,
  defaultClassificationRegistry,
  type ClassificationRegistry,
} from "./classification-registry";
import { scoreDocumentAgainstPatterns, type ScoreDocumentInput } from "./score-document";

export type ClassifyDocumentInput = ScoreDocumentInput & {
  tunnel?: DocumentTunnel | null;
  /** Optional AI recommendation — merged when ai_classifier provider is enabled */
  aiDocumentType?: DocumentType | null;
  aiConfidence?: number | null;
};

export type ClassifyDocumentOptions = {
  registry?: ClassificationRegistry;
};

/**
 * Classifies a document using registered providers (pattern rules first).
 * AI and human overrides plug in via registry without changing call sites.
 */
export function classifyDocument(
  input: ClassifyDocumentInput,
  options?: ClassifyDocumentOptions,
): ClassificationResult {
  const registry = options?.registry ?? defaultClassificationRegistry;
  const patternProvider = registry.providers.find(
    (p) => p.id === "pattern_rules" && p.enabled,
  );

  const candidates: ClassificationCandidate[] = [];

  if (patternProvider) {
    const scores = scoreDocumentAgainstPatterns(registry.patterns, input);
    for (const s of scores) {
      candidates.push({
        documentType: s.documentType,
        score: s.confidence,
        source: s.patternId,
        matchedSignals: s.matchedSignals,
      });
    }
  }

  const best = candidates[0];
  const documentType: DocumentType = best?.documentType ?? "unknown";
  const confidence = best?.score ?? createConfidenceScore(0, ["no_match"]);
  const needsReview =
    documentType === "unknown" || confidence.value < CONFIDENCE_THRESHOLDS.review;

  const explainability = [
    ...(best?.matchedSignals ?? []),
    `winner:${documentType}`,
    `providers:${registry.providers.filter((p) => p.enabled).map((p) => p.id).join(",")}`,
  ];

  return {
    documentType,
    confidence,
    candidates,
    tunnel: input.tunnel ?? null,
    needsReview,
    explainability,
    schemaVersion: CLASSIFICATION_SCHEMA_VERSION,
  };
}
