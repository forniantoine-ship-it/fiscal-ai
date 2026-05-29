import OpenAI from "openai";

import {
  buildActiviteInpiSystemPrompt,
  buildActiviteInpiUserPrompt,
  ACTIVITE_INPI_GPT_JSON_SCHEMA,
} from "./prompts/activite-inpi.prompt";
import {
  activiteInpiGptResponseSchema,
  listMissingActiviteFields,
  normalizeActiviteInpiGptResponse,
  toActiviteInpiGptData,
  type ActiviteGptExtractionResult,
} from "./schemas/activite-inpi.schema";

const DEFAULT_MODEL = "gpt-4o-mini";

export type ExtractActiviteWithGptInput = {
  rawText: string;
  fileName: string;
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
    process.env.OPENAI_ACTIVITE_EXTRACTION_MODEL ??
    process.env.OPENAI_EXTRACTION_MODEL ??
    process.env.OPENAI_OCR_MODEL ??
    DEFAULT_MODEL
  );
}

/**
 * GPT-first structured extraction for Activité / INPI documents.
 * Server-side only — call via /api/lmnp/activite/extract.
 */
export async function extractActiviteWithGpt(
  input: ExtractActiviteWithGptInput,
): Promise<ActiviteGptExtractionResult> {
  console.log("[gpt-extraction] start", {
    fileName: input.fileName,
    textLength: input.rawText.length,
  });

  if (!input.rawText.trim()) {
    console.log("[gpt-extraction] failed", { reason: "empty_ocr_text" });
    return {
      success: false,
      data: {},
      reasoning: "OCR text is empty",
      missingFields: listMissingActiviteFields({}),
    };
  }

  const model = getModel();

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: buildActiviteInpiSystemPrompt() },
        {
          role: "user",
          content: buildActiviteInpiUserPrompt({
            fileName: input.fileName,
            rawText: input.rawText,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: ACTIVITE_INPI_GPT_JSON_SCHEMA,
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Réponse vide du modèle OpenAI.");
    }

    const rawResponse = JSON.parse(content) as unknown;
    const normalized = normalizeActiviteInpiGptResponse(rawResponse);
    const parseResult = activiteInpiGptResponseSchema.safeParse(normalized);

    if (!parseResult.success) {
      console.log("[gpt-extraction] validation failed", {
        fileName: input.fileName,
        issues: parseResult.error.issues.map((i) => i.message),
      });
      return {
        success: false,
        data: toActiviteInpiGptData(normalized),
        reasoning: "GPT response failed schema validation",
        missingFields: listMissingActiviteFields(toActiviteInpiGptData(normalized)),
        rawResponse,
      };
    }

    const parsed = parseResult.data;
    console.log("[gpt-extraction] raw parsed response", parsed);
    console.log("[gpt-extraction] extracted fields", {
      nom: parsed.nom,
      prenom: parsed.prenom,
      siren: parsed.siren,
      email: parsed.email,
      telephone: parsed.telephone,
      adresseEntrepreneur: parsed.adresseEntrepreneur,
      adresseEtablissement: parsed.adresseEtablissement,
    });

    const data = toActiviteInpiGptData(parsed);
    const missingFields = listMissingActiviteFields(data);
    const extractedCount = Object.keys(data).length;

    console.log("[gpt-extraction] complete", {
      fileName: input.fileName,
      model,
      extractedFieldCount: extractedCount,
      missingFields,
      fields: Object.keys(data),
    });

    return {
      success: extractedCount > 0,
      data,
      missingFields,
      rawResponse,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "GPT extraction failed";
    console.log("[gpt-extraction] failed", {
      fileName: input.fileName,
      reason: message,
    });
    return {
      success: false,
      data: {},
      reasoning: message,
      missingFields: listMissingActiviteFields({}),
    };
  }
}
