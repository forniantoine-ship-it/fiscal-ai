import type { ResolvedDocumentClassification, UserUploadCategory } from "./document-classification-types";
export const DOCUMENT_FAMILIES = [
  "travaux_invoice",
  "furniture_invoice",
  "loan_offer",
  "notary_act",
  "property_tax",
  "insurance_document",
  "unknown",
] as const;

export type DocumentFamily = (typeof DOCUMENT_FAMILIES)[number];

export const EXTRACTION_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;

export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

/** Universal extraction schema returned by OpenAI — unknown values must be null. */
export interface UniversalExtractionSchema {
  document_type: string;
  supplier: string | null;
  organization: string | null;
  invoice_date: string | null;
  amount_ttc: number | null;
  amount_ht: number | null;
  vat_amount: number | null;
  loan_amount: number | null;
  interest_rate: number | null;
  monthly_payment: number | null;
  property_price: number | null;
  notary_fees: number | null;
  category: string | null;
  summary: string | null;
  confidence_score: number;
}

export interface ExtractedDocumentDataRow {
  id: string;
  document_id: string | null;
  dossier_id: string;
  raw_text: string;
  structured_data: UniversalExtractionSchema | Record<string, unknown>;
  document_type: string;
  confidence_score: number;
  detected_category: string | null;
  user_category: string | null;
  final_category: string | null;
  needs_review: boolean;
  classification_reason: string[];
  extraction_status: ExtractionStatus;
  ai_model: string;
  schema_version: string;
  prompt_version: string;
  created_at: string;
}

export interface ExtractDocumentInput {
  fileBuffer: Buffer;
  fileName: string;
  dossierId: string;
  documentId?: string | null;
  mimeType?: string;
  authToken?: string;
  /** Upload workflow section — used by classification normalization. */
  userCategory?: UserUploadCategory | null;
}

export interface ExtractDocumentResult {
  id: string;
  structuredData: UniversalExtractionSchema;
  documentType: string;
  confidenceScore: number;
  classification?: ResolvedDocumentClassification;
  extractionStatus: ExtractionStatus;
  aiModel: string;
  rawTextLength: number;
  error?: string;
}

export const EMPTY_EXTRACTION: UniversalExtractionSchema = {
  document_type: "unknown",
  supplier: null,
  organization: null,
  invoice_date: null,
  amount_ttc: null,
  amount_ht: null,
  vat_amount: null,
  loan_amount: null,
  interest_rate: null,
  monthly_payment: null,
  property_price: null,
  notary_fees: null,
  category: null,
  summary: null,
  confidence_score: 0,
};
