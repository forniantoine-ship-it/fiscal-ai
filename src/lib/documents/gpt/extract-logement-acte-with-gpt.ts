import OpenAI from "openai";

import {
  LOGEMENT_ACTE_JSON_SCHEMA,
  LOGEMENT_ACTE_SYSTEM_PROMPT,
  buildLogementActeUserPrompt,
} from "./prompts/logement-acte.prompt";
import {
  LogementActeExtractionSchema,
  normalizeLogementActeExtraction,
  type LogementActeExtraction,
} from "./schemas/logement-acte.schema";

const DEFAULT_MODEL = "gpt-4o-mini";

export type ExtractLogementActeWithGptInput = {
  rawText: string;
  fileName: string;
};

export type LogementActeGptExtractionResult = {
  success: boolean;
  extraction: LogementActeExtraction;
  error?: string;
  /** Temporary diagnostics — compare GPT raw vs normalized vs UI. */
  debug?: {
    rawGptJson: unknown;
    normalized: LogementActeExtraction;
  };
};

function getModel(): string {
  return (
    process.env.OPENAI_LOGEMENT_EXTRACTION_MODEL ??
    process.env.OPENAI_EXTRACTION_MODEL ??
    DEFAULT_MODEL
  );
}

function snapshotExtraction(extraction: LogementActeExtraction): Record<string, unknown> {
  return { ...extraction };
}

/**
 * GPT-first structured extraction for Logement / acte notarié documents.
 * Server-side only — call via /api/lmnp/logement/extract.
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

  const model = getModel();

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: LOGEMENT_ACTE_SYSTEM_PROMPT },
        { role: "user", content: buildLogementActeUserPrompt(input.rawText) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: LOGEMENT_ACTE_JSON_SCHEMA,
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content?.trim()) {
      console.log("[logement-gpt] extraction failed", { reason: "empty_response" });
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
      console.log("[logement-gpt] extraction failed", { reason: "invalid_json" });
      return {
        success: false,
        extraction: {},
        error: "Réponse JSON invalide du modèle OpenAI.",
      };
    }

    console.log("[logement-debug-gpt-raw]", {
      fileName: input.fileName,
      rawGptJson: rawResponse,
    });

    const validation = LogementActeExtractionSchema.safeParse(rawResponse);
    if (!validation.success) {
      console.log("[logement-gpt] extraction failed", {
        reason: "schema_validation",
        issues: validation.error.issues.map((issue) => issue.message),
      });
      return {
        success: false,
        extraction: {},
        error: "GPT response failed schema validation",
        debug: { rawGptJson: rawResponse, normalized: {} },
      };
    }

    const extraction = normalizeLogementActeExtraction(validation.data);
    console.log("[logement-debug-normalized]", {
      fileName: input.fileName,
      normalized: extraction,
    });
    const fieldCount = Object.keys(extraction).length;

    console.log("[logement-gpt] parsed fields snapshot", snapshotExtraction(extraction));
    console.log("[logement-gpt] extraction complete", {
      fileName: input.fileName,
      model,
      fieldCount,
      fields: Object.keys(extraction),
    });

    if (fieldCount === 0) {
      return {
        success: false,
        extraction: {},
        error: "Aucun champ extrait.",
      };
    }

    return {
      success: true,
      extraction,
      debug: { rawGptJson: rawResponse, normalized: extraction },
    };
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
