import type { ExtractDocumentResult } from "@/lib/ai/document-types";
import {
  isUserUploadCategory,
  mapLegacyDocumentCategory,
  type UserUploadCategory,
} from "@/lib/ai/document-classification-types";
import { supabase } from "@/lib/supabase";

export class ExtractionClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ExtractionClientError";
    this.status = status;
  }
}

export async function requestDocumentExtraction(params: {
  file: File;
  dossierId: string;
  documentId?: string | null;
  userCategory?: UserUploadCategory | string | null;
  legacyDocumentCategory?: string | null;
}): Promise<ExtractDocumentResult> {
  console.log("[analysis] trigger requested", {
    pipeline: "requestDocumentExtraction",
    fileName: params.file.name,
    documentId: params.documentId,
    dossierId: params.dossierId,
  });

  const resolvedUserCategory =
    (params.userCategory && isUserUploadCategory(params.userCategory)
      ? params.userCategory
      : null) ?? mapLegacyDocumentCategory(params.legacyDocumentCategory);

  const formData = new FormData();
  formData.append("file", params.file);
  formData.append("fileName", params.file.name);
  formData.append("dossierId", params.dossierId);
  if (params.documentId) {
    formData.append("documentId", params.documentId);
  }
  if (resolvedUserCategory) {
    formData.append("userCategory", resolvedUserCategory);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    formData.append("authToken", session.access_token);
  }

  const response = await fetch("/api/lmnp/extract", {
    method: "POST",
    body: formData,
  });

  const body = (await response.json()) as {
    result?: ExtractDocumentResult;
    error?: string;
  };

  if (!response.ok) {
    throw new ExtractionClientError(body.error ?? "Extraction échouée.", response.status);
  }

  if (!body.result) {
    throw new ExtractionClientError("Réponse extraction invalide.", 502);
  }

  return body.result;
}

export async function runBulkDocumentExtraction(params: {
  items: Array<{
    file: File;
    documentId?: string | null;
    label?: string;
    userCategory?: UserUploadCategory | null;
    legacyDocumentCategory?: string | null;
  }>;
  dossierId: string;
  onProgress?: (index: number, total: number, label: string) => void;
}): Promise<{ results: ExtractDocumentResult[]; succeeded: number; failed: number }> {
  const { items, dossierId, onProgress } = params;
  const results: ExtractDocumentResult[] = [];
  let succeeded = 0;
  let failed = 0;

  if (items.length === 0) {
    console.log("[analysis] no analyzable documents", {
      pipeline: "runBulkDocumentExtraction",
      reason: "empty items",
      dossierId,
    });
    return { results, succeeded, failed };
  }

  console.log("[analysis] bulk extraction start", {
    pipeline: "runBulkDocumentExtraction",
    itemCount: items.length,
    dossierId,
    labels: items.map((item) => item.label ?? item.file.name),
    note: "typed extraction path — calls /api/lmnp/extract (classifier + invoice-extractor)",
  });

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i, items.length, item.label ?? item.file.name);

    try {
      const result = await requestDocumentExtraction({
        file: item.file,
        dossierId,
        documentId: item.documentId,
        userCategory: item.userCategory,
        legacyDocumentCategory: item.legacyDocumentCategory,
      });
      results.push(result);
      if (result.extractionStatus === "completed") succeeded++;
      else failed++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : "Extraction échouée.";
      results.push({
        id: "",
        structuredData: {
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
          summary: message,
          confidence_score: 0,
        },
        documentType: "unknown",
        confidenceScore: 0,
        extractionStatus: "failed",
        aiModel: "",
        rawTextLength: 0,
        error: message,
      });
    }
  }

  console.log("[analysis] extraction completed", {
    pipeline: "runBulkDocumentExtraction",
    succeeded,
    failed,
    itemCount: items.length,
  });

  return { results, succeeded, failed };
}
