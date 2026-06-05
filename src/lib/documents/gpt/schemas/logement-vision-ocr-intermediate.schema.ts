import { z } from "zod";

export const VisionConfidenceLevel = z.enum(["high", "medium", "low"]);

export const LogementVisionOcrIntermediateSchema = z.object({
  rawTextBlocks: z.array(z.string()),
  keyValueCandidates: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      confidence: VisionConfidenceLevel,
    }),
  ),
  amountCandidates: z.array(
    z.object({
      label: z.string(),
      amount: z.number(),
      rawText: z.string().nullable().optional(),
      confidence: VisionConfidenceLevel,
    }),
  ),
});

export type LogementVisionOcrIntermediate = z.infer<typeof LogementVisionOcrIntermediateSchema>;

export function buildLogementVisionOcrIntermediateJsonSchema() {
  return {
    name: "logement_vision_ocr_intermediate",
    strict: true,
    schema: {
      type: "object",
      properties: {
        rawTextBlocks: {
          type: "array",
          items: { type: "string", description: "Bloc de texte lisible tel qu'affiché" },
          description: "Texte brut lisible par blocs (paragraphes, sections)",
        },
        keyValueCandidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "Libellé documentaire (ex. acquéreur, prix de vente)",
              },
              value: {
                type: "string",
                description: "Valeur associée lue sur le document",
              },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
            },
            required: ["label", "value", "confidence"],
            additionalProperties: false,
          },
        },
        amountCandidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "Contexte du montant (ex. prix de vente, frais de notaire)",
              },
              amount: { type: "number", description: "Montant numérique en euros" },
              rawText: {
                type: ["string", "null"],
                description: "Texte brut du montant tel qu'écrit",
              },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
            },
            required: ["label", "amount", "rawText", "confidence"],
            additionalProperties: false,
          },
        },
      },
      required: ["rawTextBlocks", "keyValueCandidates", "amountCandidates"],
      additionalProperties: false,
    },
  } as const;
}
