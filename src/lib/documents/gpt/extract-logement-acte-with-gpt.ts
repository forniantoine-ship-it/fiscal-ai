import OpenAI from "openai";

import { CANONICAL_FIELD_KEYS_BY_INTENT } from "@/lib/lmnp/services/logement/logement-canonical-schema";
import { resolveLogementDocumentIntent } from "@/lib/lmnp/services/logement/logement-document-intent";
import {
  logLogementPipelineDebug,
  logLogementPipelineDebugFull,
} from "@/lib/lmnp/services/logement/logement-pipeline-trace";
import type { LogementSemanticNormalizationResult } from "@/lib/lmnp/services/logement/logement-semantic-normalization";

import { processLogementCanonicalGptJson } from "./logement-canonical-gpt-processor";
import {
  buildLogementCanonicalSystemPrompt,
  buildLogementCanonicalUserPrompt,
} from "./prompts/logement-canonical.prompt";
import { buildLogementCanonicalJsonSchema } from "./schemas/logement-canonical-extraction.schema";
import type { LogementActeExtraction } from "./schemas/logement-acte.schema";

const DEFAULT_MODEL = "gpt-4o-mini";

export type ExtractLogementActeWithGptInput = {
  rawText: string;
  fileName: string;
};

export type LogementActeGptExtractionResult = {
  success: boolean;
  extraction: LogementActeExtraction;
  error?: string;
  semantic?: LogementSemanticNormalizationResult;
  debug?: {
    rawGptJson: unknown;
    normalized: LogementActeExtraction;
    semantic?: LogementSemanticNormalizationResult;
  };
};

function getModel(): string {
  return (
    process.env.OPENAI_LOGEMENT_EXTRACTION_MODEL ??
    process.env.OPENAI_EXTRACTION_MODEL ??
    DEFAULT_MODEL
  );
}

/**
 * GPT text-path structured extraction for Logement documents.
 * Flow: intent resolution → canonical schema fill → semantic normalization → legacy bridge.
 */
export async function extractLogementActeWithGpt(
  input: ExtractLogementActeWithGptInput,
): Promise<LogementActeGptExtractionResult> {
  console.log("[logement-gpt] extraction start", {
    fileName: input.fileName,
    textLength: input.rawText.length,
  });

  if (!input.rawText.trim()) {
    console.log("[logement-gpt] extraction failed", { reason: "empty_ocr_text" });
    return {
      success: false,
      extraction: {},
      error: "OCR text is empty",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("[logement-gpt] extraction failed", { reason: "missing_api_key" });
    return {
      success: false,
      extraction: {},
      error: "OPENAI_API_KEY non configurée.",
    };
  }

  const intentResolution = resolveLogementDocumentIntent({
    fileName: input.fileName,
    rawText: input.rawText,
  });
  const intent = intentResolution.intent;
  const model = getModel();

  logLogementPipelineDebug("intent_resolved", {
    fileName: input.fileName,
    detectedIntent: intentResolution.intent,
    confidence: intentResolution.confidence,
    matchedKeywords: intentResolution.signals,
    resolvedAt: "gpt_extractor",
  });

  const systemPrompt = buildLogementCanonicalSystemPrompt(intent);
  const userPrompt = buildLogementCanonicalUserPrompt(input.rawText, intent);
  const jsonSchema = buildLogementCanonicalJsonSchema(intent);

  logLogementPipelineDebug("gpt_request", {
    fileName: input.fileName,
    model,
    extractionPath: "text",
    promptIntent: intent,
    schemaKeysExpected: [...CANONICAL_FIELD_KEYS_BY_INTENT[intent]],
    corpusLength: input.rawText.length,
    systemPromptLength: systemPrompt.length,
    userPromptLength: userPrompt.length,
    systemPrompt,
    userPrompt,
    jsonSchema,
  });

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: jsonSchema,
      },
    });

    const content = completion.choices[0]?.message?.content;

    logLogementPipelineDebugFull("gpt_raw_response", {
      fileName: input.fileName,
      model,
      extractionPath: "text",
      promptIntent: intent,
      responseContentLength: content?.length ?? 0,
      responseContentEmpty: !content?.trim(),
      rawGptResponse: content ?? null,
      completionId: completion.id,
      finishReason: completion.choices[0]?.finish_reason ?? null,
      usage: completion.usage ?? null,
    });

    if (!content?.trim()) {
      return {
        success: false,
        extraction: {},
        error: "Réponse vide du modèle OpenAI.",
      };
    }

    let rawResponse: unknown;
    try {
      rawResponse = JSON.parse(content) as unknown;
    } catch {
      return {
        success: false,
        extraction: {},
        error: "Réponse JSON invalide du modèle OpenAI.",
      };
    }

    logLogementPipelineDebugFull("gpt_raw_response", {
      fileName: input.fileName,
      extractionPath: "text",
      jsonParseFailed: false,
      rawGptJson: rawResponse,
      rawGptResponse: content,
    });

    return processLogementCanonicalGptJson({
      rawResponse,
      fileName: input.fileName,
      intentResolution,
      extractionSource: "text",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "GPT extraction failed";
    console.log("[logement-gpt] extraction failed", {
      fileName: input.fileName,
      reason: message,
    });
    return {
      success: false,
      extraction: {},
      error: message,
    };
  }
}

export function countLogementSemanticFields(result: LogementActeGptExtractionResult): number {
  const canonical = result.semantic?.normalizedCanonicalFields as Record<string, unknown> | undefined;
  if (canonical) {
    return Object.keys(canonical).filter((key) => canonical[key] !== undefined).length;
  }
  return Object.keys(result.extraction).length;
}
