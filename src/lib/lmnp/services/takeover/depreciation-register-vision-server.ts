/**
 * Lot 5.4-B — requester Vision serveur réel pour lignes PDF registre
 * d'amortissements. Pattern aligné tax-package-liasse-vision-server.ts
 * (OpenAI chat.completions + json_schema + temperature 0), avec garde
 * server-only explicite : ce module ne doit jamais être importé par un
 * composant/bundle client — seule la route API le fait.
 *
 * Aucune clé OpenAI côté client. Aucune ligne inventée en cas d'échec.
 */

import "server-only";

import OpenAI from "openai";

import {
  DEPRECIATION_REGISTER_VISION_JSON_SCHEMA,
  buildDepreciationRegisterVisionSystemPrompt,
  parseDepreciationRegisterVisionPayload,
} from "./depreciation-register-vision-schema";
import type { DepreciationRegisterPdfRow } from "./depreciation-register-pdf-row";

const DEFAULT_VISION_MODEL = "gpt-4o-mini";

function getDepreciationRegisterVisionModel(): string {
  return (
    process.env.OPENAI_DEPRECIATION_REGISTER_VISION_MODEL ??
    process.env.OPENAI_VISION_OCR_MODEL ??
    process.env.OPENAI_EXTRACTION_MODEL ??
    DEFAULT_VISION_MODEL
  );
}

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurée.");
  }
  return new OpenAI({ apiKey });
}

export type ExtractDepreciationRegisterVisionRowsInput = {
  documentId: string;
  pageNumber: number;
  pageImage: { mimeType: "image/png" | "image/jpeg" | "image/webp"; base64: string };
  pageTextHint?: string;
};

/**
 * Appel Vision réel (serveur uniquement). Fail closed : toute erreur de
 * parsing/schéma renvoie [] (aucune ligne) — jamais une ligne inventée.
 * Les erreurs OpenAI (réseau, provider, clé manquante) sont propagées ;
 * l'appelant (route API) les traduit en réponse HTTP d'erreur, et
 * l'extracteur 5.4-A les traduit à son tour en diagnostic VISION_FAILED
 * (jamais une exception qui traverse silencieusement jusqu'à un Opening).
 */
export async function extractDepreciationRegisterVisionRows(
  input: ExtractDepreciationRegisterVisionRowsInput,
): Promise<DepreciationRegisterPdfRow[]> {
  if (!input.pageImage?.base64) {
    return [];
  }

  const openai = getOpenAI();
  const model = getDepreciationRegisterVisionModel();
  const systemPrompt = buildDepreciationRegisterVisionSystemPrompt();

  console.log("[depreciation-register-vision] request", {
    model,
    documentId: input.documentId,
    pageNumber: input.pageNumber,
    hasTextHint: Boolean(input.pageTextHint?.trim()),
  });

  const userTextParts = [`Page ${input.pageNumber}. Lis toutes les lignes du tableau visible.`];
  if (input.pageTextHint?.trim()) {
    userTextParts.push(
      "Indice — texte natif extrait de cette page (peut être partiellement désordonné, sert uniquement d'aide à la lecture, ne pas recopier tel quel) :",
      input.pageTextHint.slice(0, 4000),
    );
  }

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userTextParts.join("\n\n") },
          {
            type: "image_url",
            image_url: {
              url: `data:${input.pageImage.mimeType};base64,${input.pageImage.base64}`,
              detail: "high",
            },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: DEPRECIATION_REGISTER_VISION_JSON_SCHEMA,
    },
  });

  const content = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!content) return [];

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return [];
  }

  return parseDepreciationRegisterVisionPayload(json, input.pageNumber);
}
