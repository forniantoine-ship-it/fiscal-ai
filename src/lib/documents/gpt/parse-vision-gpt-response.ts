/**
 * Vision-only GPT response parsing — recursively unwraps stringified / multi-escaped JSON.
 * TRACE: filter console with [vision-response-parse-debug]
 */

export type VisionResponseParseDiagnostics = {
  typeofRaw: string;
  isStringifiedJson: boolean;
  parseSucceeded: boolean;
  parseError: string | null;
  unwrapDepth: number;
  unwrapDepthReached: number;
  canonicalFieldsWasString: boolean;
  canonicalFieldsStillString: boolean;
  canonicalFieldsUnwrapDepth: number;
  finalPayloadType: string;
  finalCanonicalFieldsType: string;
  normalizedInputType: string;
  parsedTopLevelKeys: string[];
  parsedDocumentIntent: unknown;
  parsedCanonicalFields: unknown;
  parsedCanonicalFieldKeys: string[];
};

export type VisionNormalizationInputValidation = {
  checkpoint: "pre_normalization_validation";
  normalizedInputType: string;
  typeofCanonicalFields: string;
  canonicalFieldsIsArray: boolean;
  canonicalFieldsStillString: boolean;
  canonicalFieldsKeys: string[];
};

export type VisionResponseParseResult = {
  parsed: unknown;
  diagnostics: VisionResponseParseDiagnostics;
};

const DEFAULT_MAX_UNWRAP_DEPTH = 6;

/** Recursively JSON.parse while value remains a string (handles double/triple escaping). */
export function deepJsonParse(
  value: unknown,
  maxDepth = DEFAULT_MAX_UNWRAP_DEPTH,
): { value: unknown; depth: number } {
  let current = value;
  let depth = 0;

  for (let i = 0; i < maxDepth; i++) {
    if (typeof current !== "string") break;
    try {
      current = JSON.parse(current) as unknown;
      depth += 1;
    } catch {
      break;
    }
  }

  return { value: current, depth };
}

function coerceRawDocumentTerms(record: Record<string, unknown>): Record<string, unknown> {
  const terms = record.rawDocumentTerms;

  if (terms === null || terms === undefined) {
    return { ...record, rawDocumentTerms: [] };
  }

  if (typeof terms === "string") {
    const unwrapped = deepJsonParse(terms);
    if (Array.isArray(unwrapped.value)) {
      return { ...record, rawDocumentTerms: unwrapped.value };
    }
    return { ...record, rawDocumentTerms: [] };
  }

  return record;
}

function ensureCanonicalFieldsObject(record: Record<string, unknown>): {
  record: Record<string, unknown>;
  canonicalFieldsWasString: boolean;
  canonicalFieldsStillString: boolean;
  canonicalFieldsUnwrapDepth: number;
} {
  let canonicalFieldsWasString = false;
  let canonicalFieldsStillString = false;
  let canonicalFieldsUnwrapDepth = 0;
  let next = { ...record };

  const rawCanonical = next.canonicalFields;

  if (rawCanonical === null || rawCanonical === undefined) {
    next.canonicalFields = {};
    return { record: next, canonicalFieldsWasString, canonicalFieldsStillString, canonicalFieldsUnwrapDepth };
  }

  if (typeof rawCanonical === "string") {
    canonicalFieldsWasString = true;
    const unwrapped = deepJsonParse(rawCanonical);
    canonicalFieldsUnwrapDepth = unwrapped.depth;

    if (
      unwrapped.value &&
      typeof unwrapped.value === "object" &&
      !Array.isArray(unwrapped.value)
    ) {
      next = { ...next, canonicalFields: unwrapped.value };
    } else {
      canonicalFieldsStillString = true;
    }
  }

  return { record: next, canonicalFieldsWasString, canonicalFieldsStillString, canonicalFieldsUnwrapDepth };
}

function buildDiagnostics(
  raw: unknown,
  parsed: unknown,
  params: {
    parseSucceeded: boolean;
    parseError: string | null;
    unwrapDepth: number;
    canonicalFieldsWasString: boolean;
    canonicalFieldsStillString: boolean;
    canonicalFieldsUnwrapDepth: number;
    isStringifiedJson: boolean;
  },
): VisionResponseParseDiagnostics {
  const parsedRecord =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;

  const canonicalFields = parsedRecord?.canonicalFields;
  const canonicalFieldKeys =
    canonicalFields && typeof canonicalFields === "object" && !Array.isArray(canonicalFields)
      ? Object.keys(canonicalFields as Record<string, unknown>)
      : [];

  return {
    typeofRaw: typeof raw,
    isStringifiedJson: params.isStringifiedJson,
    parseSucceeded: params.parseSucceeded,
    parseError: params.parseError,
    unwrapDepth: params.unwrapDepth,
    unwrapDepthReached: params.unwrapDepth + params.canonicalFieldsUnwrapDepth,
    canonicalFieldsWasString: params.canonicalFieldsWasString,
    canonicalFieldsStillString: params.canonicalFieldsStillString,
    canonicalFieldsUnwrapDepth: params.canonicalFieldsUnwrapDepth,
    finalPayloadType: parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed,
    finalCanonicalFieldsType:
      canonicalFields === null || canonicalFields === undefined
        ? "nullish"
        : Array.isArray(canonicalFields)
          ? "array"
          : typeof canonicalFields,
    normalizedInputType: parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed,
    parsedTopLevelKeys: parsedRecord ? Object.keys(parsedRecord) : [],
    parsedDocumentIntent: parsedRecord?.documentIntent ?? null,
    parsedCanonicalFields: canonicalFields ?? null,
    parsedCanonicalFieldKeys: canonicalFieldKeys,
  };
}

export function logVisionResponseParseDebug(
  diagnostics: VisionResponseParseDiagnostics | Record<string, unknown>,
): void {
  console.log("[vision-response-parse-debug]", {
    timestamp: new Date().toISOString(),
    ...diagnostics,
  });
}

export function logVisionNormalizationInputValidation(parsed: unknown): void {
  const record =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  const canonicalFields = record?.canonicalFields;

  const validation: VisionNormalizationInputValidation = {
    checkpoint: "pre_normalization_validation",
    normalizedInputType:
      parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed,
    typeofCanonicalFields:
      canonicalFields === null || canonicalFields === undefined
        ? "nullish"
        : typeof canonicalFields,
    canonicalFieldsIsArray: Array.isArray(canonicalFields),
    canonicalFieldsStillString: typeof canonicalFields === "string",
    canonicalFieldsKeys:
      canonicalFields && typeof canonicalFields === "object" && !Array.isArray(canonicalFields)
        ? Object.keys(canonicalFields as Record<string, unknown>)
        : [],
  };

  logVisionResponseParseDebug(validation);
}

/**
 * Safely parse Vision GPT output with recursive unwrap on:
 * - entire payload
 * - canonicalFields
 * - rawDocumentTerms (when stringified)
 */
export function parseVisionGptResponse(
  raw: unknown,
  maxDepth = DEFAULT_MAX_UNWRAP_DEPTH,
): VisionResponseParseResult {
  const isStringifiedJson =
    typeof raw === "string" ||
    (raw != null &&
      typeof raw === "object" &&
      typeof (raw as Record<string, unknown>).canonicalFields === "string");

  let parseSucceeded = true;
  let parseError: string | null = null;
  let unwrapDepth = 0;
  let canonicalFieldsWasString = false;
  let canonicalFieldsStillString = false;
  let canonicalFieldsUnwrapDepth = 0;

  try {
    const rootUnwrapped = deepJsonParse(raw, maxDepth);
    unwrapDepth = rootUnwrapped.depth;
    let parsed = rootUnwrapped.value;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const coercedTerms = coerceRawDocumentTerms(parsed as Record<string, unknown>);
      const coerced = ensureCanonicalFieldsObject(coercedTerms);
      parsed = coerced.record;
      canonicalFieldsWasString = coerced.canonicalFieldsWasString;
      canonicalFieldsStillString = coerced.canonicalFieldsStillString;
      canonicalFieldsUnwrapDepth = coerced.canonicalFieldsUnwrapDepth;
    }

    return {
      parsed,
      diagnostics: buildDiagnostics(raw, parsed, {
        parseSucceeded,
        parseError,
        unwrapDepth,
        canonicalFieldsWasString,
        canonicalFieldsStillString,
        canonicalFieldsUnwrapDepth,
        isStringifiedJson,
      }),
    };
  } catch (err) {
    parseSucceeded = false;
    parseError = err instanceof Error ? err.message : "vision_response_parse_failed";
    return {
      parsed: raw,
      diagnostics: buildDiagnostics(raw, raw, {
        parseSucceeded: false,
        parseError,
        unwrapDepth,
        canonicalFieldsWasString,
        canonicalFieldsStillString,
        canonicalFieldsUnwrapDepth,
        isStringifiedJson,
      }),
    };
  }
}

/** Spread canonicalFields to top level so legacy acte normalizer can read acquisitionPrice, etc. */
export function flattenVisionPayloadForLegacyBridge(parsed: unknown): Record<string, unknown> {
  const unwrapped = parseVisionGptResponse(parsed).parsed;
  if (!unwrapped || typeof unwrapped !== "object" || Array.isArray(unwrapped)) return {};

  const source = unwrapped as Record<string, unknown>;
  const canonical =
    source.canonicalFields &&
    typeof source.canonicalFields === "object" &&
    !Array.isArray(source.canonicalFields)
      ? (source.canonicalFields as Record<string, unknown>)
      : {};

  return { ...source, ...canonical };
}
