import type { DocumentFact } from "../document-fact";
import type { FactExtractionResult } from "../fact-extraction-result";
import { createFactExtractionResult } from "../fact-extraction-result";

export type DeterministicFactExtractorInput = {
  rawText: string;
  documentId: string;
};

export type DeterministicFactExtractor = {
  id: string;
  canHandle(rawText: string): boolean;
  extract(input: DeterministicFactExtractorInput): DocumentFact[];
};

export function runDeterministicFactExtractor(
  extractor: DeterministicFactExtractor,
  input: DeterministicFactExtractorInput,
): FactExtractionResult {
  return createFactExtractionResult({
    documentId: input.documentId,
    extractorId: extractor.id,
    facts: extractor.extract(input),
  });
}
