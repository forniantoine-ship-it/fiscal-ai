import { CLASSIFICATION_SCHEMA_VERSION } from "@/lib/documents/classification/classification-registry";
import { createLearningCase } from "@/lib/documents/learning/create-learning-case";
import type { ActiviteInpiGptData } from "@/lib/documents/gpt";
import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import type { ClassificationResult } from "@/lib/documents/types/classification-result";
import type { LearningCase } from "@/lib/documents/types/learning-case";
import type { ManualCorrection } from "@/lib/documents/types/manual-correction";
import type { ActiviteFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";

export type CreateGptLearningRecordInput = {
  documentId: string;
  ocrText: string;
  gptData: ActiviteInpiGptData;
  corrections: ManualCorrection[];
  notes?: string;
};

function gptClassificationStub(): ClassificationResult {
  return {
    documentType: "inpi",
    confidence: createConfidenceScore(1, ["gpt-first"]),
    candidates: [],
    tunnel: "inpi",
    needsReview: false,
    explainability: ["gpt-first", "activite-tunnel"],
    schemaVersion: CLASSIFICATION_SCHEMA_VERSION,
  };
}

export function createGptLearningRecord(input: CreateGptLearningRecordInput): LearningCase {
  const learningCase = createLearningCase({
    documentId: input.documentId,
    tunnel: "inpi",
    classification: gptClassificationStub(),
    extraction: null,
    corrections: input.corrections,
    ocrText: input.ocrText,
    notes: input.notes ?? "gpt_manual_correction",
  });

  console.log("[gpt-learning]", {
    caseId: learningCase.id,
    documentId: input.documentId,
    correctionCount: input.corrections.length,
  });

  return learningCase;
}

export const GPT_FORM_TO_EXTRACTION_KEY: Partial<
  Record<
    | "firstName"
    | "lastName"
    | "siren"
    | "email"
    | "telephone"
    | "personalAddress"
    | "personalCity"
    | "personalPostalCode"
    | "establishmentAddress"
    | "establishmentCity"
    | "establishmentPostalCode",
    keyof ActiviteInpiGptData
  >
> = {
  lastName: "nom",
  firstName: "prenom",
  siren: "siren",
  email: "email",
  telephone: "telephone",
  personalAddress: "adresseEntrepreneur",
  personalCity: "adresseEntrepreneur",
  personalPostalCode: "adresseEntrepreneur",
  establishmentAddress: "adresseEtablissement",
  establishmentCity: "adresseEtablissement",
  establishmentPostalCode: "adresseEtablissement",
};

export function buildGptManualCorrections(params: {
  documentId: string;
  gptData: ActiviteInpiGptData;
  previous: ActiviteFormValues;
  next: ActiviteFormValues;
}): ManualCorrection[] {
  const corrections: ManualCorrection[] = [];

  for (const formKey of Object.keys(GPT_FORM_TO_EXTRACTION_KEY) as Array<
    keyof typeof GPT_FORM_TO_EXTRACTION_KEY
  >) {
    const gptKey = GPT_FORM_TO_EXTRACTION_KEY[formKey];
    if (!gptKey || !params.gptData[gptKey]) continue;

    const prev = params.previous[formKey];
    const curr = params.next[formKey];
    if (prev === curr) continue;

    corrections.push({
      id: `corr_${Date.now()}_${gptKey}_${String(formKey)}`,
      documentId: params.documentId,
      fieldKey: gptKey,
      previousValue: prev,
      correctedValue: curr,
      documentType: "inpi",
      correctedAt: new Date().toISOString(),
      correctedBy: null,
      reason: "user_edit_after_gpt_extraction",
    });
  }

  return corrections;
}
