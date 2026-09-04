import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ResolvedDocumentClassification } from "./document-classification-types";
import {
  classifyDocument,
  CLASSIFICATION_PROMPT_VERSION,
  CLASSIFICATION_SCHEMA_VERSION,
} from "./classify-document";
import {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  UNIVERSAL_EXTRACTION_JSON_SCHEMA,
} from "./document-prompts";
import {
  EMPTY_EXTRACTION,
  type ExtractDocumentInput,
  type ExtractDocumentResult,
  type UniversalExtractionSchema,
} from "./document-types";
import { extractInvoice } from "./extractors/extract-invoice";
import type { InvoiceData } from "./schemas/invoice-schema";
import { resolveDocumentClassification } from "./resolve-document-classification";
import { getServerSupabaseUnscoped } from "@/lib/supabase-server";

const DEFAULT_MODEL = "gpt-4o-mini";
const PDF_MIME_TYPES = new Set(["application/pdf", "application/x-pdf"]);

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurée.");
  }
  return new OpenAI({ apiKey });
}

function getModel(): string {
  return process.env.OPENAI_EXTRACTION_MODEL ?? process.env.OPENAI_OCR_MODEL ?? DEFAULT_MODEL;
}

function isPdf(input: ExtractDocumentInput): boolean {
  if (input.mimeType && PDF_MIME_TYPES.has(input.mimeType)) return true;
  return input.fileName.toLowerCase().endsWith(".pdf");
}

async function parsePdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return result.text?.trim() ?? "";
  } finally {
    await parser.destroy();
  }
}

function normalizeExtraction(raw: unknown): UniversalExtractionSchema {
  if (!raw || typeof raw !== "object") return { ...EMPTY_EXTRACTION };

  const data = raw as Record<string, unknown>;

  const str = (key: string): string | null => {
    const value = data[key];
    if (typeof value !== "string" || !value.trim()) return null;
    return value.trim();
  };

  const num = (key: string): number | null => {
    const value = data[key];
    if (typeof value !== "number" || Number.isNaN(value)) return null;
    return value;
  };

  const confidenceRaw = data.confidence_score;
  const confidence =
    typeof confidenceRaw === "number" && !Number.isNaN(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : 0;

  return {
    document_type: str("document_type") ?? "unknown",
    supplier: str("supplier"),
    organization: str("organization"),
    invoice_date: str("invoice_date"),
    amount_ttc: num("amount_ttc"),
    amount_ht: num("amount_ht"),
    vat_amount: num("vat_amount"),
    loan_amount: num("loan_amount"),
    interest_rate: num("interest_rate"),
    monthly_payment: num("monthly_payment"),
    property_price: num("property_price"),
    notary_fees: num("notary_fees"),
    category: str("category"),
    summary: str("summary"),
    confidence_score: confidence,
  };
}

async function extractWithOpenAI(
  rawText: string,
  fileName: string,
  model: string,
): Promise<UniversalExtractionSchema> {
  console.log("[extract] openai request", { fileName, model, textLength: rawText.length });

  const openai = getOpenAI();

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: buildExtractionSystemPrompt() },
      { role: "user", content: buildExtractionUserPrompt({ fileName, rawText }) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: UNIVERSAL_EXTRACTION_JSON_SCHEMA,
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Réponse vide du modèle OpenAI.");
  }

  const structured = normalizeExtraction(JSON.parse(content));
  console.log("[extract] openai success", {
    fileName,
    documentType: structured.document_type,
    confidence: structured.confidence_score,
  });

  return structured;
}

function mapInvoiceToUniversal(
  invoice: InvoiceData,
  resolved: ResolvedDocumentClassification,
): UniversalExtractionSchema {
  return {
    document_type: resolved.documentType,
    supplier: invoice.supplierName,
    organization: null,
    invoice_date: invoice.invoiceDate,
    amount_ttc: invoice.totalTtc,
    amount_ht: null,
    vat_amount: invoice.vatAmount,
    loan_amount: null,
    interest_rate: null,
    monthly_payment: null,
    property_price: null,
    notary_fees: null,
    category: invoice.categoryHint ?? resolved.finalCategory,
    summary: null,
    confidence_score: resolved.confidenceScore,
  };
}

async function updateDocumentExtractionStatus(
  supabase: SupabaseClient,
  documentId: string | null | undefined,
  status: string,
): Promise<void> {
  if (!documentId) return;

  const { error } = await supabase
    .from("documents")
    .update({ extraction_status: status })
    .eq("id", documentId);

  if (error) {
    console.error("[extract] documents status update failed", {
      documentId,
      status,
      message: error.message,
    });
  }
}

async function persistClassification(params: {
  supabase: SupabaseClient;
  dossierId: string;
  documentId?: string | null;
  rawText: string;
  resolved: ResolvedDocumentClassification;
  aiModel: string;
}): Promise<string> {
  const { supabase, dossierId, documentId, rawText, resolved, aiModel } = params;

  const payload = {
    document_id: documentId ?? null,
    dossier_id: dossierId,
    raw_text: rawText.slice(0, 100_000),
    structured_data: {},
    document_type: resolved.documentType,
    confidence_score: resolved.confidenceScore,
    detected_category: resolved.detectedCategory,
    user_category: resolved.userCategory,
    final_category: resolved.finalCategory,
    needs_review: resolved.needsReview,
    classification_reason: resolved.classificationReason,
    extraction_status: "processing",
    ai_model: aiModel,
    schema_version: CLASSIFICATION_SCHEMA_VERSION,
    prompt_version: CLASSIFICATION_PROMPT_VERSION,
  };

  const { data, error } = await supabase
    .from("extracted_document_data")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Échec insertion classification Supabase : ${error.message}`);
  }

  console.log("[extract] classification stored", {
    id: data.id,
    documentType: resolved.documentType,
    detectedCategory: resolved.detectedCategory,
    finalCategory: resolved.finalCategory,
    needsReview: resolved.needsReview,
    confidence: resolved.confidenceScore,
  });

  return data.id as string;
}

async function completeExtraction(params: {
  supabase: SupabaseClient;
  rowId: string;
  structuredData: Record<string, unknown>;
  extractionStatus: "completed" | "failed";
  errorMessage?: string;
}): Promise<void> {
  const { supabase, rowId, structuredData, extractionStatus, errorMessage } = params;

  const { error } = await supabase
    .from("extracted_document_data")
    .update({
      structured_data: errorMessage
        ? { ...structuredData, summary: errorMessage }
        : structuredData,
      extraction_status: extractionStatus,
    })
    .eq("id", rowId);

  if (error) {
    throw new Error(`Échec mise à jour extraction Supabase : ${error.message}`);
  }

  console.log("[extract] db update success", { id: rowId, extractionStatus });
}

async function persistExtraction(params: {
  supabase: SupabaseClient;
  dossierId: string;
  documentId?: string | null;
  rawText: string;
  structuredData: UniversalExtractionSchema;
  extractionStatus: "completed" | "failed";
  aiModel: string;
  errorMessage?: string;
  classification?: ResolvedDocumentClassification;
}): Promise<string> {
  const {
    supabase,
    dossierId,
    documentId,
    rawText,
    structuredData,
    extractionStatus,
    aiModel,
    errorMessage,
    classification,
  } = params;

  const payload = {
    document_id: documentId ?? null,
    dossier_id: dossierId,
    raw_text: rawText.slice(0, 100_000),
    structured_data: errorMessage
      ? { ...structuredData, summary: errorMessage }
      : structuredData,
    document_type: classification?.documentType ?? structuredData.document_type,
    confidence_score: classification?.confidenceScore ?? structuredData.confidence_score,
    detected_category: classification?.detectedCategory ?? null,
    user_category: classification?.userCategory ?? null,
    final_category: classification?.finalCategory ?? null,
    needs_review: classification?.needsReview ?? false,
    classification_reason: classification?.classificationReason ?? [],
    extraction_status: extractionStatus,
    ai_model: aiModel,
    schema_version: CLASSIFICATION_SCHEMA_VERSION,
    prompt_version: CLASSIFICATION_PROMPT_VERSION,
  };

  const { data, error } = await supabase
    .from("extracted_document_data")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Échec insertion Supabase : ${error.message}`);
  }

  console.log("[extract] db insert success", { id: data.id, dossierId, documentId });
  return data.id as string;
}

/**
 * Universal document extraction pipeline:
 * PDF → pdf-parse → classify → store classification → OpenAI extraction → Supabase
 */
export async function extractDocument(input: ExtractDocumentInput): Promise<ExtractDocumentResult> {
  const model = getModel();
  const supabase = getServerSupabaseUnscoped();

  console.log("[extract] start", {
    fileName: input.fileName,
    dossierId: input.dossierId,
    documentId: input.documentId,
  });
  console.log("[analysis] trigger requested", {
    pipeline: "extractDocument",
    fileName: input.fileName,
    documentId: input.documentId,
    note: "server-side typed extraction — classifier + optional invoice-extractor",
  });

  await updateDocumentExtractionStatus(supabase, input.documentId, "processing");

  if (!isPdf(input)) {
    const message = "Seuls les fichiers PDF sont pris en charge par l'extraction textuelle.";
    console.log("[extract] failed", { fileName: input.fileName, reason: message });

    const failedData = { ...EMPTY_EXTRACTION, summary: message };

    const id = await persistExtraction({
      supabase,
      dossierId: input.dossierId,
      documentId: input.documentId,
      rawText: "",
      structuredData: failedData,
      extractionStatus: "failed",
      aiModel: model,
      errorMessage: message,
    });

    await updateDocumentExtractionStatus(supabase, input.documentId, "failed");

    return {
      id,
      structuredData: failedData,
      documentType: "unknown",
      confidenceScore: 0,
      extractionStatus: "failed",
      aiModel: model,
      rawTextLength: 0,
      error: message,
    };
  }

  let classificationRowId: string | null = null;

  try {
    const rawText = await parsePdfText(input.fileBuffer);
    console.log("[extract] pdf parsed", {
      fileName: input.fileName,
      textLength: rawText.length,
    });

    if (!rawText) {
      throw new Error(
        "Aucun texte extractible dans le PDF (document scanné ou vide). Utilisez un PDF natif.",
      );
    }

    const aiRecommendation = await classifyDocument({ rawText });

    const resolved = resolveDocumentClassification({
      ai: aiRecommendation,
      userCategory: input.userCategory ?? null,
    });

    classificationRowId = await persistClassification({
      supabase,
      dossierId: input.dossierId,
      documentId: input.documentId,
      rawText,
      resolved,
      aiModel: model,
    });

    let structuredDataForStorage: Record<string, unknown>;
    let structuredData: UniversalExtractionSchema;

    if (resolved.documentType === "invoice") {
      const invoiceData = await extractInvoice({ rawText, fileName: input.fileName });
      structuredDataForStorage = invoiceData;
      structuredData = mapInvoiceToUniversal(invoiceData, resolved);
    } else {
      structuredData = await extractWithOpenAI(rawText, input.fileName, model);
      structuredDataForStorage = { ...structuredData };
    }

    await completeExtraction({
      supabase,
      rowId: classificationRowId,
      structuredData: structuredDataForStorage,
      extractionStatus: "completed",
    });

    await updateDocumentExtractionStatus(supabase, input.documentId, "completed");

    return {
      id: classificationRowId,
      structuredData,
      documentType: resolved.documentType,
      confidenceScore: resolved.confidenceScore,
      classification: resolved,
      extractionStatus: "completed",
      aiModel: model,
      rawTextLength: rawText.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction échouée.";
    console.log("[extract] failed", { fileName: input.fileName, reason: message });

    const failedData = { ...EMPTY_EXTRACTION, summary: message };

    let id = classificationRowId ?? "";
    try {
      if (classificationRowId) {
        await completeExtraction({
          supabase,
          rowId: classificationRowId,
          structuredData: failedData,
          extractionStatus: "failed",
          errorMessage: message,
        });
      } else {
        id = await persistExtraction({
          supabase,
          dossierId: input.dossierId,
          documentId: input.documentId,
          rawText: "",
          structuredData: failedData,
          extractionStatus: "failed",
          aiModel: model,
          errorMessage: message,
        });
      }
    } catch (persistErr) {
      console.error("[extract] db persist failed", persistErr);
    }

    await updateDocumentExtractionStatus(supabase, input.documentId, "failed");

    return {
      id,
      structuredData: failedData,
      documentType: "unknown",
      confidenceScore: 0,
      extractionStatus: "failed",
      aiModel: model,
      rawTextLength: 0,
      error: message,
    };
  }
}
