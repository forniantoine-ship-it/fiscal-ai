import type { LogementActeExtraction } from "@/lib/documents/gpt/schemas/logement-acte.schema";
import type { CanonicalFieldKey } from "@/lib/documents/tunnel-field-ownership";
import type {
  LogementFieldKey,
  LogementFormValues,
} from "@/lib/lmnp/services/logement-profile";
import type { PropertyBackgroundExtraction, PropertyType } from "@/lib/lmnp/types";

export type LogementPrefillFieldKey = LogementFieldKey | "purchasePrice" | "notaryFees";

export type LogementUserValidatedFields = Partial<Record<LogementPrefillFieldKey, boolean>>;

export type LogementGptPrefillInput = {
  extraction: LogementActeExtraction;
  currentValues: LogementFormValues;
  userValidatedFields?: LogementUserValidatedFields;
  /** Existing background hints — avoids overwriting persisted acquisition data. */
  currentBackground?: PropertyBackgroundExtraction;
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
  target: "address" | "postalCode" | "city" | "acquisitionDate" | "surface",
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

  if (extraction.acquisitionPrice !== undefined) {
    const fieldKey: LogementPrefillFieldKey = "purchasePrice";
    if (isFieldLocked(fieldKey, userValidatedFields) || currentBackground?.acquisitionPrice != null) {
      skippedFields.push(fieldKey);
    } else {
      patch.acquisitionPrice = extraction.acquisitionPrice;
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
export function prefillLogementFormFromGpt(
  input: LogementGptPrefillInput,
): LogementGptPrefillResult {
  const userValidatedFields = input.userValidatedFields ?? {};
  const nextValues: LogementFormValues = { ...input.currentValues };
  const changedFields: LogementPrefillFieldKey[] = [];
  const skippedFields: LogementPrefillFieldKey[] = [];

  for (const mapping of LOGEMENT_SCALAR_MAPPINGS) {
    const raw = input.extraction[mapping.source];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "string" && !raw.trim()) continue;

    if (!canAutofillFormField(nextValues, mapping.target, mapping.fieldKey, userValidatedFields)) {
      skippedFields.push(mapping.fieldKey);
      continue;
    }

    const nextValue = mapping.transform ? mapping.transform(raw) : String(raw).trim();
    if (!nextValue) continue;

    assignStringField(
      nextValues,
      mapping.target as "address" | "postalCode" | "city" | "acquisitionDate" | "surface",
      nextValue,
    );
    changedFields.push(mapping.fieldKey);
  }

  if (input.extraction.propertyType?.trim()) {
    const fieldKey: LogementPrefillFieldKey = "propertyType";
    const normalizedType = normalizePropertyType(input.extraction.propertyType);

    if (!normalizedType) {
      skippedFields.push(fieldKey);
    } else if (!canAutofillFormField(nextValues, "propertyType", fieldKey, userValidatedFields)) {
      skippedFields.push(fieldKey);
    } else {
      nextValues.propertyType = normalizedType;
      changedFields.push(fieldKey);
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
  return changedFields.filter(
    (field): field is LogementFieldKey =>
      field !== "purchasePrice" && field !== "notaryFees",
  );
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
