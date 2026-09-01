import OpenAI from "openai";

import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";
import { CANONICAL_FIELD_KEYS_BY_INTENT } from "@/lib/lmnp/services/logement/logement-canonical-schema";
import type { LogementIntentResolution } from "@/lib/lmnp/services/logement/logement-document-intent";
import {
  extractCanonicalFieldsBeforeNormalization,
  logLogementPipelineDebug,
} from "@/lib/lmnp/services/logement/logement-pipeline-trace";
import {
  logVisionFallbackCheckpoint,
  serializeVisionDebugJson,
} from "@/lib/lmnp/services/logement/vision-fallback-trace";

import { extractLogementVisionOcrIntermediate } from "./extract-logement-vision-ocr-intermediate";
import { logVisionResponseParseDebug, parseVisionGptResponse } from "./parse-vision-gpt-response";
import { processLogementCanonicalGptJson } from "./logement-canonical-gpt-processor";
import {
  buildLogementCanonicalVisionSystemPrompt,
  buildLogementCanonicalVisionUserPrompt,
} from "./prompts/logement-canonical.prompt";
import { buildLogementCanonicalJsonSchema } from "./schemas/logement-canonical-extraction.schema";
import type { LogementActeGptExtractionResult } from "./extract-logement-acte-with-gpt";
import {
  deriveVisionConfidenceByField,
  logVisionExtractionConfidenceDebug,
  summarizeOcrIntermediate,
} from "./vision-extraction-confidence-debug";

const DEFAULT_VISION_MODEL = "gpt-4o-mini";

export type ExtractLogementCanonicalWithVisionInput = {
  images: RasterPageImage[];
  fileName: string;
  intentResolution: LogementIntentResolution;
  renderScale: number;
  activationReason: string;
};

function getVisionModel(): string {
  return (
    process.env.OPENAI_LOGEMENT_VISION_MODEL ??
    process.env.OPENAI_LOGEMENT_EXTRACTION_MODEL ??
    process.env.OPENAI_EXTRACTION_MODEL ??
    DEFAULT_VISION_MODEL
  );
}

function estimateMultimodalPayloadSize(images: RasterPageImage[]): number {
  return images.reduce((sum, img) => sum + img.base64.length, 0);
}

function buildImageParts(images: RasterPageImage[]) {
  return images.map((img) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:${img.mimeType};base64,${img.base64}`,
      detail: "high" as const,
    },
  }));
}

/**
 * GPT Vision multimodal canonical extraction for logement narrative documents.
 * Phase 1: OCR intermediate → Phase 2: canonical mapping (same images + OCR context).
 */
export async function extractLogementCanonicalWithVision(
  input: ExtractLogementCanonicalWithVisionInput,
): Promise<LogementActeGptExtractionResult> {
  const intent = input.intentResolution.intent;
  const model = getVisionModel();
  const multimodalPayloadSize = estimateMultimodalPayloadSize(input.images);

  logVisionFallbackCheckpoint("multimodal_request", {
    phase: "server_before_openai",
    model,
    pageCount: input.images.length,
    payloadSize: multimodalPayloadSize,
    canonicalSchemaExpected: [...CANONICAL_FIELD_KEYS_BY_INTENT[intent]],
    promptIntent: intent,
    fileName: input.fileName,
    activationReason: input.activationReason,
    renderResolution: input.renderScale,
    visionPipeline: "ocr_intermediate_then_canonical",
  });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      extraction: {},
      error: "OPENAI_API_KEY non configurée.",
    };
  }

  const ocrIntermediate = await extractLogementVisionOcrIntermediate({
    images: input.images,
    fileName: input.fileName,
    intent: intent,
  });

  const ocrSummary = ocrIntermediate ? summarizeOcrIntermediate(ocrIntermediate) : null;

  const systemPrompt = buildLogementCanonicalVisionSystemPrompt(intent);
  const userText = buildLogementCanonicalVisionUserPrompt(
    intent,
    input.images.length,
    ocrIntermediate ?? undefined,
  );
  const jsonSchema = buildLogementCanonicalJsonSchema(intent);

  logLogementPipelineDebug("gpt_request", {
    fileName: input.fileName,
    model,
    extractionPath: "vision_multimodal",
    promptIntent: intent,
    schemaKeysExpected: [...CANONICAL_FIELD_KEYS_BY_INTENT[intent]],
    renderedPagesCount: input.images.length,
    multimodalPayloadSize,
    systemPromptLength: systemPrompt.length,
    ocrIntermediateAvailable: Boolean(ocrIntermediate),
    ocrVisibleTextLength: ocrSummary?.extractedVisibleTextLength ?? 0,
  });

  const imageParts = buildImageParts(input.images);

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [{ type: "text", text: userText }, ...imageParts],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: jsonSchema,
      },
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const rawJsonString = content.trim();

    if (!rawJsonString) {
      logVisionFallbackCheckpoint("multimodal_raw_response", {
        phase: "server_after_openai",
        fileName: input.fileName,
        rawGptResponse: null,
        parseErrors: ["empty_vision_response"],
        extractedCanonicalFields: {},
        topLevelKeys: [],
      });
      return {
        success: false,
        extraction: {},
        error: "Réponse vision vide du modèle OpenAI.",
      };
    }

    const { parsed: rawResponse, diagnostics: visionParseDiagnostics } =
      parseVisionGptResponse(rawJsonString);
    logVisionResponseParseDebug(visionParseDiagnostics);

    if (!visionParseDiagnostics.parseSucceeded) {
      return {
        success: false,
        extraction: {},
        error: visionParseDiagnostics.parseError ?? "Vision response parse failed",
      };
    }

    if (
      visionParseDiagnostics.finalPayloadType !== "object" ||
      visionParseDiagnostics.canonicalFieldsStillString
    ) {
      return {
        success: false,
        extraction: {},
        error: "Vision payload non déroulé — canonicalFields n'est pas un objet.",
      };
    }

    const extractedCanonicalFields = extractCanonicalFieldsBeforeNormalization(rawResponse);
    const topLevelKeys =
      rawResponse && typeof rawResponse === "object" ? Object.keys(rawResponse as object) : [];

    const rawRecord =
      rawResponse && typeof rawResponse === "object"
        ? (rawResponse as Record<string, unknown>)
        : {};
    const canonicalFields =
      rawRecord.canonicalFields && typeof rawRecord.canonicalFields === "object"
        ? (rawRecord.canonicalFields as Record<string, unknown>)
        : {};
    const rawDocumentTerms = Array.isArray(rawRecord.rawDocumentTerms)
      ? (rawRecord.rawDocumentTerms as Array<{
          term: string;
          value?: string | null;
          mappedField?: string | null;
        }>)
      : undefined;

    logVisionExtractionConfidenceDebug({
      phase: "canonical_final",
      fileName: input.fileName,
      extractedVisibleTextLength: ocrSummary?.extractedVisibleTextLength ?? 0,
      visibleKeyValuePairs: ocrSummary?.visibleKeyValuePairs ?? [],
      extractedAmountCandidates: ocrSummary?.extractedAmountCandidates ?? [],
      rawTextBlockCount: ocrSummary?.rawTextBlockCount ?? 0,
      visionConfidenceByField: deriveVisionConfidenceByField({
        canonicalFields,
        rawDocumentTerms,
        ocr: ocrIntermediate ?? undefined,
      }),
    });

    logVisionFallbackCheckpoint("multimodal_raw_response", {
      phase: "server_after_openai",
      fileName: input.fileName,
      model,
      rawGptResponse: rawJsonString,
      parseErrors: null,
      extractedCanonicalFields,
      topLevelKeys,
      serializedRawGptJson: serializeVisionDebugJson(rawResponse),
      ocrIntermediateUsed: Boolean(ocrIntermediate),
    });

    const result = processLogementCanonicalGptJson({
      rawResponse,
      fileName: input.fileName,
      intentResolution: input.intentResolution,
      extractionSource: "vision",
    });

    const recoveredFields = result.success
      ? Object.keys(result.semantic?.normalizedCanonicalFields ?? result.extraction)
      : [];

    logVisionFallbackCheckpoint("canonical_processing_after_vision", {
      phase: "server_post_processing_summary",
      fileName: input.fileName,
      extractionSuccess: result.success,
      visionFallbackRecoveredFields: recoveredFields,
      legacyExtractionKeys: Object.keys(result.extraction),
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vision extraction failed";
    logVisionFallbackCheckpoint("multimodal_raw_response", {
      phase: "server_openai_error",
      fileName: input.fileName,
      rawGptResponse: null,
      parseErrors: [message],
      extractedCanonicalFields: {},
      topLevelKeys: [],
    });
    return {
      success: false,
      extraction: {},
      error: message,
    };
  }
}
