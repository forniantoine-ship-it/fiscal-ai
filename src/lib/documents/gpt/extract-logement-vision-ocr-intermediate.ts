import OpenAI from "openai";

import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";
import type { LogementDocumentIntent } from "@/lib/lmnp/services/logement/logement-document-intent";

import {
  buildLogementVisionOcrSystemPrompt,
  buildLogementVisionOcrUserPrompt,
} from "./prompts/logement-vision-ocr.prompt";
import {
  buildLogementVisionOcrIntermediateJsonSchema,
  LogementVisionOcrIntermediateSchema,
  type LogementVisionOcrIntermediate,
} from "./schemas/logement-vision-ocr-intermediate.schema";
import {
  logVisionExtractionConfidenceDebug,
  summarizeOcrIntermediate,
} from "./vision-extraction-confidence-debug";

const DEFAULT_VISION_MODEL = "gpt-4o-mini";

function getVisionModel(): string {
  return (
    process.env.OPENAI_LOGEMENT_VISION_MODEL ??
    process.env.OPENAI_LOGEMENT_EXTRACTION_MODEL ??
    process.env.OPENAI_EXTRACTION_MODEL ??
    DEFAULT_VISION_MODEL
  );
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
 * Phase 1 — OCR-first Vision pass: raw text blocks, key-value and amount candidates.
 */
export async function extractLogementVisionOcrIntermediate(params: {
  images: RasterPageImage[];
  fileName: string;
  intent: LogementDocumentIntent;
}): Promise<LogementVisionOcrIntermediate | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = getVisionModel();
  const systemPrompt = buildLogementVisionOcrSystemPrompt(params.intent);
  const userText = buildLogementVisionOcrUserPrompt(params.intent, params.images.length);

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [{ type: "text", text: userText }, ...buildImageParts(params.images)],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: buildLogementVisionOcrIntermediateJsonSchema(),
      },
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content) as unknown;
    const validation = LogementVisionOcrIntermediateSchema.safeParse(parsed);
    if (!validation.success) {
      console.log("[vision-extraction-confidence-debug]", {
        phase: "ocr_intermediate",
        fileName: params.fileName,
        ocrSchemaValidationFailed: true,
        issues: validation.error.issues,
      });
      return null;
    }

    const summary = summarizeOcrIntermediate(validation.data);
    logVisionExtractionConfidenceDebug({
      phase: "ocr_intermediate",
      fileName: params.fileName,
      ...summary,
    });

    return validation.data;
  } catch (err) {
    console.log("[vision-extraction-confidence-debug]", {
      phase: "ocr_intermediate",
      fileName: params.fileName,
      ocrPhaseFailed: true,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
