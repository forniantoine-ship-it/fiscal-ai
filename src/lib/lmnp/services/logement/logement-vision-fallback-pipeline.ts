import type { LogementActeGptExtractionResult } from "@/lib/documents/gpt/extract-logement-acte-with-gpt";
import { parseVisionGptResponse } from "@/lib/documents/gpt/parse-vision-gpt-response";
import {
  fileToRasterImages,
  VISION_FALLBACK_RENDER_SCALE,
} from "@/lib/documents/ocr/pdf-to-images";
import { CANONICAL_FIELD_KEYS_BY_INTENT } from "@/lib/lmnp/services/logement/logement-canonical-schema";
import type { LogementIntentResolution } from "@/lib/lmnp/services/logement/logement-document-intent";
import { extractCanonicalFieldsBeforeNormalization } from "@/lib/lmnp/services/logement/logement-pipeline-trace";
import {
  logRenderedPagesCheckpoint,
  logVisionFallbackCheckpoint,
  serializeVisionDebugJson,
} from "@/lib/lmnp/services/logement/vision-fallback-trace";

import { requestLogementVisionExtraction } from "../logement-vision-extract-client";

export type RunLogementVisionFallbackParams = {
  file: File;
  fileName: string;
  intentResolution: LogementIntentResolution;
  activationReason: string;
  ocrFailureReason?: string | null;
};

/**
 * Client-side Vision fallback: high-DPI render → multimodal canonical GPT extraction.
 */
export async function runLogementVisionFallback(
  params: RunLogementVisionFallbackParams,
): Promise<LogementActeGptExtractionResult> {
  const renderScale = VISION_FALLBACK_RENDER_SCALE;
  const intent = params.intentResolution.intent;

  const images = await fileToRasterImages(params.file, {
    scale: renderScale,
    visionEnhance: true,
  });

  logRenderedPagesCheckpoint(images, {
    fileName: params.fileName,
    activationReason: params.activationReason,
    renderResolution: renderScale,
  });

  const multimodalPayloadSize = images.reduce((sum, img) => sum + img.base64.length, 0);

  logVisionFallbackCheckpoint("multimodal_request", {
    phase: "client_before_api",
    pageCount: images.length,
    payloadSize: multimodalPayloadSize,
    canonicalSchemaExpected: [...CANONICAL_FIELD_KEYS_BY_INTENT[intent]],
    promptIntent: intent,
    fileName: params.fileName,
    activationReason: params.activationReason,
    renderResolution: renderScale,
  });

  const result = await requestLogementVisionExtraction({
    images,
    fileName: params.fileName,
    intent: params.intentResolution.intent,
    intentConfidence: params.intentResolution.confidence,
    intentSignals: params.intentResolution.signals,
    renderScale,
    activationReason: params.activationReason,
  });

  const rawGptJson = result.debug?.rawGptJson;
  const parsedRawGptJson = rawGptJson ? parseVisionGptResponse(rawGptJson).parsed : null;
  const extractedCanonicalFields = parsedRawGptJson
    ? extractCanonicalFieldsBeforeNormalization(parsedRawGptJson)
    : {};

  console.error("PIPELINE_RESULT_VISION_FLAG_visionFallback", true);
  console.error("TYPE_PIPELINE_RESULT_VISION_FLAG_visionFallback", "boolean");
  console.error("PIPELINE_VISION_FALLBACK_EXTRACTION_SUCCESS", result.success);

  logVisionFallbackCheckpoint("multimodal_raw_response", {
    phase: "client_after_api",
    fileName: params.fileName,
    extractionSuccess: result.success,
    extractionError: result.error ?? null,
    rawGptResponse: rawGptJson != null ? serializeVisionDebugJson(rawGptJson) : null,
    parseErrors: rawGptJson == null ? ["no_debug_rawGptJson_in_api_response"] : null,
    extractedCanonicalFields,
    topLevelKeys:
      rawGptJson && typeof rawGptJson === "object" ? Object.keys(rawGptJson as object) : [],
    legacyExtractionKeys: Object.keys(result.extraction),
    semanticNormalizedFieldCount: Object.keys(
      result.semantic?.normalizedCanonicalFields ?? {},
    ).length,
  });

  return result;
}
