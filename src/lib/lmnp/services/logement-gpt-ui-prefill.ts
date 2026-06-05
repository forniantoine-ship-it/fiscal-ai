import type { LogementActeExtraction } from "@/lib/documents/gpt/schemas/logement-acte.schema";
import type { CanonicalFieldKey } from "@/lib/documents/tunnel-field-ownership";
import {
  countEmptyLogementFormFields,
  logLogementPipelineDebug,
} from "@/lib/lmnp/services/logement/logement-pipeline-trace";
import {
  logVisionFallbackCheckpoint,
  type VisionHydrationFieldTrace,
} from "@/lib/lmnp/services/logement/vision-fallback-trace";
import type { LogementSemanticNormalizationResult } from "@/lib/lmnp/services/logement/logement-semantic-normalization";
import type {
  LogementFieldKey,
  LogementFormValues,
} from "@/lib/lmnp/services/logement-profile";
import type { PropertyBackgroundExtraction, PropertyType } from "@/lib/lmnp/types";

export type LogementPrefillFieldKey = LogementFieldKey;

export type LogementUserValidatedFields = Partial<Record<LogementPrefillFieldKey, boolean>>;

export type LogementGptPrefillInput = {
  extraction: LogementActeExtraction;
  /** Canonical semantic layer — used for hydration debug trace. */
  semantic?: LogementSemanticNormalizationResult;
  currentValues: LogementFormValues;
  userValidatedFields?: LogementUserValidatedFields;
  /** Existing background hints — avoids overwriting persisted acquisition data. */
  currentBackground?: PropertyBackgroundExtraction;
  /** When true, emit [vision-fallback-debug] hydration_after_vision checkpoint. */
  visionFallbackActivated?: boolean;
};

export type LogementGptGovernedExtractions = {
  /** Credit-owned fields — ingest via governed store; do not mutate Crédit UI directly. */
  creditPayload: Record<string, unknown>;
  /** Logement background hints surfaced on configured summary / downstream tunnels. */
  backgroundExtraction: Partial<PropertyBackgroundExtraction>;
  creditFields: CanonicalFieldKey[];
};

export type LogementGptPrefillResult = {
  nextValues: LogementFormValues;
  changedFields: LogementPrefillFieldKey[];
  skippedFields: LogementPrefillFieldKey[];
  governedExtractions: LogementGptGovernedExtractions;
};

type LogementScalarMapping = {
  source: keyof LogementActeExtraction;
  target: keyof LogementFormValues;
  fieldKey: LogementPrefillFieldKey;
  transform?: (value: NonNullable<LogementActeExtraction[keyof LogementActeExtraction]>) => string;
};

const LOGEMENT_SCALAR_MAPPINGS: LogementScalarMapping[] = [
  { source: "propertyAddress", target: "address", fieldKey: "address" },
  { source: "propertyPostalCode", target: "postalCode", fieldKey: "postalCode" },
  { source: "propertyCity", target: "city", fieldKey: "city" },
  {
    source: "acquisitionDate",
    target: "acquisitionDate",
    fieldKey: "acquisitionDate",
  },
  {
    source: "surfaceM2",
    target: "surface",
    fieldKey: "surface",
    transform: (value) => String(value),
  },
  {
    source: "propertyPurchasePrice",
    target: "propertyPurchasePrice",
    fieldKey: "propertyPurchasePrice",
    transform: (value) => String(value),
  },
  {
    source: "notaryFees",
    target: "notaryFees",
    fieldKey: "notaryFees",
    transform: (value) => String(value),
  },
];

const CREDIT_FIELD_SOURCES: Array<{
  source: keyof LogementActeExtraction;
  payloadKey: string;
  canonical: CanonicalFieldKey;
}> = [
  { source: "loanAmount", payloadKey: "loanAmount", canonical: "loanPrincipal" },
  { source: "bankName", payloadKey: "bankName", canonical: "lenderName" },
  { source: "loanDurationMonths", payloadKey: "loanDurationMonths", canonical: "loanTermMonths" },
  { source: "monthlyPayment", payloadKey: "monthlyPayment", canonical: "monthlyPayment" },
  { source: "interestRate", payloadKey: "loanRate", canonical: "loanRate" },
];

function isFieldLocked(
  fieldKey: LogementPrefillFieldKey,
  userValidatedFields: LogementUserValidatedFields,
): boolean {
  return userValidatedFields[fieldKey] === true;
}

function isFormValueEmpty(values: LogementFormValues, key: keyof LogementFormValues): boolean {
  const value = values[key];
  if (typeof value === "boolean") return false;
  if (typeof value === "string") return !value.trim();
  return value == null;
}

function assignStringField(
  values: LogementFormValues,
  target:
    | "address"
    | "postalCode"
    | "city"
    | "acquisitionDate"
    | "surface"
    | "propertyPurchasePrice"
    | "notaryFees",
  value: string,
): void {
  values[target] = value;
}

function canAutofillFormField(
  values: LogementFormValues,
  target: keyof LogementFormValues,
  fieldKey: LogementPrefillFieldKey,
  userValidatedFields: LogementUserValidatedFields,
): boolean {
  if (isFieldLocked(fieldKey, userValidatedFields)) return false;
  return isFormValueEmpty(values, target);
}

function normalizePropertyType(raw: string): PropertyType | undefined {
  const normalized = raw.trim().toLowerCase();
  const map: Record<string, PropertyType> = {
    appartement: "appartement",
    studio: "appartement",
    maison: "maison",
    "meuble-tourisme": "meuble-tourisme",
    "meublé tourisme": "meuble-tourisme",
    "meuble tourisme": "meuble-tourisme",
    "chambre-hote": "chambre-hote",
    "chambre d'hote": "chambre-hote",
    "chambre d'hôte": "chambre-hote",
    "non-classe": "non-classe",
    "non classé": "non-classe",
    immeuble: "appartement",
  };
  return map[normalized];
}

function buildCreditGovernedPayload(
  extraction: LogementActeExtraction,
): LogementGptGovernedExtractions {
  const creditPayload: Record<string, unknown> = {};
  const creditFields: CanonicalFieldKey[] = [];

  for (const mapping of CREDIT_FIELD_SOURCES) {
    const value = extraction[mapping.source];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    creditPayload[mapping.payloadKey] = value;
    creditFields.push(mapping.canonical);
  }

  return {
    creditPayload,
    backgroundExtraction: {},
    creditFields,
  };
}

function buildBackgroundExtraction(
  extraction: LogementActeExtraction,
  userValidatedFields: LogementUserValidatedFields,
  currentBackground?: PropertyBackgroundExtraction,
): {
  patch: Partial<PropertyBackgroundExtraction>;
  changedFields: LogementPrefillFieldKey[];
  skippedFields: LogementPrefillFieldKey[];
} {
  const patch: Partial<PropertyBackgroundExtraction> = {};
  const changedFields: LogementPrefillFieldKey[] = [];
  const skippedFields: LogementPrefillFieldKey[] = [];

  if (extraction.propertyPurchasePrice !== undefined) {
    const fieldKey: LogementPrefillFieldKey = "propertyPurchasePrice";
    if (isFieldLocked(fieldKey, userValidatedFields) || currentBackground?.acquisitionPrice != null) {
      skippedFields.push(fieldKey);
    } else {
      patch.acquisitionPrice = extraction.propertyPurchasePrice;
      changedFields.push(fieldKey);
    }
  }

  if (extraction.notaryFees !== undefined) {
    const fieldKey: LogementPrefillFieldKey = "notaryFees";
    if (isFieldLocked(fieldKey, userValidatedFields) || currentBackground?.notaryFees != null) {
      skippedFields.push(fieldKey);
    } else {
      patch.notaryFees = extraction.notaryFees;
      changedFields.push(fieldKey);
    }
  }

  return { patch, changedFields, skippedFields };
}

/**
 * Maps normalized acte notarié GPT extraction into Logement form values and governed hints.
 * Never overwrites user-validated fields. Credit hints are returned for governed ingest only.
 */
type HydrationMappingTrace = {
  extractionSource: string;
  targetUiField: string;
  extractionValue: unknown;
  mappedValue?: string;
  applied: boolean;
  skippedReason?: string;
};

export function prefillLogementFormFromGpt(
  input: LogementGptPrefillInput,
): LogementGptPrefillResult {
  const userValidatedFields = input.userValidatedFields ?? {};
  const nextValues: LogementFormValues = { ...input.currentValues };
  const changedFields: LogementPrefillFieldKey[] = [];
  const skippedFields: LogementPrefillFieldKey[] = [];
  const hydrationMappingTraces: HydrationMappingTrace[] = [];

  for (const mapping of LOGEMENT_SCALAR_MAPPINGS) {
    const raw = input.extraction[mapping.source];
    const trace: HydrationMappingTrace = {
      extractionSource: mapping.source,
      targetUiField: mapping.target,
      extractionValue: raw,
      applied: false,
    };

    if (raw === undefined || raw === null) {
      trace.skippedReason = "extraction_source_missing";
      hydrationMappingTraces.push(trace);
      continue;
    }
    if (typeof raw === "string" && !raw.trim()) {
      trace.skippedReason = "extraction_source_empty_string";
      hydrationMappingTraces.push(trace);
      continue;
    }

    if (isFieldLocked(mapping.fieldKey, userValidatedFields)) {
      trace.skippedReason = "field_locked_by_user";
      skippedFields.push(mapping.fieldKey);
      hydrationMappingTraces.push(trace);
      continue;
    }
    if (!isFormValueEmpty(nextValues, mapping.target)) {
      trace.skippedReason = "target_ui_field_not_empty";
      skippedFields.push(mapping.fieldKey);
      hydrationMappingTraces.push(trace);
      continue;
    }

    const nextValue = mapping.transform ? mapping.transform(raw) : String(raw).trim();
    if (!nextValue) {
      trace.skippedReason = "transform_produced_empty_value";
      hydrationMappingTraces.push(trace);
      continue;
    }

    trace.mappedValue = nextValue;
    trace.applied = true;
    assignStringField(
      nextValues,
      mapping.target as
        | "address"
        | "postalCode"
        | "city"
        | "acquisitionDate"
        | "surface"
        | "propertyPurchasePrice"
        | "notaryFees",
      nextValue,
    );
    changedFields.push(mapping.fieldKey);
    hydrationMappingTraces.push(trace);
  }

  {
    const fieldKey: LogementPrefillFieldKey = "propertyType";
    const rawType = input.extraction.propertyType;
    const trace: HydrationMappingTrace = {
      extractionSource: "propertyType",
      targetUiField: "propertyType",
      extractionValue: rawType,
      applied: false,
    };

    if (!rawType?.trim()) {
      trace.skippedReason = "extraction_source_missing";
      hydrationMappingTraces.push(trace);
    } else {
      const normalizedType = normalizePropertyType(rawType);
      if (!normalizedType) {
        trace.skippedReason = "property_type_unrecognized";
        skippedFields.push(fieldKey);
        hydrationMappingTraces.push(trace);
      } else if (isFieldLocked(fieldKey, userValidatedFields)) {
        trace.skippedReason = "field_locked_by_user";
        skippedFields.push(fieldKey);
        hydrationMappingTraces.push(trace);
      } else if (!isFormValueEmpty(nextValues, "propertyType")) {
        trace.skippedReason = "target_ui_field_not_empty";
        skippedFields.push(fieldKey);
        hydrationMappingTraces.push(trace);
      } else {
        trace.mappedValue = normalizedType;
        trace.applied = true;
        nextValues.propertyType = normalizedType;
        changedFields.push(fieldKey);
        hydrationMappingTraces.push(trace);
      }
    }
  }

  const background = buildBackgroundExtraction(
    input.extraction,
    userValidatedFields,
    input.currentBackground,
  );
  changedFields.push(...background.changedFields);
  skippedFields.push(...background.skippedFields);

  const governedExtractions = buildCreditGovernedPayload(input.extraction);
  governedExtractions.backgroundExtraction = background.patch;

  console.log("[logement-prefill] changed fields", changedFields);
  console.log("[logement-prefill] skipped locked fields", skippedFields);
  console.log("[logement-prefill] governed credit hints", {
    creditFields: governedExtractions.creditFields,
    backgroundFields: Object.keys(background.patch),
  });
  console.log("[logement-prefill-debug]", {
    extraction: input.extraction,
    nextValues,
    changedFields,
  });

  if (input.semantic) {
    for (const mapping of input.semantic.hydrationMappings) {
      hydrationMappingTraces.push({
        extractionSource: mapping.canonicalField,
        targetUiField: mapping.formField,
        extractionValue: mapping.value,
        mappedValue:
          typeof mapping.value === "string" || typeof mapping.value === "number"
            ? String(mapping.value)
            : undefined,
        applied: changedFields.includes(mapping.formField as LogementPrefillFieldKey),
        skippedReason: changedFields.includes(mapping.formField as LogementPrefillFieldKey)
          ? undefined
          : "canonical_mapping_not_applied_in_prefill",
      });
    }
  }

  logLogementPipelineDebug("hydration_mapping", {
    extractionInput: input.extraction,
    semanticHydrationMappings: input.semantic?.hydrationMappings ?? [],
    fieldTraces: hydrationMappingTraces,
    changedFields,
    skippedFields,
    currentValuesBefore: input.currentValues,
    nextValuesAfter: nextValues,
  });

  if (input.visionFallbackActivated) {
    const visionHydrationFields: VisionHydrationFieldTrace[] = hydrationMappingTraces.map(
      (trace) => ({
        canonicalField: trace.extractionSource,
        targetUiField: trace.targetUiField,
        mappedValue: trace.mappedValue,
        skippedReason: trace.skippedReason,
        applied: trace.applied,
      }),
    );

    if (input.semantic) {
      for (const mapping of input.semantic.hydrationMappings) {
        const alreadyTraced = visionHydrationFields.some(
          (field) =>
            field.canonicalField === mapping.canonicalField &&
            field.targetUiField === mapping.formField,
        );
        if (!alreadyTraced) {
          visionHydrationFields.push({
            canonicalField: mapping.canonicalField,
            targetUiField: mapping.formField,
            mappedValue:
              typeof mapping.value === "string" || typeof mapping.value === "number"
                ? String(mapping.value)
                : undefined,
            skippedReason: changedFields.includes(mapping.formField as LogementPrefillFieldKey)
              ? undefined
              : "canonical_mapping_not_applied_in_prefill",
            applied: changedFields.includes(mapping.formField as LogementPrefillFieldKey),
          });
        }
      }
    }

    logVisionFallbackCheckpoint("hydration_after_vision", {
      fields: visionHydrationFields,
      changedFields,
      skippedFields,
      extractionInput: input.extraction,
      currentValuesBefore: input.currentValues,
      nextValuesAfter: nextValues,
    });
  }

  if (input.semantic) {
    console.log("[logement-semantic-normalization-debug]", {
      detectedIntent: input.semantic.detectedIntent,
      rawDocumentTerms: input.semantic.rawDocumentTerms,
      normalizedCanonicalFields: input.semantic.normalizedCanonicalFields,
      unmatchedTerms: input.semantic.unmatchedTerms,
      hydrationMappings: input.semantic.hydrationMappings,
    });
  }

  return {
    nextValues,
    changedFields,
    skippedFields,
    governedExtractions,
  };
}

export function logementPrefillUncertainFields(
  changedFields: LogementPrefillFieldKey[],
): LogementFieldKey[] {
  return changedFields;
}

export function toLogementUserValidatedSet(
  fields: LogementUserValidatedFields,
): ReadonlySet<LogementPrefillFieldKey> {
  return new Set(
    Object.entries(fields)
      .filter(([, value]) => value)
      .map(([key]) => key as LogementPrefillFieldKey),
  );
}

export function mergeLogementUserValidatedFields(
  existing: LogementUserValidatedFields,
  editedKeys: LogementPrefillFieldKey[],
): LogementUserValidatedFields {
  const merged = { ...existing };
  for (const key of editedKeys) {
    merged[key] = true;
    console.log("[user-edit] logement field locked from automatic overwrite", { field: key });
  }
  return merged;
}
