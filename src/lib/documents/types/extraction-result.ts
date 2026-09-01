import type { ConfidenceScore } from "./confidence-score";
import type { DocumentType } from "./document-type";
import type { GovernedFieldMetadata } from "./governed-field";

/** How a field value was obtained — used for audit and autofill policy. */
export type ExtractionMethod =
  | "regex_label"
  | "regex_pattern"
  | "derived"
  | "keyword";

/**
 * Field-level provenance for conservative, auditable extraction.
 */
export type FieldProvenance = {
  field: string;
  sourceDocument: DocumentType;
  confidence: ConfidenceScore;
  extractionMethod: ExtractionMethod;
  /** True when value is inferred rather than directly read from the document */
  inferred: boolean;
};

export type ExtractedField<T = unknown> = {
  key: string;
  label: string;
  value: T;
  confidence: ConfidenceScore;
  /** Raw OCR snippet or model citation supporting this field */
  evidence?: string;
  provenance?: FieldProvenance;
  /** Persisted ownership metadata when stored in the governed field store */
  metadata?: GovernedFieldMetadata;
};

/**
 * Structured output from a document-type-specific extractor.
 */
export type ExtractionResult<TFields extends Record<string, unknown> = Record<string, unknown>> = {
  documentType: DocumentType;
  extractorId: string;
  fields: ExtractedField[];
  /** Typed payload for consumers; built from fields when extractors finalize */
  data: Partial<TFields>;
  confidence: ConfidenceScore;
  needsReview: boolean;
  explainability: string[];
  schemaVersion: string;
};
