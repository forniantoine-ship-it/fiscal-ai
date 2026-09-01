import type { DocumentType } from "../types";

export type OcrAmountPeriod = "monthly" | "annual" | "one_time" | "unknown";
export type OcrAmountKind = "ttc" | "ht" | "unknown";

export type OcrFieldKey =
  | "totalAmount"
  | "vatAmount"
  | "supplierName"
  | "invoiceDate"
  | "address";

export interface OcrFieldRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrMoneyField {
  euros: number;
  confidence: number;
  region?: OcrFieldRegion;
}

export interface OcrTextField {
  text: string;
  confidence: number;
  region?: OcrFieldRegion;
}

export interface OcrDateField {
  value: string;
  confidence: number;
  region?: OcrFieldRegion;
}

export interface OcrDocumentResult {
  documentType: DocumentType;
  documentTypeConfidence: number;
  amountPeriod: OcrAmountPeriod;
  amountKind: OcrAmountKind;
  totalAmount: OcrMoneyField | null;
  vatAmount: OcrMoneyField | null;
  supplierName: OcrTextField | null;
  invoiceDate: OcrDateField | null;
  address: OcrTextField | null;
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

const REGION_SCHEMA = {
  type: "object",
  properties: {
    x: { type: "number", description: "Left edge as % of image width (0-100)." },
    y: { type: "number", description: "Top edge as % of image height (0-100)." },
    width: { type: "number", description: "Width as % of image width." },
    height: { type: "number", description: "Height as % of image height." },
  },
  required: ["x", "y", "width", "height"],
  additionalProperties: false,
} as const;

/** Strict-mode optional: property required, value may be null (OpenAI Structured Outputs). */
const NULLABLE_REGION_SCHEMA = {
  anyOf: [REGION_SCHEMA, { type: "null" }],
} as const;

const MONEY_FIELD_SCHEMA = {
  anyOf: [
    {
      type: "object",
      properties: {
        euros: { type: "number", description: "Amount in EUR, decimal." },
        confidence: { type: "number", description: "0-100 confidence." },
        region: NULLABLE_REGION_SCHEMA,
      },
      required: ["euros", "confidence", "region"],
      additionalProperties: false,
    },
    { type: "null" },
  ],
} as const;

const TEXT_FIELD_SCHEMA = {
  anyOf: [
    {
      type: "object",
      properties: {
        text: { type: "string" },
        confidence: { type: "number" },
        region: NULLABLE_REGION_SCHEMA,
      },
      required: ["text", "confidence", "region"],
      additionalProperties: false,
    },
    { type: "null" },
  ],
} as const;

const DATE_FIELD_SCHEMA = {
  anyOf: [
    {
      type: "object",
      properties: {
        value: { type: "string", description: "ISO date YYYY-MM-DD." },
        confidence: { type: "number" },
        region: NULLABLE_REGION_SCHEMA,
      },
      required: ["value", "confidence", "region"],
      additionalProperties: false,
    },
    { type: "null" },
  ],
} as const;

export const LMNP_OCR_JSON_SCHEMA = {
  name: "lmnp_document_ocr",
  strict: true,
  schema: {
    type: "object",
    properties: {
      documentType: {
        type: "string",
        enum: OCR_DOCUMENT_TYPES,
        description: "Best-matching LMNP document type.",
      },
      documentTypeConfidence: {
        type: "number",
        description: "0-100 confidence in documentType classification.",
      },
      amountPeriod: {
        type: "string",
        enum: ["monthly", "annual", "one_time", "unknown"],
        description: "Period covered by totalAmount.",
      },
      amountKind: {
        type: "string",
        enum: ["ttc", "ht", "unknown"],
        description: "Whether totalAmount is TTC or HT.",
      },
      totalAmount: MONEY_FIELD_SCHEMA,
      vatAmount: MONEY_FIELD_SCHEMA,
      supplierName: TEXT_FIELD_SCHEMA,
      invoiceDate: DATE_FIELD_SCHEMA,
      address: TEXT_FIELD_SCHEMA,
    },
    required: [
      "documentType",
      "documentTypeConfidence",
      "amountPeriod",
      "amountKind",
      "totalAmount",
      "vatAmount",
      "supplierName",
      "invoiceDate",
      "address",
    ],
    additionalProperties: false,
  },
} as const;

function parseMoneyField(raw: unknown): OcrMoneyField | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const euros = Number(o.euros);
  const confidence = Number(o.confidence);
  if (!Number.isFinite(euros) || !Number.isFinite(confidence)) return null;
  return {
    euros,
    confidence,
    region: parseRegion(o.region),
  };
}

function parseTextField(raw: unknown): OcrTextField | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.text !== "string") return null;
  const confidence = Number(o.confidence);
  if (!Number.isFinite(confidence)) return null;
  return {
    text: o.text,
    confidence,
    region: parseRegion(o.region),
  };
}

function parseDateField(raw: unknown): OcrDateField | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.value !== "string") return null;
  const confidence = Number(o.confidence);
  if (!Number.isFinite(confidence)) return null;
  return {
    value: o.value,
    confidence,
    region: parseRegion(o.region),
  };
}

function parseRegion(raw: unknown): OcrFieldRegion | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const x = Number(r.x);
  const y = Number(r.y);
  const width = Number(r.width);
  const height = Number(r.height);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return undefined;
  return { x, y, width, height };
}

export function parseOcrDocumentResult(raw: unknown): OcrDocumentResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  if (!OCR_DOCUMENT_TYPES.includes(o.documentType as DocumentType)) return null;

  const documentTypeConfidence = Number(o.documentTypeConfidence ?? 50);
  const amountPeriod = o.amountPeriod as OcrAmountPeriod;
  const amountKind = o.amountKind as OcrAmountKind;

  const validPeriods: OcrAmountPeriod[] = ["monthly", "annual", "one_time", "unknown"];
  const validKinds: OcrAmountKind[] = ["ttc", "ht", "unknown"];

  return {
    documentType: o.documentType as DocumentType,
    documentTypeConfidence: Number.isFinite(documentTypeConfidence)
      ? Math.min(100, Math.max(0, documentTypeConfidence))
      : 50,
    amountPeriod: validPeriods.includes(amountPeriod) ? amountPeriod : "unknown",
    amountKind: validKinds.includes(amountKind) ? amountKind : "unknown",
    totalAmount: parseMoneyField(o.totalAmount),
    vatAmount: parseMoneyField(o.vatAmount),
    supplierName: parseTextField(o.supplierName),
    invoiceDate: parseDateField(o.invoiceDate),
    address: parseTextField(o.address),
  };
}
