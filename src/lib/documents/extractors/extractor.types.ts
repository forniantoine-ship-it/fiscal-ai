import type { ClassificationResult } from "../types/classification-result";
import type { ExtractionResult } from "../types/extraction-result";
import type { DocumentType } from "../types/document-type";

export const EXTRACTION_SCHEMA_VERSION = "documents.extraction.v1";

export type ExtractorContext = {
  documentId: string;
  rawText: string;
  fileName: string;
  classification: ClassificationResult;
};

export type DocumentExtractor<TData extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  documentType: DocumentType;
  version: string;
  supportedSchemaVersion: string;
  extract(context: ExtractorContext): Promise<ExtractionResult<TData>>;
};

export type ExtractorRegistry = {
  get(documentType: DocumentType): DocumentExtractor | undefined;
  register(extractor: DocumentExtractor): void;
  list(): DocumentExtractor[];
};

export function createExtractorRegistry(
  initial: DocumentExtractor[] = [],
): ExtractorRegistry {
  const map = new Map<DocumentType, DocumentExtractor>();
  for (const e of initial) map.set(e.documentType, e);

  return {
    get: (documentType) => map.get(documentType),
    register(extractor) {
      map.set(extractor.documentType, extractor);
    },
    list: () => [...map.values()],
  };
}
