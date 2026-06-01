import OpenAI from "openai";

import {
  CREDIT_LOAN_OFFER_JSON_SCHEMA,
  CREDIT_LOAN_OFFER_SYSTEM_PROMPT,
  buildCreditLoanOfferUserPrompt,
} from "./prompts/credit-loan-offer.prompt";
import {
  CreditLoanOfferExtractionSchema,
  normalizeCreditLoanOfferExtraction,
  type CreditLoanOfferExtraction,
} from "./schemas/credit-loan-offer.schema";

const DEFAULT_MODEL = "gpt-4o-mini";

export type ExtractCreditLoanOfferWithGptInput = {
  rawText: string;
  fileName: string;
};

export type CreditLoanOfferGptExtractionResult = {
  success: boolean;
  extraction: CreditLoanOfferExtraction;
  error?: string;
  debug?: {
    rawGptJson: unknown;
    normalized: CreditLoanOfferExtraction;
  };
};

function getModel(): string {
  return (
    process.env.OPENAI_CREDIT_EXTRACTION_MODEL ??
    process.env.OPENAI_EXTRACTION_MODEL ??
    DEFAULT_MODEL
  );
}

export async function extractCreditLoanOfferWithGpt(
  input: ExtractCreditLoanOfferWithGptInput,
): Promise<CreditLoanOfferGptExtractionResult> {
  console.log("[credit-gpt] loan offer extraction start", {
    fileName: input.fileName,
    textLength: input.rawText.length,
  });

  if (!input.rawText.trim()) {
    return { success: false, extraction: {}, error: "OCR text is empty" };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { success: false, extraction: {}, error: "OPENAI_API_KEY non configurée." };
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: getModel(),
      temperature: 0,
      messages: [
        { role: "system", content: CREDIT_LOAN_OFFER_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildCreditLoanOfferUserPrompt({
            rawText: input.rawText,
            fileName: input.fileName,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: CREDIT_LOAN_OFFER_JSON_SCHEMA,
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content?.trim()) {
      return { success: false, extraction: {}, error: "Réponse vide du modèle OpenAI." };
    }

    let rawResponse: unknown;
    try {
      rawResponse = JSON.parse(content) as unknown;
    } catch {
      return { success: false, extraction: {}, error: "Réponse JSON invalide du modèle OpenAI." };
    }

    const validation = CreditLoanOfferExtractionSchema.safeParse(rawResponse);
    if (!validation.success) {
      return {
        success: false,
        extraction: {},
        error: "GPT response failed schema validation",
        debug: { rawGptJson: rawResponse, normalized: {} },
      };
    }

    const extraction = normalizeCreditLoanOfferExtraction(validation.data);
    const fieldCount = Object.keys(extraction).length;

    console.log("[credit-gpt] loan offer extraction complete", {
      fileName: input.fileName,
      fieldCount,
    });

    if (fieldCount === 0) {
      return { success: false, extraction: {}, error: "Aucun champ extrait." };
    }

    return {
      success: true,
      extraction,
      debug: { rawGptJson: rawResponse, normalized: extraction },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "GPT extraction failed";
    console.log("[credit-gpt] loan offer extraction failed", { fileName: input.fileName, reason: message });
    return { success: false, extraction: {}, error: message };
  }
}
