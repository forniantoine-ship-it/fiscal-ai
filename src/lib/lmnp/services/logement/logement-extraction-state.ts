import type { LogementFormValues } from "@/lib/lmnp/services/logement-profile";
import { isLogementProfileIncomplete } from "@/lib/lmnp/services/logement-profile";

export type LogementExtractionState = "success" | "partial" | "failed";

/** Core logement fields expected from a complete acquisition extraction. */
export const LOGEMENT_CORE_FIELD_KEYS = [
  "address",
  "city",
  "postalCode",
  "propertyPurchasePrice",
  "acquisitionDate",
  "surface",
] as const;

export type DeriveLogementExtractionStateInput = {
  extractionSuccess: boolean;
  patchedFieldNames: string[];
  canonicalFieldCount: number;
  formValues: LogementFormValues;
  visionFallbackActivated?: boolean;
  visionExtractionSucceeded?: boolean;
  pipelineError?: boolean;
};

export type LogementExtractionOutcome = {
  state: LogementExtractionState;
  hasPartialFields: boolean;
  patchedFieldCount: number;
  missingCoreFields: string[];
};

function countFilledCoreFields(values: LogementFormValues): string[] {
  const missing: string[] = [];
  if (!values.address?.trim()) missing.push("address");
  if (!values.city?.trim()) missing.push("city");
  if (!values.postalCode?.trim()) missing.push("postalCode");
  if (!values.propertyPurchasePrice?.trim()) missing.push("propertyPurchasePrice");
  if (!values.acquisitionDate?.trim()) missing.push("acquisitionDate");
  if (!values.surface?.trim()) missing.push("surface");
  return missing;
}

function hasAnyExtractedFormSignal(values: LogementFormValues): boolean {
  return LOGEMENT_CORE_FIELD_KEYS.some((key) => {
    const value = values[key as keyof LogementFormValues];
    return typeof value === "string" && value.trim().length > 0;
  });
}

/**
 * Derives UX extraction state from pipeline output — drives recovery actions.
 */
export function deriveLogementExtractionState(
  input: DeriveLogementExtractionStateInput,
): LogementExtractionOutcome {
  const missingCoreFields = countFilledCoreFields(input.formValues);
  const hasPartialFields =
    input.patchedFieldNames.length > 0 ||
    input.canonicalFieldCount > 0 ||
    hasAnyExtractedFormSignal(input.formValues);

  if (input.pipelineError && !hasPartialFields) {
    return {
      state: "failed",
      hasPartialFields: false,
      patchedFieldCount: input.patchedFieldNames.length,
      missingCoreFields,
    };
  }

  if (!input.extractionSuccess && !hasPartialFields) {
    return {
      state: "failed",
      hasPartialFields: false,
      patchedFieldCount: 0,
      missingCoreFields,
    };
  }

  if (!input.extractionSuccess && hasPartialFields) {
    return {
      state: "partial",
      hasPartialFields: true,
      patchedFieldCount: input.patchedFieldNames.length,
      missingCoreFields,
    };
  }

  if (input.extractionSuccess && isLogementProfileIncomplete(input.formValues)) {
    return {
      state: "partial",
      hasPartialFields: true,
      patchedFieldCount: input.patchedFieldNames.length,
      missingCoreFields,
    };
  }

  if (input.extractionSuccess && missingCoreFields.length > 0) {
    return {
      state: "partial",
      hasPartialFields: true,
      patchedFieldCount: input.patchedFieldNames.length,
      missingCoreFields,
    };
  }

  return {
    state: "success",
    hasPartialFields: hasPartialFields,
    patchedFieldCount: input.patchedFieldNames.length,
    missingCoreFields,
  };
}
