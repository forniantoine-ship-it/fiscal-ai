import type { DocumentFact } from "./document-fact";
import { DOCUMENT_FACT_SCHEMA_VERSION } from "./document-fact";

export type FactExtractionResult = {
  documentId: string;
  extractorId: string;
  facts: DocumentFact[];
  schemaVersion: string;
  observedAt: string;
};

export type CreateFactExtractionResultInput = {
  documentId: string;
  extractorId: string;
  facts: DocumentFact[];
  schemaVersion?: string;
  observedAt?: string;
};

export function createFactExtractionResult(
  input: CreateFactExtractionResultInput,
): FactExtractionResult {
  return {
    documentId: input.documentId,
    extractorId: input.extractorId,
    facts: input.facts,
    schemaVersion: input.schemaVersion ?? DOCUMENT_FACT_SCHEMA_VERSION,
    observedAt: input.observedAt ?? new Date().toISOString(),
  };
}
