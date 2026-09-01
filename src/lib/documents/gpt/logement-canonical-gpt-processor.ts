import {
  computeDroppedCanonicalFields,
  extractCanonicalFieldsBeforeNormalization,
  logLogementPipelineDebugFull,
} from "@/lib/lmnp/services/logement/logement-pipeline-trace";
import {
  logVisionFallbackCheckpoint,
  serializeVisionDebugJson,
} from "@/lib/lmnp/services/logement/vision-fallback-trace";
import { canonicalToLogementActeExtraction } from "@/lib/lmnp/services/logement/logement-semantic-hydration";
import { normalizeLogementSemanticExtraction } from "@/lib/lmnp/services/logement/logement-semantic-normalization";
import type { LogementIntentResolution } from "@/lib/lmnp/services/logement/logement-document-intent";

import {
  flattenVisionPayloadForLegacyBridge,
  logVisionNormalizationInputValidation,
  logVisionResponseParseDebug,
  parseVisionGptResponse,
} from "./parse-vision-gpt-response";
import { LogementCanonicalExtractionSchema } from "./schemas/logement-canonical-extraction.schema";
import { normalizeLogementActeExtraction } from "./schemas/logement-acte.schema";
import type { LogementActeGptExtractionResult } from "./extract-logement-acte-with-gpt";

function countNormalizedCanonicalFields(
  fields: Record<string, unknown> | undefined,
): number {
  if (!fields) return 0;
  return Object.keys(fields).filter((key) => fields[key] !== undefined && fields[key] !== null).length;
}

function countCanonicalFieldsBefore(
  fields: Record<string, unknown>,
): number {
  return Object.keys(fields).filter(
    (key) =>
      key !== "documentIntent" &&
      key !== "rawDocumentTerms" &&
      key !== "canonicalFields" &&
      fields[key] !== undefined &&
      fields[key] !== null,
  ).length;
}

function logVisionExtractionSuccessDerivation(params: {
  fileName: string;
  branch: string;
  schemaValidationPassed: boolean;
  schemaValidationIssues?: Array<{ path: string; message: string }>;
  canonicalFieldsBeforeCount: number;
  normalizedFieldCount: number;
  bridgeFieldCount: number;
  legacyExtractionFieldCount: number;
  extractionKeysCount: number;
  extractionSuccess: boolean;
  failureReason: string | null;
}): void {
  console.log("[vision-response-parse-debug]", {
    checkpoint: "extraction_success_derivation",
    timestamp: new Date().toISOString(),
    ...params,
  });
}

function recoverVisionExtraction(params: {
  coercedResponse: unknown;
  semantic: ReturnType<typeof normalizeLogementSemanticExtraction>;
  extraction: ReturnType<typeof canonicalToLogementActeExtraction>;
  legacyExtraction: ReturnType<typeof normalizeLogementActeExtraction>;
}): ReturnType<typeof canonicalToLogementActeExtraction> {
  const legacyFallback = normalizeLogementActeExtraction(
    flattenVisionPayloadForLegacyBridge(params.coercedResponse),
  );
  return { ...params.legacyExtraction, ...legacyFallback, ...params.extraction };
}

/**
 * Shared canonical JSON → normalization → legacy bridge for text and vision GPT paths.
 */
export function processLogementCanonicalGptJson(params: {
  rawResponse: unknown;
  fileName: string;
  intentResolution: LogementIntentResolution;
  extractionSource: "text" | "vision";
}): LogementActeGptExtractionResult {
  const { rawResponse, fileName, intentResolution, extractionSource } = params;

  const visionParseResult =
    extractionSource === "vision" ? parseVisionGptResponse(rawResponse) : null;
  const coercedResponse = visionParseResult?.parsed ?? rawResponse;

  if (visionParseResult) {
    logVisionResponseParseDebug(visionParseResult.diagnostics);
  }

  const canonicalFieldsBeforeNormalization =
    extractCanonicalFieldsBeforeNormalization(coercedResponse);
  const canonicalFieldsBeforeCount = countCanonicalFieldsBefore(canonicalFieldsBeforeNormalization);

  const validation = LogementCanonicalExtractionSchema.safeParse(coercedResponse);
  if (!validation.success) {
    const legacySource =
      extractionSource === "vision"
        ? flattenVisionPayloadForLegacyBridge(coercedResponse)
        : coercedResponse;
    const legacyExtraction = normalizeLogementActeExtraction(legacySource);

    if (extractionSource === "vision") {
      logVisionNormalizationInputValidation(coercedResponse);
      const cf = (coercedResponse as Record<string, unknown>).canonicalFields;
      console.error("VISION_PARSE_REACHED", {
        branch: "schema_validation_failed",
        unwrapDepthReached: visionParseResult?.diagnostics.unwrapDepthReached,
        finalCanonicalFieldsType: visionParseResult?.diagnostics.finalCanonicalFieldsType,
        canonicalFieldsStillString: visionParseResult?.diagnostics.canonicalFieldsStillString,
        typeofCanonicalFields: cf === null || cf === undefined ? "nullish" : typeof cf,
      });
    }
    const semantic = normalizeLogementSemanticExtraction(coercedResponse, intentResolution);

    const droppedFields = computeDroppedCanonicalFields({
      before: canonicalFieldsBeforeNormalization,
      after: semantic.normalizedCanonicalFields as Record<string, unknown>,
      intent: semantic.detectedIntent,
    });
    if (extractionSource === "vision") {
      logVisionFallbackCheckpoint("canonical_processing_after_vision", {
        fileName,
        schemaValidationPassed: false,
        schemaValidationIssues: validation.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
        canonicalFieldsBeforeNormalization,
        normalizedCanonicalFields: semantic.normalizedCanonicalFields,
        droppedFields,
        unmatchedTerms: semantic.unmatchedTerms,
        rawGptJson: serializeVisionDebugJson(coercedResponse),
      });
    }
    logLogementPipelineDebugFull("canonical_normalization", {
      fileName,
      extractionSource,
      schemaValidationPassed: false,
      schemaValidationIssues: validation.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
      canonicalFieldsBeforeNormalization,
      normalizedCanonicalFields: semantic.normalizedCanonicalFields,
      droppedFields,
      unmatchedTerms: semantic.unmatchedTerms,
    });

    let extraction = canonicalToLogementActeExtraction(semantic);
    let merged = recoverVisionExtraction({
      coercedResponse,
      semantic,
      extraction,
      legacyExtraction,
    });
    let extractionKeysCount = Object.keys(merged).length;
    const normalizedFieldCount = countNormalizedCanonicalFields(
      semantic.normalizedCanonicalFields as Record<string, unknown>,
    );
    const bridgeFieldCount = Object.keys(extraction).length;

    if (extractionSource === "vision") {
      logVisionExtractionSuccessDerivation({
        fileName,
        branch: "schema_validation_failed",
        schemaValidationPassed: false,
        schemaValidationIssues: validation.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
        canonicalFieldsBeforeCount,
        normalizedFieldCount,
        bridgeFieldCount,
        legacyExtractionFieldCount: Object.keys(legacyExtraction).length,
        extractionKeysCount,
        extractionSuccess: extractionKeysCount > 0,
        failureReason:
          extractionKeysCount === 0
            ? normalizedFieldCount > 0
              ? "schema_failed_normalized_fields_unbridged"
              : canonicalFieldsBeforeCount > 0
                ? "schema_failed_canonical_before_normalization_unnormalized"
                : "schema_failed_no_fields"
            : null,
      });
    }

    if (extractionKeysCount === 0) {
      return {
        success: false,
        extraction: {},
        error: "GPT response failed schema validation",
        semantic,
        debug: { rawGptJson: coercedResponse, normalized: merged, semantic },
      };
    }

    return {
      success: true,
      extraction: merged,
      semantic,
      debug: { rawGptJson: coercedResponse, normalized: merged, semantic },
    };
  }

  if (extractionSource === "vision") {
    logVisionNormalizationInputValidation(validation.data);
    const cf = validation.data.canonicalFields;
    console.error("VISION_PARSE_REACHED", {
      branch: "schema_validation_passed",
      unwrapDepthReached: visionParseResult?.diagnostics.unwrapDepthReached,
      finalCanonicalFieldsType: visionParseResult?.diagnostics.finalCanonicalFieldsType,
      canonicalFieldsStillString: visionParseResult?.diagnostics.canonicalFieldsStillString,
      typeofCanonicalFields: cf === null || cf === undefined ? "nullish" : typeof cf,
    });
  }
  const semantic = normalizeLogementSemanticExtraction(validation.data, intentResolution);
  const droppedFields = computeDroppedCanonicalFields({
    before: canonicalFieldsBeforeNormalization,
    after: semantic.normalizedCanonicalFields as Record<string, unknown>,
    intent: semantic.detectedIntent,
  });
  if (extractionSource === "vision") {
    logVisionFallbackCheckpoint("canonical_processing_after_vision", {
      fileName,
      schemaValidationPassed: true,
      canonicalFieldsBeforeNormalization,
      normalizedCanonicalFields: semantic.normalizedCanonicalFields,
      droppedFields,
      unmatchedTerms: semantic.unmatchedTerms,
      hydrationMappingsFromNormalization: semantic.hydrationMappings,
      rawGptJson: serializeVisionDebugJson(coercedResponse),
    });
  }
  logLogementPipelineDebugFull("canonical_normalization", {
    fileName,
    extractionSource,
    schemaValidationPassed: true,
    canonicalFieldsBeforeNormalization,
    normalizedCanonicalFields: semantic.normalizedCanonicalFields,
    droppedFields,
    unmatchedTerms: semantic.unmatchedTerms,
    hydrationMappingsFromNormalization: semantic.hydrationMappings,
  });

  let extraction = canonicalToLogementActeExtraction(semantic);
  let extractionKeysCount = Object.keys(extraction).length;
  const normalizedFieldCount = countNormalizedCanonicalFields(
    semantic.normalizedCanonicalFields as Record<string, unknown>,
  );
  const bridgeFieldCount = extractionKeysCount;

  if (extractionKeysCount === 0 && extractionSource === "vision") {
    extraction = recoverVisionExtraction({
      coercedResponse,
      semantic,
      extraction,
      legacyExtraction: {},
    });
    extractionKeysCount = Object.keys(extraction).length;
  }

  if (extractionSource === "vision") {
    logVisionExtractionSuccessDerivation({
      fileName,
      branch: "schema_validation_passed",
      schemaValidationPassed: true,
      canonicalFieldsBeforeCount,
      normalizedFieldCount,
      bridgeFieldCount,
      legacyExtractionFieldCount: 0,
      extractionKeysCount,
      extractionSuccess: extractionKeysCount > 0,
      failureReason:
        extractionKeysCount === 0
          ? normalizedFieldCount > 0
            ? "schema_pass_bridge_empty_legacy_recovery_failed"
            : canonicalFieldsBeforeCount > 0
              ? "schema_pass_canonical_before_present_normalization_empty"
              : "schema_pass_no_fields"
          : null,
    });
  }

  if (extractionKeysCount === 0) {
    return {
      success: false,
      extraction: {},
      semantic,
      error: "Aucun champ extrait.",
      debug: { rawGptJson: coercedResponse, normalized: extraction, semantic },
    };
  }

  return {
    success: true,
    extraction,
    semantic,
    debug: { rawGptJson: coercedResponse, normalized: extraction, semantic },
  };
}
