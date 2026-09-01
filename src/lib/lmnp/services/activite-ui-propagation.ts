import type { ActiviteFieldKey, ActiviteFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";
import type { InpiExtractedData } from "@/lib/documents/extractors/extract-inpi";
import type { ExtractedField } from "@/lib/documents/types/extraction-result";
import type { ValidationStageResult } from "@/lib/documents/types/pipeline-context";

/** UI propagation tiers — distinct from extraction/validation thresholds */
export const UI_PROPAGATION_THRESHOLDS = {
  high: 0.85,
  medium: 0.6,
} as const;

export type PropagationTier = "high" | "medium" | "low";

export type PropagationDecision =
  | "silent_autofill"
  | "autofill_with_review"
  | "suggestion_only"
  | "reject"
  | "skip";

export type UiPropagationLog = {
  field: ActiviteFieldKey;
  extractionKey?: string;
  confidence?: number;
  validationResult: "valid" | "low_confidence" | "invalid_format" | "missing" | "not_applicable";
  propagationDecision: PropagationDecision;
  reason?: string;
};

/** Maps activité form keys → INPI extraction keys */
export const INPI_FORM_TO_EXTRACTION: Partial<Record<ActiviteFieldKey, keyof InpiExtractedData>> = {
  siren: "siren",
  firstName: "prenom",
  lastName: "nom",
};

export type InpiUiPropagationResult = {
  values: Partial<ActiviteFormValues>;
  uncertainFields: ActiviteFieldKey[];
  propagatedFieldCount: number;
  suggestionCount: number;
  rejectedCount: number;
  traceDecisions: Array<{ field: string; decision: PropagationDecision; reason?: string }>;
};

function fieldByKey(fields: ExtractedField[], key: string): ExtractedField | undefined {
  return fields.find((f) => f.key === key);
}

export function resolvePropagationTier(confidence: number): PropagationTier {
  if (confidence >= UI_PROPAGATION_THRESHOLDS.high) return "high";
  if (confidence >= UI_PROPAGATION_THRESHOLDS.medium) return "medium";
  return "low";
}

function validationStatusForField(
  extractionKey: string,
  validation: ValidationStageResult | null,
): UiPropagationLog["validationResult"] {
  if (!validation) return "not_applicable";

  const errors = validation.fieldErrors.filter((e) => e.fieldKey === extractionKey);
  if (errors.some((e) => e.code === "invalid_format")) return "invalid_format";
  if (errors.some((e) => e.code === "low_confidence")) return "low_confidence";
  if (errors.some((e) => e.code === "required")) return "missing";
  return "valid";
}

function logUiPropagation(entry: UiPropagationLog): void {
  console.log("[ui-propagation]", entry);
}

export function decideFieldPropagation(params: {
  formKey: ActiviteFieldKey;
  extractionKey: string;
  extracted: ExtractedField | undefined;
  rawValue: string | undefined;
  validation: ValidationStageResult | null;
  existingUserValue?: string;
}): { decision: PropagationDecision; uncertain: boolean; reason?: string } {
  const { formKey, extractionKey, extracted, rawValue, validation } = params;

  const validationResult = validationStatusForField(extractionKey, validation);

  if (!extracted || !rawValue?.trim()) {
    logUiPropagation({
      field: formKey,
      extractionKey,
      validationResult: validationResult === "not_applicable" ? "missing" : validationResult,
      propagationDecision: "skip",
      reason: "no extracted value",
    });
    return { decision: "skip", uncertain: true, reason: "no extracted value" };
  }

  const confidence = extracted.confidence.value;
  const tier = resolvePropagationTier(confidence);
  const inferred = extracted.provenance?.inferred ?? false;

  if (validationResult === "invalid_format") {
    logUiPropagation({
      field: formKey,
      extractionKey,
      confidence,
      validationResult,
      propagationDecision: "reject",
      reason: "invalid format",
    });
    return { decision: "reject", uncertain: true, reason: "invalid format" };
  }

  if (tier === "low") {
    logUiPropagation({
      field: formKey,
      extractionKey,
      confidence,
      validationResult,
      propagationDecision: "suggestion_only",
      reason: "confidence below medium threshold",
    });
    return { decision: "suggestion_only", uncertain: true, reason: "low confidence" };
  }

  if (tier === "high" && !inferred && validationResult !== "low_confidence") {
    logUiPropagation({
      field: formKey,
      extractionKey,
      confidence,
      validationResult,
      propagationDecision: "silent_autofill",
    });
    return { decision: "silent_autofill", uncertain: false };
  }

  // Medium tier, inferred, or validation low_confidence → autofill with review
  logUiPropagation({
    field: formKey,
    extractionKey,
    confidence,
    validationResult,
    propagationDecision: "autofill_with_review",
    reason:
      tier === "medium"
        ? "medium confidence"
        : inferred
          ? "inferred value"
          : "validation low_confidence flag",
  });
  return { decision: "autofill_with_review", uncertain: true };
}

function applyFormValue(
  values: Partial<ActiviteFormValues>,
  formKey: ActiviteFieldKey,
  rawValue: string,
): void {
  if (formKey === "firstName") {
    values.firstName = rawValue;
  } else if (formKey === "lastName") {
    values.lastName = rawValue;
  } else if (formKey === "siren") {
    values.siren = rawValue;
  }
}

/**
 * Propagates INPI extraction to activité form state.
 * Validation informs logging/learning — it does NOT block medium-confidence autofill.
 */
export function propagateInpiExtractionToUi(
  data: InpiExtractedData,
  fields: ExtractedField[],
  validation: ValidationStageResult | null,
  existingValues?: Partial<ActiviteFormValues>,
): InpiUiPropagationResult {
  const values: Partial<ActiviteFormValues> = {};
  const uncertainFields: ActiviteFieldKey[] = [];
  const traceDecisions: InpiUiPropagationResult["traceDecisions"] = [];
  let propagatedFieldCount = 0;
  let suggestionCount = 0;
  let rejectedCount = 0;

  for (const [formKey, extractionKey] of Object.entries(INPI_FORM_TO_EXTRACTION) as [
    ActiviteFieldKey,
    keyof InpiExtractedData,
  ][]) {
    const extracted = fieldByKey(fields, extractionKey);
    const rawValue = data[extractionKey];
    const existingUserValue = existingValues?.[formKey as keyof ActiviteFormValues];
    const existingStr =
      typeof existingUserValue === "string" ? existingUserValue : undefined;

    const { decision, uncertain, reason } = decideFieldPropagation({
      formKey,
      extractionKey,
      extracted,
      rawValue,
      validation,
      existingUserValue: existingStr,
    });

    traceDecisions.push({ field: formKey, decision, reason });

    if (decision === "silent_autofill" || decision === "autofill_with_review") {
      applyFormValue(values, formKey, rawValue!);
      propagatedFieldCount++;
      if (uncertain) uncertainFields.push(formKey);
    } else if (decision === "suggestion_only") {
      suggestionCount++;
      uncertainFields.push(formKey);
    } else if (decision === "reject") {
      rejectedCount++;
      uncertainFields.push(formKey);
    } else {
      uncertainFields.push(formKey);
    }
  }

  return {
    values,
    uncertainFields: [...new Set(uncertainFields)],
    propagatedFieldCount,
    suggestionCount,
    rejectedCount,
    traceDecisions,
  };
}

/** Legacy pipeline: no Activité manual-only fields (product is LMNP réel simplifié fixed). */
export const INPI_MANUAL_WORKFLOW_FIELDS: ActiviteFieldKey[] = [];

export function shouldShowUnrecognizedMessage(params: {
  classificationBand: string;
  propagatedFieldCount: number;
  extractedFieldCount: number;
}): boolean {
  const { classificationBand, propagatedFieldCount, extractedFieldCount } = params;
  if (propagatedFieldCount > 0) return false;
  return classificationBand === "low" || classificationBand === "unknown" || extractedFieldCount === 0;
}

export function shouldMarkPipelineFailed(params: {
  propagatedFieldCount: number;
  classificationDocumentType: string;
}): boolean {
  if (params.classificationDocumentType === "unknown") return true;
  return params.propagatedFieldCount === 0;
}
