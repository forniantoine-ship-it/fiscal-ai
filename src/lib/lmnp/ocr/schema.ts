import type { DocumentType } from "../types";

/** Structured JSON returned by OpenAI Vision (strict schema). */
export interface OcrMoneyField {
  euros: number;
  confidence: number;
}

export interface OcrTextField {
  text: string;
  confidence: number;
}

export interface OcrDateField {
  value: string;
  confidence: number;
}

export interface OcrDocumentResult {
  documentType: DocumentType;
  totalAmount: OcrMoneyField | null;
  vatAmount: OcrMoneyField | null;
  supplierName: OcrTextField | null;
  invoiceDate: OcrDateField | null;
}

export const OCR_DOCUMENT_TYPES: DocumentType[] = [
  "lease_contract",
  "rent_receipt",
  "rent_bank_statement",
  "bank_statement",
  "property_tax",
  "insurance_invoice",
  "condo_charges",
  "works_invoice",
  "furniture_invoice",
  "loan_interest_certificate",
  "loan_schedule",
  "notary_deed",
  "unknown",
];

export const LMNP_OCR_JSON_SCHEMA = {
  name: "lmnp_document_ocr",
  strict: true,
  schema: {
    type: "object",
    properties: {
      documentType: {
        type: "string",
        enum: OCR_DOCUMENT_TYPES,
        description: "Best-matching LMNP document type for French rental tax filing.",
      },
      totalAmount: {
        anyOf: [
          {
            type: "object",
            properties: {
              euros: { type: "number", description: "Total TTC or main amount in EUR." },
              confidence: { type: "number", description: "0-100 confidence." },
            },
            required: ["euros", "confidence"],
            additionalProperties: false,
          },
          { type: "null" },
        ],
      },
      vatAmount: {
        anyOf: [
          {
            type: "object",
            properties: {
              euros: { type: "number" },
              confidence: { type: "number" },
            },
            required: ["euros", "confidence"],
            additionalProperties: false,
          },
          { type: "null" },
        ],
      },
      supplierName: {
        anyOf: [
          {
            type: "object",
            properties: {
              text: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["text", "confidence"],
            additionalProperties: false,
          },
          { type: "null" },
        ],
      },
      invoiceDate: {
        anyOf: [
          {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: "ISO date YYYY-MM-DD if visible on document.",
              },
              confidence: { type: "number" },
            },
            required: ["value", "confidence"],
            additionalProperties: false,
          },
          { type: "null" },
        ],
      },
    },
    required: ["documentType", "totalAmount", "vatAmount", "supplierName", "invoiceDate"],
    additionalProperties: false,
  },
} as const;

export function parseOcrDocumentResult(raw: unknown): OcrDocumentResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!OCR_DOCUMENT_TYPES.includes(o.documentType as DocumentType)) return null;
  return raw as OcrDocumentResult;
}
