import type { LogementActeGptExtractionResult } from "@/lib/documents/gpt/extract-logement-acte-with-gpt";
import type { ResolveDocumentTextResult } from "@/lib/documents/ocr/resolve-document-text";
import type { LogementFormValues } from "@/lib/lmnp/services/logement-profile";
import type { PropertyBackgroundExtraction } from "@/lib/lmnp/types";

const OCR_PREVIEW_LENGTH = 3_000;

export type LogementOcrSource =
  | "pdf_text"
  | "vision"
  | "vision_preprocessed"
  | "hybrid"
  | "partial_semantic"
  | "unknown";

export type LogementOcrDebugTrace = {
  documentId: string;
  fileName: string;
  preview: string;
  newlineCount: number;
  pageCount: number;
  provider: string;
  strategy: string;
  ocrSource: LogementOcrSource;
  fallbackReason: string | null;
  fallbackActivated: boolean;
  partialTextRecovery: boolean;
  semanticRecoveryEligible: boolean;
  textLength: number;
  charsPerPage: number;
  alphaRatio: number;
  digitRatio: number;
  strategiesAttempted: string[];
};

export type LogementDisplaySource =
  | "localState"
  | "pendingPrefill"
  | "workspaceSnapshot"
  | "empty";

export function resolveLogementOcrSource(
  ocrResult: Pick<
    ResolveDocumentTextResult,
    "provider" | "fallbackReason" | "strategy" | "partialTextRecovery"
  >,
): LogementOcrSource {
  if (ocrResult.strategy === "partial_semantic_recovery" || ocrResult.partialTextRecovery) {
    return "partial_semantic";
  }
  if (ocrResult.provider === "pdf_text") return "pdf_text";
  if (ocrResult.provider === "vision_ocr_preprocessed") return "vision_preprocessed";
  if (ocrResult.fallbackReason?.startsWith("native_pdf")) return "hybrid";
  if (ocrResult.provider === "vision_ocr") return "vision";
  return "unknown";
}

export function buildLogementOcrDebugTrace(params: {
  documentId: string;
  fileName: string;
  rawText: string;
  ocrResult: ResolveDocumentTextResult;
}): LogementOcrDebugTrace {
  const preview = params.rawText.slice(0, OCR_PREVIEW_LENGTH);
  return {
    documentId: params.documentId,
    fileName: params.fileName,
    preview,
    newlineCount: (params.rawText.match(/\n/g) ?? []).length,
    pageCount: params.ocrResult.pageCount,
    provider: params.ocrResult.provider,
    strategy: params.ocrResult.strategy,
    ocrSource: resolveLogementOcrSource(params.ocrResult),
    fallbackReason: params.ocrResult.fallbackReason ?? null,
    fallbackActivated: params.ocrResult.fallbackActivated,
    partialTextRecovery: params.ocrResult.partialTextRecovery,
    semanticRecoveryEligible: params.ocrResult.semanticRecoveryEligible,
    textLength: params.rawText.length,
    charsPerPage: params.ocrResult.density.charsPerPage,
    alphaRatio: params.ocrResult.quality.alphaRatio,
    digitRatio: params.ocrResult.quality.digitRatio,
    strategiesAttempted: params.ocrResult.strategiesAttempted,
  };
}

export function logLogementOcrPreview(trace: LogementOcrDebugTrace): void {
  console.log("[logement-debug-ocr-preview]", trace);
}

export function logLogementWorkspaceSnapshot(params: {
  documentId: string;
  phase?: string;
  logementWorkspaceForm?: LogementFormValues;
  pendingFormPrefill: LogementFormValues | null;
  localFormValues: LogementFormValues;
  propertyBackgroundExtraction?: PropertyBackgroundExtraction;
  governedLogementFields?: Record<string, unknown>;
  governedCreditFields?: Record<string, unknown>;
  prefillChangedFields?: string[];
  gptNormalized?: Record<string, unknown>;
}): void {
  console.log("[logement-debug-workspace-snapshot]", params);
}

export function logLogementDisplayResolution(params: {
  documentId?: string;
  source: LogementDisplaySource;
  localFormValues: LogementFormValues;
  pendingFormPrefill: LogementFormValues | null;
  workspaceSnapshot?: LogementFormValues;
  displayedFormValues: LogementFormValues;
}): void {
  console.log("[logement-debug-display-resolution]", params);
}

export function logLogementUploadTrace(params: {
  documentId: string;
  fileName: string;
  ocr: LogementOcrDebugTrace;
  extraction: LogementActeGptExtractionResult;
}): void {
  console.log("[logement-debug-upload-trace]", {
    documentId: params.documentId,
    fileName: params.fileName,
    ocr: params.ocr,
    gptRaw: params.extraction.debug?.rawGptJson ?? null,
    normalized: params.extraction.debug?.normalized ?? params.extraction.extraction,
    success: params.extraction.success,
    error: params.extraction.error ?? null,
  });
}
