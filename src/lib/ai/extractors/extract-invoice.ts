import OpenAI from "openai";

import {
  buildInvoiceExtractionSystemPrompt,
  buildInvoiceExtractionUserPrompt,
  INVOICE_EXTRACTION_JSON_SCHEMA,
} from "../prompts/invoice-prompt";
import { invoiceSchema, CATEGORY_HINTS, type InvoiceData } from "../schemas/invoice-schema";

const DEFAULT_MODEL = "gpt-4o-mini";

export type ExtractInvoiceInput = {
  rawText: string;
  fileName?: string;
};

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurée.");
  }
  return new OpenAI({ apiKey });
}

function getModel(): string {
  return (
    process.env.OPENAI_INVOICE_EXTRACTION_MODEL ??
    process.env.OPENAI_EXTRACTION_MODEL ??
    process.env.OPENAI_OCR_MODEL ??
    DEFAULT_MODEL
  );
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

function normalizeCategoryHint(value: unknown): InvoiceData["categoryHint"] {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return (CATEGORY_HINTS as readonly string[]).includes(trimmed)
    ? (trimmed as InvoiceData["categoryHint"])
    : null;
}

function prepareForValidation(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;

  const data = raw as Record<string, unknown>;
  return {
    supplierName: normalizeNullableString(data.supplierName),
    invoiceDate: normalizeNullableString(data.invoiceDate),
    totalTtc: normalizeNullableNumber(data.totalTtc),
    vatAmount: normalizeNullableNumber(data.vatAmount),
    currency: normalizeNullableString(data.currency),
    categoryHint: normalizeCategoryHint(data.categoryHint),
  };
}

/**
 * Extracts structured invoice data from raw text.
 * Does not classify documents or make fiscal/accounting decisions.
 */
export async function extractInvoice(input: ExtractInvoiceInput): Promise<InvoiceData> {
  console.log("[invoice-extractor] start", {
    fileName: input.fileName,
    textLength: input.rawText.length,
  });

  if (!input.rawText.trim()) {
    console.log("[invoice-extractor] extraction failed", { reason: "empty text" });
    throw new Error("Texte de facture vide.");
  }

  const model = getModel();

  try {
    const openai = getOpenAI();

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: buildInvoiceExtractionSystemPrompt() },
        {
          role: "user",
          content: buildInvoiceExtractionUserPrompt({
            fileName: input.fileName,
            rawText: input.rawText,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: INVOICE_EXTRACTION_JSON_SCHEMA,
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Réponse vide du modèle OpenAI.");
    }

    console.log("[invoice-extractor] openai success", { fileName: input.fileName, model });

    const parsed = JSON.parse(content) as unknown;
    const prepared = prepareForValidation(parsed);
    const result = invoiceSchema.safeParse(prepared);

    if (!result.success) {
      console.log("[invoice-extractor] validation failed", {
        fileName: input.fileName,
        issues: result.error.issues.map((i) => i.message),
      });
      throw new Error("Validation Zod échouée pour la facture.");
    }

    console.log("[invoice-extractor] zod validation success", {
      fileName: input.fileName,
      supplierName: result.data.supplierName,
      totalTtc: result.data.totalTtc,
    });

    return result.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction facture échouée.";
    console.log("[invoice-extractor] extraction failed", {
      fileName: input.fileName,
      reason: message,
    });
    throw err instanceof Error ? err : new Error(message);
  }
}
