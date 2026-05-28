import OpenAI from "openai";

import {
  CLASSIFICATION_REVIEW_THRESHOLD,
  DOCUMENT_TYPES,
  isDocumentType,
  isLmnpCategory,
  LMNP_CATEGORIES,
  normalizeClassificationReason,
  type AiClassificationRecommendation,
  type DocumentType,
  type LmnpCategory,
} from "./document-classification-types";

export {
  CLASSIFICATION_REVIEW_THRESHOLD as CLASSIFICATION_CONFIDENCE_THRESHOLD,
  DOCUMENT_TYPES,
  type DocumentType,
};

export const CLASSIFICATION_SCHEMA_VERSION = "v1";
export const CLASSIFICATION_PROMPT_VERSION = "v2";

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_TEXT_LENGTH = 24_000;

export type ClassifyDocumentInput = {
  rawText: string;
};

/** @deprecated Use AiClassificationRecommendation from document-classification-types. */
export type DocumentClassification = AiClassificationRecommendation;

type RawClassificationResponse = {
  document_type?: unknown;
  detected_category?: unknown;
  confidence_score?: unknown;
  classification_reason?: unknown;
  reasoning?: unknown;
};

const LMNP_CATEGORY_ENUM = LMNP_CATEGORIES.filter((c) => c !== "unknown");

const DOCUMENT_CLASSIFICATION_JSON_SCHEMA = {
  name: "document_classification",
  strict: true,
  schema: {
    type: "object",
    properties: {
      document_type: {
        type: "string",
        enum: [...DOCUMENT_TYPES],
        description: "Document family identifier.",
      },
      detected_category: {
        anyOf: [{ type: "string", enum: [...LMNP_CATEGORY_ENUM] }, { type: "null" }],
        description: "LMNP business category recommendation.",
      },
      confidence_score: {
        type: "number",
        description: "Confidence between 0 and 1.",
      },
      classification_reason: {
        type: "array",
        items: { type: "string" },
        description: "Short keyword reasons, not chain-of-thought.",
      },
      reasoning: {
        type: ["string", "null"],
        description: "Brief debug sentence.",
      },
    },
    required: [
      "document_type",
      "detected_category",
      "confidence_score",
      "classification_reason",
      "reasoning",
    ],
    additionalProperties: false,
  },
} as const;

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurée.");
  }
  return new OpenAI({ apiKey });
}

function getModel(): string {
  return (
    process.env.OPENAI_CLASSIFICATION_MODEL ??
    process.env.OPENAI_EXTRACTION_MODEL ??
    process.env.OPENAI_OCR_MODEL ??
    DEFAULT_MODEL
  );
}

/** Applies the conservative confidence threshold — exported for testing. */
export function applyConfidenceThreshold(
  classification: AiClassificationRecommendation,
): AiClassificationRecommendation {
  if (classification.confidenceScore >= CLASSIFICATION_REVIEW_THRESHOLD) {
    return classification;
  }

  return {
    documentType: "unknown",
    detectedCategory: null,
    confidenceScore: classification.confidenceScore,
    classificationReason: classification.classificationReason,
    reasoning: classification.reasoning,
  };
}

function normalizeRawClassification(raw: RawClassificationResponse): AiClassificationRecommendation {
  const confidenceRaw = raw.confidence_score;
  const confidenceScore =
    typeof confidenceRaw === "number" && !Number.isNaN(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : 0;

  const documentType = isDocumentType(raw.document_type) ? raw.document_type : "unknown";
  const detectedCategory = isLmnpCategory(raw.detected_category) ? raw.detected_category : null;
  const classificationReason = normalizeClassificationReason(raw.classification_reason);
  const reasoning =
    typeof raw.reasoning === "string" && raw.reasoning.trim()
      ? raw.reasoning.trim()
      : undefined;

  return applyConfidenceThreshold({
    documentType,
    detectedCategory,
    confidenceScore,
    classificationReason,
    reasoning,
  });
}

function buildClassificationSystemPrompt(): string {
  const types = DOCUMENT_TYPES.filter((t) => t !== "unknown").join(", ");
  const categories = LMNP_CATEGORY_ENUM.join(", ");

  return `Tu es un classificateur de documents administratifs et financiers pour des loueurs en meublé (LMNP) en France.

Ta mission est de RECOMMANDER :
1. document_type : famille du document
2. detected_category : catégorie métier LMNP la plus probable

Familles document_type : ${types}, ou "unknown" si incertain.

Catégories detected_category : ${categories}, ou null si incertaine.

Correspondances indicatives :
- facture mobilier/meuble/canapé/lit → document_type invoice, detected_category furniture
- facture travaux/rénovation/carrelage/plomberie → invoice + works
- électroménager → invoice + appliance
- cuisine équipée → invoice + kitchen
- offre/prêt bancaire → loan_offer + loan
- acte notarié → notary_act + notary_fees
- taxe foncière/avis impôt → tax_document + property_tax
- assurance/quittance → insurance_document + insurance
- INPI/Kbis → inpi_document + inpi

Tu dois :
- rester conservateur : unknown/null en cas de doute
- fournir classification_reason : 1 à 5 mots-clés courts (ex. "pack meuble", "carrelage", "offre prêt")
- attribuer confidence_score entre 0 et 1
- NE PAS produire de raisonnement long — classification_reason = mots-clés uniquement

Tu ne dois PAS :
- décider du traitement fiscal ou comptable final
- extraire des montants
- inférer des durées d'amortissement

Réponds UNIQUEMENT en JSON strict conforme au schéma demandé.`;
}

function buildClassificationUserPrompt(rawText: string): string {
  const truncated =
    rawText.length > MAX_TEXT_LENGTH
      ? `${rawText.slice(0, MAX_TEXT_LENGTH)}\n\n[… texte tronqué …]`
      : rawText;

  return `Classifie ce document.

Texte extrait :
---
${truncated || "(aucun texte)"}
---

Recommande document_type, detected_category et classification_reason (mots-clés).`;
}

/**
 * Classifies raw document text into a document family + LMNP category recommendation.
 * Output is a recommendation — use resolveDocumentClassification() for final business category.
 */
export async function classifyDocument(
  input: ClassifyDocumentInput,
): Promise<AiClassificationRecommendation> {
  console.log("[classifier] start", { textLength: input.rawText.length });

  if (!input.rawText.trim()) {
    console.log("[classifier] unknown fallback", { reason: "empty text" });
    return {
      documentType: "unknown",
      detectedCategory: null,
      confidenceScore: 0,
      classificationReason: [],
      reasoning: "Texte vide.",
    };
  }

  const model = getModel();
  const openai = getOpenAI();

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: buildClassificationSystemPrompt() },
        { role: "user", content: buildClassificationUserPrompt(input.rawText) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: DOCUMENT_CLASSIFICATION_JSON_SCHEMA,
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Réponse vide du modèle OpenAI.");
    }

    const raw = JSON.parse(content) as RawClassificationResponse;
    const classification = normalizeRawClassification(raw);

    console.log("[classification] detected", {
      documentType: classification.documentType,
      detectedCategory: classification.detectedCategory,
      confidenceScore: classification.confidenceScore,
      classificationReason: classification.classificationReason,
    });

    if (
      classification.documentType === "unknown" &&
      classification.confidenceScore < CLASSIFICATION_REVIEW_THRESHOLD
    ) {
      console.log("[classifier] unknown fallback", {
        rawType: raw.document_type,
        confidence: classification.confidenceScore,
      });
    } else {
      console.log("[classifier] detected", classification.documentType);
      console.log("[classifier] confidence", classification.confidenceScore);
    }

    return classification;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Classification échouée.";
    console.log("[classifier] failed", { reason: message });
    return {
      documentType: "unknown",
      detectedCategory: null,
      confidenceScore: 0,
      classificationReason: [],
      reasoning: message,
    };
  }
}

export type { AiClassificationRecommendation, LmnpCategory };
