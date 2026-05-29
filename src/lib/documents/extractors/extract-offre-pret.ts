import { createConfidenceScore } from "../types/confidence-score";
import type { ExtractionResult } from "../types/extraction-result";
import { EXTRACTION_SCHEMA_VERSION, type DocumentExtractor, type ExtractorContext } from "./extractor.types";

export type OffrePretExtractedData = {
  lenderName?: string;
  loanAmount?: number;
  annualInterest?: number;
  ratePercent?: number;
  durationMonths?: number;
};

export const OFFRE_PRET_EXTRACTOR_ID = "extractor.offre_pret";

export const extractOffrePret: DocumentExtractor<OffrePretExtractedData> = {
  id: OFFRE_PRET_EXTRACTOR_ID,
  documentType: "offre_pret",
  version: "0.1.0",
  supportedSchemaVersion: EXTRACTION_SCHEMA_VERSION,
  async extract(context: ExtractorContext): Promise<ExtractionResult<OffrePretExtractedData>> {
    return {
      documentType: "offre_pret",
      extractorId: OFFRE_PRET_EXTRACTOR_ID,
      fields: [],
      data: {},
      confidence: createConfidenceScore(0, ["stub:pending_implementation"]),
      needsReview: true,
      explainability: [`file:${context.fileName}`, "stage:extractor_stub"],
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
    };
  },
};
