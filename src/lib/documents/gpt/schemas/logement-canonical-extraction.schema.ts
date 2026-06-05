import { z } from "zod";

import {
  LOGEMENT_DOCUMENT_INTENTS,
  type LogementDocumentIntent,
} from "@/lib/lmnp/services/logement/logement-document-intent";
import { CANONICAL_FIELD_KEYS_BY_INTENT } from "@/lib/lmnp/services/logement/logement-canonical-schema";

const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();
const nullableBoolean = z.boolean().nullable().optional();
const nullableStringArray = z.array(z.string()).nullable().optional();

const RawDocumentTermSchema = z.object({
  term: z.string(),
  value: nullableString,
  mappedField: nullableString,
});

/**
 * GPT output shape — intent + canonical fields only (no free-form keys).
 */
export const LogementCanonicalExtractionSchema = z.object({
  documentIntent: z.enum(LOGEMENT_DOCUMENT_INTENTS),
  canonicalFields: z.record(z.string(), z.unknown()),
  rawDocumentTerms: z.array(RawDocumentTermSchema).optional(),
});

export type LogementCanonicalExtractionRaw = z.infer<typeof LogementCanonicalExtractionSchema>;

export function buildCanonicalFieldsJsonSchema(intent: LogementDocumentIntent) {
  const keys = CANONICAL_FIELD_KEYS_BY_INTENT[intent];

  const properties: Record<string, unknown> = {};
  for (const key of keys) {
    if (key === "lotNumbers" || key === "sellerNames" || key === "buyerNames" || key === "ownerNames" || key === "cadastralReferences") {
      properties[key] = {
        type: ["array", "null"],
        items: { type: "string" },
        description: `Valeur canonique pour ${key}`,
      };
    } else if (key === "furnished") {
      properties[key] = { type: ["boolean", "null"], description: "Meublé ou nu" };
    } else if (
      key.includes("Price") ||
      key.includes("Amount") ||
      key.includes("Area") ||
      key.includes("Rate") ||
      key.includes("Rent") ||
      key === "durationMonths" ||
      key === "taxYear" ||
      key === "loanAmount" ||
      key === "monthlyPayment" ||
      key === "insuranceAmount" ||
      key === "callAmount" ||
      key === "livingArea" ||
      key === "notaryFees" ||
      key === "acquisitionPrice"
    ) {
      properties[key] = {
        type: ["number", "null"],
        description: `Valeur numérique canonique pour ${key}`,
      };
    } else {
      properties[key] = {
        type: ["string", "null"],
        description: `Valeur canonique pour ${key}`,
      };
    }
  }

  return {
    type: "object",
    properties,
    required: keys,
    additionalProperties: false,
  };
}

export function buildLogementCanonicalJsonSchema(intent: LogementDocumentIntent) {
  return {
    name: "logement_canonical_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        documentIntent: {
          type: "string",
          enum: [...LOGEMENT_DOCUMENT_INTENTS],
          description: "Intention métier du document",
        },
        canonicalFields: buildCanonicalFieldsJsonSchema(intent),
        rawDocumentTerms: {
          type: ["array", "null"],
          items: {
            type: "object",
            properties: {
              term: {
                type: "string",
                description: "Libellé tel qu'écrit dans le document (ex. prix de vente, acquéreur)",
              },
              value: {
                type: ["string", "null"],
                description: "Valeur brute extraite pour ce libellé",
              },
              mappedField: {
                type: ["string", "null"],
                description: "Champ canonique correspondant (ex. acquisitionPrice, buyerNames)",
              },
            },
            required: ["term", "value", "mappedField"],
            additionalProperties: false,
          },
        },
      },
      required: ["documentIntent", "canonicalFields", "rawDocumentTerms"],
      additionalProperties: false,
    },
  } as const;
}
