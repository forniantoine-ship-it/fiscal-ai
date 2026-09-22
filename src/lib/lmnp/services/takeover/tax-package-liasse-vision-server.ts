/**
 * Lot 4D.4B — requester Vision serveur pour cases V1 liasse (contrat 4D.3).
 * Pattern aligné logement : OpenAI chat.completions + json_schema + temperature 0.
 * Aucune clé OpenAI côté client. Pas de log des montants fiscaux.
 */

import OpenAI from "openai";
import { z } from "zod";

import {
  buildTaxPackageLiasseVisionSystemPrompt,
  TAX_PACKAGE_LIASSE_VISION_JSON_SCHEMA,
  type TaxPackageLiasseFormType,
  type TaxPackageLiasseVisionCasePayload,
  type TaxPackageLiasseVisionFormPayload,
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

const VisionCaseZod = z.object({
  sourceCase: z.string(),
  status: z.enum(["present", "missing", "extraction_impossible"]),
  value: z.number().nullable(),
});

export const TaxPackageLiasseVisionFormZodSchema = z.object({
  formType: z.enum(["2033A", "2033C", "unknown"]),
  cases: z.array(VisionCaseZod),
});

/**
 * Valide le payload Vision 4D.3. Échec → formType unknown + cases vides
 * (l'appelant 4D.3 mappe en extraction_impossible case par case).
 */
export function parseTaxPackageLiasseVisionFormPayload(
  raw: unknown,
  expectedFormType: TaxPackageLiasseFormType,
  expectedCases: readonly string[],
): TaxPackageLiasseVisionFormPayload {
  const parsed = TaxPackageLiasseVisionFormZodSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      formType: "unknown",
      cases: expectedCases.map((sourceCase) => ({
        sourceCase,
        status: "extraction_impossible" as const,
        value: null,
      })),
    };
  }

  const byCase = new Map(
    parsed.data.cases.map((c) => [c.sourceCase, c] as const),
  );
  const cases: TaxPackageLiasseVisionCasePayload[] = expectedCases.map(
    (sourceCase) => {
      const hit = byCase.get(sourceCase);
      if (!hit) {
        return {
          sourceCase,
          status: "extraction_impossible",
          value: null,
        };
      }
      return {
        sourceCase: hit.sourceCase,
        status: hit.status,
        value: hit.value,
      };
    },
  );

  // formType mismatch → fail closed on all cases
  if (
    parsed.data.formType !== expectedFormType &&
    parsed.data.formType !== "unknown"
  ) {
    return {
      formType: "unknown",
      cases: expectedCases.map((sourceCase) => ({
        sourceCase,
        status: "extraction_impossible",
        value: null,
      })),
    };
  }

  return {
    formType: parsed.data.formType,
    cases,
  };
}

/**
 * Requester Vision injectable conforme à TaxPackageLiasseVisionRequester.
 * Serveur uniquement (OPENAI_API_KEY).
 */
export function createTaxPackageLiasseVisionRequester(): TaxPackageLiasseVisionRequester {
  return async (input) => {
    if (!input.pageImage?.base64) {
      return parseTaxPackageLiasseVisionFormPayload(
        null,
        input.formType,
        input.sourceCases,
      );
    }

    const openai = getOpenAI();
    const model = getTaxPackageVisionModel();
    const systemPrompt = buildTaxPackageLiasseVisionSystemPrompt(
      input.formType,
      input.sourceCases,
    );

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
      return parseTaxPackageLiasseVisionFormPayload(
        null,
        input.formType,
        input.sourceCases,
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      return parseTaxPackageLiasseVisionFormPayload(
        null,
        input.formType,
        input.sourceCases,
      );
    }

    return parseTaxPackageLiasseVisionFormPayload(
      json,
      input.formType,
      input.sourceCases,
    );
  };
}

/**
 * Classifier de page Vision — serveur uniquement.
 */
export function createTaxPackageLiassePageClassifier(): TaxPackageLiassePageClassifier {
  return async ({ pageImage }) => {
    if (!pageImage.base64) {
      return {
        pageNumber: pageImage.pageNumber,
        formType: null,
        formYear: null,
      };
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
            {
              type: "text",
              text: `Classifie la page ${pageImage.pageNumber}.`,
            },
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
      return {
        pageNumber: pageImage.pageNumber,
        formType: null,
        formYear: null,
      };
    }

    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      return {
        pageNumber: pageImage.pageNumber,
        formType: null,
        formYear: null,
      };
    }

    return parseTaxPackageLiassePageClassifierPayload(
      json,
      pageImage.pageNumber,
    );
  };
}
