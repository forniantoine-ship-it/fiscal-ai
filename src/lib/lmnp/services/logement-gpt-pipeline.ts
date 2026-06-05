import {
  countLogementSemanticFields,
  type LogementActeGptExtractionResult,
} from "@/lib/documents/gpt/extract-logement-acte-with-gpt";
import { detectInvalidCorpus } from "@/lib/documents/ocr/invalid-corpus-detection";
import { normalizeOcrText } from "@/lib/documents/normalizers";
import {
  DocumentOcrFailedError,
  resolveDocumentTextOrThrow,
  type ResolveDocumentTextResult,
} from "@/lib/documents/ocr";
import type { LmnpDocument } from "@/lib/lmnp/types";

import { computeLogementDocumentDensity } from "./logement/logement-document-density";
import { resolveLogementDocumentIntent } from "./logement/logement-document-intent";
import { logLogementPipelineDebug } from "./logement/logement-pipeline-trace";
import type { LogementSemanticNormalizationResult } from "./logement/logement-semantic-normalization";
import { runLogementVisionFallback } from "./logement/logement-vision-fallback-pipeline";
import { logVisionFallbackCheckpoint } from "./logement/vision-fallback-trace";
import { resolveVisionFallback } from "./logement/vision-fallback-resolver";
import {
  buildLogementOcrDebugTrace,
  logLogementOcrPreview,
  type LogementOcrDebugTrace,
} from "./logement-extraction-debug";
import { requestLogementGptExtraction } from "./logement-gpt-extract-client";
import { resolveDocumentFile } from "./resolve-document-file";

export { DocumentOcrFailedError };

export type LogementGptPipelineResult = {
  documentId: string;
  fileName: string;
  rawText: string;
  ocrProvider: string;
  ocrDebug: LogementOcrDebugTrace;
  extraction: LogementActeGptExtractionResult;
  semantic?: LogementSemanticNormalizationResult;
  visionFallbackActivated?: boolean;
  visionFallbackReason?: string | null;
};

export type RunLogementGptPipelineParams = {
  document: LmnpDocument;
  getFile: (documentId: string) => File | undefined;
  fiscalYear?: number;
};

function emptyOcrDebug(document: LmnpDocument): LogementOcrDebugTrace {
  return {
    documentId: document.id,
    fileName: document.fileName,
    preview: "",
    newlineCount: 0,
    pageCount: 0,
    provider: "vision_ocr",
    strategy: "vision_ocr",
    ocrSource: "unknown",
    fallbackReason: null,
    fallbackActivated: false,
    partialTextRecovery: false,
    semanticRecoveryEligible: false,
    textLength: 0,
    charsPerPage: 0,
    alphaRatio: 0,
    digitRatio: 0,
    strategiesAttempted: [],
  };
}

/**
 * Logement pipeline: cheap OCR/text path first, controlled Vision fallback on validated failure.
 */
export async function runLogementGptPipeline(
  params: RunLogementGptPipelineParams,
): Promise<LogementGptPipelineResult> {
  const { document, getFile } = params;

  const file = await resolveDocumentFile(document, getFile);

  let ocrResult: ResolveDocumentTextResult | undefined;
  let ocrFailure: DocumentOcrFailedError | undefined;
  let rawText = "";

  try {
    ocrResult = await resolveDocumentTextOrThrow(file);
    rawText = normalizeOcrText(ocrResult.rawText);
  } catch (err) {
    if (err instanceof DocumentOcrFailedError) {
      ocrFailure = err;
    } else {
      throw err;
    }
  }

  const invalidCorpusDetection = rawText ? detectInvalidCorpus(rawText) : { invalidCorpusDetected: false, rejectionReason: null };
  const invalidCorpusDetected =
    invalidCorpusDetection.invalidCorpusDetected || Boolean(ocrFailure);

  const ocrDebug = ocrResult
    ? buildLogementOcrDebugTrace({
        documentId: document.id,
        fileName: document.fileName,
        rawText,
        ocrResult,
      })
    : emptyOcrDebug(document);

  if (ocrResult) {
    logLogementOcrPreview(ocrDebug);
  }

  logLogementPipelineDebug("corpus_resolved", {
    documentId: document.id,
    fileName: document.fileName,
    extractedTextLength: rawText.length,
    extractionStrategy: ocrResult?.strategy ?? "hard_failure",
    partialRecoveryUsed: ocrResult?.partialTextRecovery ?? false,
    invalidCorpusDetected,
    invalidCorpusReason: invalidCorpusDetection.rejectionReason,
    ocrFailureReason: ocrFailure?.message ?? null,
    ocrProvider: ocrResult?.provider ?? null,
    pageCount: ocrResult?.pageCount ?? 0,
    first1000Chars: rawText.slice(0, 1000),
    fullCorpus: rawText,
  });

  const intentResolution = resolveLogementDocumentIntent({
    fileName: document.fileName,
    rawText,
  });

  logLogementPipelineDebug("intent_resolved", {
    documentId: document.id,
    fileName: document.fileName,
    detectedIntent: intentResolution.intent,
    confidence: intentResolution.confidence,
    matchedKeywords: intentResolution.signals,
  });

  const density = computeLogementDocumentDensity(rawText, document.fileName);

  let extraction: LogementActeGptExtractionResult = {
    success: false,
    extraction: {},
    error: ocrFailure?.message,
  };

  const textPathCorpusUsable = rawText.trim().length > 0 && !invalidCorpusDetection.invalidCorpusDetected;

  if (textPathCorpusUsable) {
    extraction = await requestLogementGptExtraction({
      rawText,
      fileName: document.fileName,
    });

    logLogementPipelineDebug("gpt_raw_response", {
      documentId: document.id,
      fileName: document.fileName,
      observedAt: "client_after_api_response",
      extractionPath: "text",
      extractionSuccess: extraction.success,
      extractionError: extraction.error ?? null,
      legacyExtractionKeys: Object.keys(extraction.extraction),
      semanticNormalizedFields: extraction.semantic?.normalizedCanonicalFields ?? null,
    });
  }

  const semanticFieldCount = countLogementSemanticFields(extraction);

  const fallbackDecision = resolveVisionFallback({
    fileName: document.fileName,
    documentIntent: intentResolution.intent,
    invalidCorpusDetected,
    ocrFailureReason: ocrFailure?.message ?? null,
    extractedTextLength: rawText.length,
    semanticExtractionSuccess: extraction.success,
    semanticNormalizedFieldCount: semanticFieldCount,
    ocrQualityAcceptable: ocrResult?.ok,
    alphaRatio: ocrResult?.quality.alphaRatio,
    density,
    ...density,
  });

  let visionFallbackActivated = false;
  let visionFallbackReason: string | null = null;

  if (fallbackDecision.activate) {
    visionFallbackActivated = true;
    visionFallbackReason = fallbackDecision.activationReason;

    logVisionFallbackCheckpoint("vision_fallback_activated", {
      activationReason: visionFallbackReason,
      documentIntent: intentResolution.intent,
      OCRFailureReason: ocrFailure?.message ?? null,
      extractedTextLength: rawText.length,
      invalidCorpusDetected,
      documentId: document.id,
      fileName: document.fileName,
      phase: "pipeline_execution_start",
    });

    console.error("PIPELINE_VISION_FALLBACK_START", visionFallbackReason ?? "vision_fallback");
    extraction = await runLogementVisionFallback({
      file,
      fileName: document.fileName,
      intentResolution,
      activationReason: visionFallbackReason ?? "vision_fallback",
      ocrFailureReason: ocrFailure?.message,
    });
    console.error("PIPELINE_VISION_FALLBACK_DONE", extraction.success);
  }

  if (!extraction.success && ocrFailure && !visionFallbackActivated) {
    throw ocrFailure;
  }

  if (!extraction.success && visionFallbackActivated) {
    logVisionFallbackCheckpoint("final_prefill_after_vision", {
      phase: "pipeline_exhausted_before_ui",
      visionExtractionSucceeded: false,
      extractionError: extraction.error ?? null,
      extractionKeys: Object.keys(extraction.extraction),
      documentId: document.id,
      fileName: document.fileName,
    });
  }

  console.error("PIPELINE_RESULT_VISION_FLAG", visionFallbackActivated);
  console.error("TYPE_PIPELINE_RESULT_VISION_FLAG", typeof visionFallbackActivated);
  console.error("PIPELINE_RESULT_VISION_REASON", visionFallbackReason ?? "null");
  console.error("PIPELINE_RESULT_EXTRACTION_SUCCESS", extraction.success);

  return {
    documentId: document.id,
    fileName: document.fileName,
    rawText,
    ocrProvider: ocrResult?.provider ?? (visionFallbackActivated ? "vision_multimodal" : "unknown"),
    ocrDebug,
    extraction,
    semantic: extraction.semantic,
    visionFallbackActivated,
    visionFallbackReason,
  };
}
