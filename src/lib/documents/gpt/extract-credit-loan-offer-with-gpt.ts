import OpenAI from "openai";

import {
  CREDIT_DOCUMENTARY_METADATA_SYSTEM_PROMPT,
  CREDIT_LOAN_OFFER_JSON_SCHEMA,
  CREDIT_LOAN_OFFER_SYSTEM_PROMPT,
  buildCreditDocumentaryMetadataUserPrompt,
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
  /** When set, uses documentary prompt tuned for amortization PDF intro/summary pages. */
  sourceDocumentKind?: "loan_offer" | "amortization_schedule";
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

async function runCreditLoanOfferStyleGptExtraction(
  input: ExtractCreditLoanOfferWithGptInput,
  mode: "loan_offer" | "documentary_metadata",
): Promise<CreditLoanOfferGptExtractionResult> {
  const isDocumentary = mode === "documentary_metadata";
  const logLabel = isDocumentary ? "documentary metadata" : "loan offer";

  console.log(`[credit-gpt] ${logLabel} extraction start`, {
    fileName: input.fileName,
    textLength: input.rawText.length,
    sourceDocumentKind: input.sourceDocumentKind ?? "loan_offer",
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
    const systemPrompt = isDocumentary
      ? CREDIT_DOCUMENTARY_METADATA_SYSTEM_PROMPT
      : CREDIT_LOAN_OFFER_SYSTEM_PROMPT;
    const userPrompt = isDocumentary
      ? buildCreditDocumentaryMetadataUserPrompt({
          rawText: input.rawText,
          fileName: input.fileName,
        })
      : buildCreditLoanOfferUserPrompt({
          rawText: input.rawText,
          fileName: input.fileName,
        });

    const completion = await openai.chat.completions.create({
      model: getModel(),
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
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

    console.log(`[credit-gpt] ${logLabel} extraction complete`, {
      fileName: input.fileName,
      fieldCount,
      interestRate: extraction.interestRate ?? null,
      applicationFees: extraction.applicationFees ?? null,
      guaranteeFees: extraction.guaranteeFees ?? null,
      bankName: extraction.bankName ?? null,
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
    console.log(`[credit-gpt] ${logLabel} extraction failed`, {
      fileName: input.fileName,
      reason: message,
    });
    return { success: false, extraction: {}, error: message };
  }
}

export async function extractCreditLoanOfferWithGpt(
  input: ExtractCreditLoanOfferWithGptInput,
): Promise<CreditLoanOfferGptExtractionResult> {
  return runCreditLoanOfferStyleGptExtraction(input, "loan_offer");
}

export async function extractCreditDocumentaryMetadataWithGpt(
  input: ExtractCreditLoanOfferWithGptInput,
): Promise<CreditLoanOfferGptExtractionResult> {
  return runCreditLoanOfferStyleGptExtraction(
    { ...input, sourceDocumentKind: input.sourceDocumentKind ?? "amortization_schedule" },
    "documentary_metadata",
  );
}
