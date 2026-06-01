import OpenAI from "openai";

import {
  REVENUS_LINES_JSON_SCHEMA,
  REVENUS_LINES_SYSTEM_PROMPT,
  buildRevenusLinesUserPrompt,
} from "./prompts/revenus-lines.prompt";
import {
  RevenusLinesExtractionSchema,
  normalizeRevenusLinesExtraction,
  type RevenusLinesExtraction,
} from "./schemas/revenus-lines.schema";

const DEFAULT_MODEL = "gpt-4o-mini";

export type ExtractRevenusLinesWithGptInput = {
  rawText: string;
  fileName: string;
  fiscalYear: number;
  sourceType: string;
};

export type RevenusLinesGptExtractionResult = {
  success: boolean;
  extraction: RevenusLinesExtraction;
  error?: string;
};

function getModel(): string {
  return (
    process.env.OPENAI_REVENUS_EXTRACTION_MODEL ??
    process.env.OPENAI_EXTRACTION_MODEL ??
    DEFAULT_MODEL
  );
}

export async function extractRevenusLinesWithGpt(
  input: ExtractRevenusLinesWithGptInput,
): Promise<RevenusLinesGptExtractionResult> {
  console.log("[revenus-gpt] line extraction start", {
    fileName: input.fileName,
    fiscalYear: input.fiscalYear,
    sourceType: input.sourceType,
    textLength: input.rawText.length,
  });

  if (!input.rawText.trim()) {
    return { success: false, extraction: { lines: [] }, error: "Texte OCR vide." };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { success: false, extraction: { lines: [] }, error: "OPENAI_API_KEY non configurée." };
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: getModel(),
      temperature: 0,
      messages: [
        { role: "system", content: REVENUS_LINES_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildRevenusLinesUserPrompt({
            rawText: input.rawText,
            fileName: input.fileName,
            fiscalYear: input.fiscalYear,
            sourceType: input.sourceType,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: REVENUS_LINES_JSON_SCHEMA,
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content?.trim()) {
      return { success: false, extraction: { lines: [] }, error: "Réponse vide du modèle OpenAI." };
    }

    const rawResponse = JSON.parse(content) as unknown;
    const validation = RevenusLinesExtractionSchema.safeParse(rawResponse);
    if (!validation.success) {
      return {
        success: false,
        extraction: { lines: [] },
        error: "Réponse GPT invalide (schema).",
      };
    }

    const extraction = normalizeRevenusLinesExtraction(validation.data);
    console.log("[revenus-gpt] line extraction complete", {
      fileName: input.fileName,
      lineCount: extraction.lines.length,
    });

    if (extraction.lines.length === 0) {
      return {
        success: false,
        extraction,
        error: "Aucune ligne financière atomique extraite.",
      };
    }

    return { success: true, extraction };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction GPT échouée.";
    return { success: false, extraction: { lines: [] }, error: message };
  }
}
