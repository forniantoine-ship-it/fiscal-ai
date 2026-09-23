/**
 * Lot 4D.4B — requesters Vision serveur pour la liasse N-1 (classification de
 * page + extraction structurée des cases, contrat 4D.3).
 *
 * Lot 5.5-A — garde `server-only` réelle ajoutée (pattern aligné
 * depreciation-register-vision-server.ts) : ce module ne doit jamais être
 * importé par un composant/bundle client — seules les routes API dédiées le
 * font, via import dynamique (cf. request-tax-package-liasse-vision.ts /
 * request-tax-package-liasse-page-classify.ts et leurs routes). Le parsing
 * pur (schéma Zod, validation payload) vit désormais dans
 * extract-tax-package-liasse-observations.ts — pas de logique testable sans
 * réseau dans ce fichier.
 *
 * Pattern aligné logement / depreciation-register : OpenAI chat.completions
 * + json_schema + temperature 0. Aucune clé OpenAI côté client. Pas de log
 * des montants fiscaux.
 */

import "server-only";

import OpenAI from "openai";

import {
  buildTaxPackageLiasseVisionSystemPrompt,
  parseTaxPackageLiasseVisionFormPayload,
  TAX_PACKAGE_LIASSE_VISION_JSON_SCHEMA,
  type TaxPackageLiasseVisionRequester,
} from "./extract-tax-package-liasse-observations";
import {
  buildTaxPackageLiassePageClassifierSystemPrompt,
  parseTaxPackageLiassePageClassifierPayload,
  TAX_PACKAGE_LIASSE_PAGE_CLASSIFIER_JSON_SCHEMA,
  type TaxPackageLiassePageClassifier,
} from "./classify-tax-package-liasse-page";

const DEFAULT_VISION_MODEL = "gpt-4o-mini";

function getTaxPackageVisionModel(): string {
  return (
    process.env.OPENAI_TAX_PACKAGE_VISION_MODEL ??
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

/**
 * Requester Vision injectable conforme à TaxPackageLiasseVisionRequester.
 * Serveur uniquement (OPENAI_API_KEY).
 */
export function createTaxPackageLiasseVisionRequester(): TaxPackageLiasseVisionRequester {
  return async (input) => {
    if (!input.pageImage?.base64) {
      return parseTaxPackageLiasseVisionFormPayload(null, input.formType, input.sourceCases);
    }

    const openai = getOpenAI();
    const model = getTaxPackageVisionModel();
    const systemPrompt = buildTaxPackageLiasseVisionSystemPrompt(input.formType, input.sourceCases);

    console.log("[tax-package-vision] request", {
      model,
      formType: input.formType,
      pageNumber: input.pageNumber ?? null,
      caseCount: input.sourceCases.length,
    });

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Page ${input.pageNumber ?? "?"}. Extrais les cases demandées uniquement.`,
            },
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
        json_schema: TAX_PACKAGE_LIASSE_VISION_JSON_SCHEMA,
      },
    });

    const content = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return parseTaxPackageLiasseVisionFormPayload(null, input.formType, input.sourceCases);
    }

    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      return parseTaxPackageLiasseVisionFormPayload(null, input.formType, input.sourceCases);
    }

    return parseTaxPackageLiasseVisionFormPayload(json, input.formType, input.sourceCases);
  };
}

/**
 * Classifier de page Vision — serveur uniquement.
 */
export function createTaxPackageLiassePageClassifier(): TaxPackageLiassePageClassifier {
  return async ({ pageImage }) => {
    if (!pageImage.base64) {
      return { pageNumber: pageImage.pageNumber, formType: null, formYear: null };
    }

    const openai = getOpenAI();
    const model = getTaxPackageVisionModel();

    console.log("[tax-package-page-classifier] request", {
      model,
      pageNumber: pageImage.pageNumber,
    });

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: buildTaxPackageLiassePageClassifierSystemPrompt(),
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Classifie la page ${pageImage.pageNumber}.` },
            {
              type: "image_url",
              image_url: {
                url: `data:${pageImage.mimeType};base64,${pageImage.base64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: TAX_PACKAGE_LIASSE_PAGE_CLASSIFIER_JSON_SCHEMA,
      },
    });

    const content = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return { pageNumber: pageImage.pageNumber, formType: null, formYear: null };
    }

    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      return { pageNumber: pageImage.pageNumber, formType: null, formYear: null };
    }

    return parseTaxPackageLiassePageClassifierPayload(json, pageImage.pageNumber);
  };
}
