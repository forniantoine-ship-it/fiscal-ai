import {
  normalizeDate,
  normalizeNumber,
  normalizeString,
} from "@/lib/documents/gpt/schemas/logement-acte.schema";

import {
  CANONICAL_FIELD_KEYS_BY_INTENT,
  type LogementCanonicalFields,
  type LogementSemanticExtraction,
  type RawDocumentTerm,
} from "./logement-canonical-schema";
import {
  isLogementDocumentIntent,
  type LogementDocumentIntent,
  type LogementIntentResolution,
} from "./logement-document-intent";
import {
  LEGACY_FIELD_ALIASES,
  resolveCanonicalFieldFromKey,
  resolveCanonicalFieldFromTerm,
} from "./logement-semantic-vocabulary";

export type HydrationMapping = {
  canonicalField: string;
  formField: string;
  value: string | number | boolean | string[];
};

export type LogementSemanticNormalizationResult = {
  detectedIntent: LogementDocumentIntent;
  intentConfidence: LogementIntentResolution["confidence"];
  rawDocumentTerms: RawDocumentTerm[];
  normalizedCanonicalFields: LogementCanonicalFields;
  unmatchedTerms: RawDocumentTerm[];
  hydrationMappings: HydrationMapping[];
};

const STRING_ARRAY_FIELDS = new Set([
  "lotNumbers",
  "sellerNames",
  "buyerNames",
  "ownerNames",
  "cadastralReferences",
]);

const BOOLEAN_FIELDS = new Set(["furnished"]);

const NUMBER_FIELDS = new Set([
  "acquisitionPrice",
  "notaryFees",
  "livingArea",
  "loanAmount",
  "interestRate",
  "monthlyPayment",
  "insuranceAmount",
  "durationMonths",
  "monthlyRent",
  "taxAmount",
  "taxYear",
  "callAmount",
]);

const DATE_FIELDS = new Set([
  "acquisitionDate",
  "leaseStartDate",
  "policyStartDate",
  "callDate",
  "diagnosticDate",
  "effectiveDate",
]);

function normalizePostalCode(value: unknown): string | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 5 ? digits : raw;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => normalizeString(item))
      .filter((item): item is string => Boolean(item));
    return items.length > 0 ? items : undefined;
  }
  const single = normalizeString(value);
  if (!single) return undefined;
  const parts = single.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [single];
}

function normalizeCanonicalValue(
  fieldKey: string,
  value: unknown,
): string | number | boolean | string[] | undefined {
  if (value == null) return undefined;

  if (BOOLEAN_FIELDS.has(fieldKey)) {
    if (typeof value === "boolean") return value;
    const raw = normalizeString(value);
    if (!raw) return undefined;
    if (/^(oui|yes|true|meubl[eé]|furnished)$/i.test(raw)) return true;
    if (/^(non|no|false|nu)$/i.test(raw)) return false;
    return undefined;
  }

  if (STRING_ARRAY_FIELDS.has(fieldKey)) {
    return normalizeStringArray(value);
  }

  if (NUMBER_FIELDS.has(fieldKey)) {
    return normalizeNumber(value);
  }

  if (DATE_FIELDS.has(fieldKey)) {
    return normalizeDate(value);
  }

  if (fieldKey === "propertyPostalCode") {
    return normalizePostalCode(value);
  }

  if (fieldKey === "propertyType") {
    const raw = normalizeString(value);
    return raw ? raw.toLowerCase() : undefined;
  }

  return normalizeString(value);
}

function isAllowedField(intent: LogementDocumentIntent, fieldKey: string): boolean {
  const allowed = CANONICAL_FIELD_KEYS_BY_INTENT[intent] as readonly string[];
  if (allowed.includes(fieldKey)) return true;
  // Acquisition actes may carry optional financing hints for cross-tunnel prefill.
  if (intent === "acquisition") {
    const financingKeys = CANONICAL_FIELD_KEYS_BY_INTENT.financing as readonly string[];
    return financingKeys.includes(fieldKey);
  }
  return false;
}

function assignCanonicalField(
  target: Record<string, unknown>,
  intent: LogementDocumentIntent,
  fieldKey: string,
  value: unknown,
): boolean {
  const canonicalKey = resolveCanonicalFieldFromKey(fieldKey, intent) ?? fieldKey;
  if (!isAllowedField(intent, canonicalKey)) return false;

  const normalized = normalizeCanonicalValue(canonicalKey, value);
  if (normalized === undefined) return false;

  target[canonicalKey] = normalized;
  return true;
}

function extractRawTerms(raw: unknown): RawDocumentTerm[] {
  if (!raw || typeof raw !== "object") return [];
  const source = raw as Record<string, unknown>;
  const terms = source.rawDocumentTerms;
  if (!Array.isArray(terms)) return [];

  return terms
    .filter((item): item is Record<string, unknown> => item != null && typeof item === "object")
    .map((item) => ({
      term: normalizeString(item.term) ?? "",
      value: normalizeString(item.value),
      mappedField: normalizeString(item.mappedField),
    }))
    .filter((item) => item.term.length > 0);
}

function extractCanonicalFieldsSource(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;

  if (source.canonicalFields && typeof source.canonicalFields === "object") {
    return source.canonicalFields as Record<string, unknown>;
  }

  return source;
}

/**
 * Normalize GPT or legacy extraction into canonical logement fields.
 * Applies vocabulary mapping to raw document terms before UI hydration.
 */
export function normalizeLogementSemanticExtraction(
  raw: unknown,
  intentResolution: LogementIntentResolution,
): LogementSemanticNormalizationResult {
  const gptIntent =
    raw && typeof raw === "object" && isLogementDocumentIntent((raw as Record<string, unknown>).documentIntent)
      ? ((raw as Record<string, unknown>).documentIntent as LogementDocumentIntent)
      : null;

  const detectedIntent = gptIntent ?? intentResolution.intent;
  const normalizedCanonicalFields: Record<string, unknown> = {};
  const unmatchedTerms: RawDocumentTerm[] = [];
  const rawDocumentTerms = extractRawTerms(raw);

  const fieldSource = extractCanonicalFieldsSource(raw);

  for (const [key, value] of Object.entries(fieldSource)) {
    if (key === "documentIntent" || key === "rawDocumentTerms" || key === "canonicalFields") {
      continue;
    }
    assignCanonicalField(normalizedCanonicalFields, detectedIntent, key, value);
  }

  for (const legacyKey of Object.keys(LEGACY_FIELD_ALIASES)) {
    if (fieldSource[legacyKey] !== undefined) {
      assignCanonicalField(normalizedCanonicalFields, detectedIntent, legacyKey, fieldSource[legacyKey]);
    }
  }

  for (const termEntry of rawDocumentTerms) {
    const resolvedField =
      termEntry.mappedField ??
      resolveCanonicalFieldFromTerm(termEntry.term, detectedIntent);

    if (!resolvedField || !isAllowedField(detectedIntent, resolvedField)) {
      unmatchedTerms.push(termEntry);
      continue;
    }

    if (normalizedCanonicalFields[resolvedField] !== undefined) {
      continue;
    }

    if (termEntry.value) {
      const assigned = assignCanonicalField(
        normalizedCanonicalFields,
        detectedIntent,
        resolvedField,
        termEntry.value,
      );
      if (!assigned) {
        unmatchedTerms.push(termEntry);
      }
    } else {
      unmatchedTerms.push(termEntry);
    }
  }

  const hydrationMappings = buildHydrationMappings(
    detectedIntent,
    normalizedCanonicalFields as LogementCanonicalFields,
  );

  const result: LogementSemanticNormalizationResult = {
    detectedIntent,
    intentConfidence: intentResolution.confidence,
    rawDocumentTerms,
    normalizedCanonicalFields: normalizedCanonicalFields as LogementCanonicalFields,
    unmatchedTerms,
    hydrationMappings,
  };

  logLogementSemanticNormalizationDebug(result);
  return result;
}

export function buildHydrationMappings(
  intent: LogementDocumentIntent,
  fields: LogementCanonicalFields,
): HydrationMapping[] {
  const mappings: HydrationMapping[] = [];

  if (intent === "acquisition") {
    const acquisition = fields as Record<string, unknown>;
    const pairs: Array<[string, string]> = [
      ["acquisitionPrice", "propertyPurchasePrice"],
      ["acquisitionDate", "acquisitionDate"],
      ["propertyAddress", "address"],
      ["propertyPostalCode", "postalCode"],
      ["propertyCity", "city"],
      ["propertyType", "propertyType"],
      ["livingArea", "surface"],
      ["notaryFees", "notaryFees"],
    ];

    for (const [canonical, form] of pairs) {
      const value = acquisition[canonical];
      if (value === undefined) continue;
      mappings.push({
        canonicalField: canonical,
        formField: form,
        value: typeof value === "number" && form === "surface"
          ? String(value)
          : typeof value === "number" && form === "propertyPurchasePrice"
            ? String(value)
            : typeof value === "number" && form === "notaryFees"
              ? String(value)
              : (value as string | number | boolean | string[]),
      });
    }
  }

  if (intent === "financing" || intent === "acquisition") {
    const financing = fields as Record<string, unknown>;
    const creditPairs: Array<[string, string]> = [
      ["loanAmount", "loanAmount"],
      ["bankName", "bankName"],
      ["durationMonths", "loanDurationMonths"],
      ["monthlyPayment", "monthlyPayment"],
      ["interestRate", "loanRate"],
    ];

    for (const [canonical, form] of creditPairs) {
      const value = financing[canonical];
      if (value === undefined) continue;
      mappings.push({ canonicalField: canonical, formField: form, value: value as string | number });
    }
  }

  return mappings;
}

export function toLogementSemanticExtraction(
  result: LogementSemanticNormalizationResult,
): LogementSemanticExtraction {
  return {
    documentIntent: result.detectedIntent,
    canonicalFields: result.normalizedCanonicalFields,
    rawDocumentTerms: result.rawDocumentTerms,
  };
}

export function logLogementSemanticNormalizationDebug(
  result: LogementSemanticNormalizationResult,
): void {
  console.log("[logement-semantic-normalization-debug]", {
    detectedIntent: result.detectedIntent,
    intentConfidence: result.intentConfidence,
    rawDocumentTerms: result.rawDocumentTerms,
    normalizedCanonicalFields: result.normalizedCanonicalFields,
    unmatchedTerms: result.unmatchedTerms,
    hydrationMappings: result.hydrationMappings,
  });
}
