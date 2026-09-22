/**
 * Lot 4D.4B — classification minimale de page scan → 2033A | 2033C | unknown.
 * Fail closed : doute → unknown. Pas de framework documentaire générique.
 */

import { z } from "zod";

import type { TaxPackageLiasseFormType } from "./extract-tax-package-liasse-observations";
import type { TaxPackageLiassePageImage } from "./extract-tax-package-liasse-observations";

export type TaxPackageLiassePageClassification = {
  pageNumber: number;
  /** null = neither / unknown — jamais forcé. */
  formType: TaxPackageLiasseFormType | null;
  /** Millésime imprimé observé ; null si illisible. */
  formYear: number | null;
};

export type TaxPackageLiassePageClassifier = (input: {
  pageImage: TaxPackageLiassePageImage;
}) => Promise<TaxPackageLiassePageClassification>;

export const TAX_PACKAGE_LIASSE_PAGE_CLASSIFIER_JSON_SCHEMA = {
  name: "tax_package_liasse_page_class_v1",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["formType", "formYear"],
    properties: {
      formType: {
        type: "string",
        enum: ["2033A", "2033C", "unknown"],
      },
      formYear: {
        type: ["integer", "null"],
        description: "Millésime Cerfa imprimé (ex. 2026), null si illisible",
      },
    },
  },
} as const;

export const TaxPackageLiassePageClassifierZodSchema = z.object({
  formType: z.enum(["2033A", "2033C", "unknown"]),
  formYear: z.number().int().nullable(),
});

export type TaxPackageLiassePageClassifierRaw = z.infer<
  typeof TaxPackageLiassePageClassifierZodSchema
>;

export function buildTaxPackageLiassePageClassifierSystemPrompt(): string {
  return [
    "Tu identifies une page de liasse fiscale française scannée.",
    "Réponds uniquement via le schéma JSON.",
    "formType = 2033A si formulaire 2033-A-SD clairement visible.",
    "formType = 2033C si formulaire 2033-C-SD clairement visible.",
    "formType = unknown si doute, page mixte, illisible, ou ni A ni C.",
    "Ne force JAMAIS A ou C en cas d'incertitude.",
    "formYear = année millésime imprimée près du marqueur Cerfa, sinon null.",
  ].join("\n");
}

/**
 * Valide la réponse classifier. Payload invalide → unknown fail-closed.
 */
export function parseTaxPackageLiassePageClassifierPayload(
  raw: unknown,
  pageNumber: number,
): TaxPackageLiassePageClassification {
  const parsed = TaxPackageLiassePageClassifierZodSchema.safeParse(raw);
  if (!parsed.success) {
    return { pageNumber, formType: null, formYear: null };
  }
  const formType =
    parsed.data.formType === "unknown" ? null : parsed.data.formType;
  let formYear = parsed.data.formYear;
  if (formYear !== null && (formYear < 1900 || formYear > 2100)) {
    formYear = null;
  }
  return { pageNumber, formType, formYear };
}
