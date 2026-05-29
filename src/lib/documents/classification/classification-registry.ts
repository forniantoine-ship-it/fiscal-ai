import { ALL_DOCUMENT_PATTERNS } from "../patterns";
import type { DocumentPattern } from "../patterns/pattern.types";
import type { DocumentType } from "../types/document-type";

export const CLASSIFICATION_SCHEMA_VERSION = "documents.classification.v1";

export type ClassificationProviderId = "pattern_rules" | "ai_classifier" | "human_override";

export type ClassificationProvider = {
  id: ClassificationProviderId;
  /** Lower priority runs first; higher priority can override in future multi-provider fusion */
  priority: number;
  enabled: boolean;
};

const DEFAULT_PROVIDERS: ClassificationProvider[] = [
  { id: "pattern_rules", priority: 10, enabled: true },
  { id: "ai_classifier", priority: 20, enabled: false },
  { id: "human_override", priority: 100, enabled: true },
];

export type ClassificationRegistry = {
  patterns: readonly DocumentPattern[];
  providers: ClassificationProvider[];
  getPatternsForType(documentType: DocumentType): DocumentPattern[];
  getPatternById(patternId: string): DocumentPattern | undefined;
};

export function createClassificationRegistry(
  overrides?: Partial<Pick<ClassificationRegistry, "patterns" | "providers">>,
): ClassificationRegistry {
  const patterns = overrides?.patterns ?? ALL_DOCUMENT_PATTERNS;
  const providers = overrides?.providers ?? DEFAULT_PROVIDERS;

  return {
    patterns,
    providers,
    getPatternsForType(documentType) {
      return patterns.filter((p) => p.documentType === documentType);
    },
    getPatternById(patternId) {
      return patterns.find((p) => p.id === patternId);
    },
  };
}

export const defaultClassificationRegistry = createClassificationRegistry();
