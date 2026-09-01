import { OCR_FAILURE_MIN_TEXT_LENGTH } from "@/lib/documents/ocr/ocr-quality";

import { computeLogementDocumentDensity, type LogementDocumentDensity } from "./logement-document-density";
import type { LogementDocumentIntent } from "./logement-document-intent";

/** Narrative logement documents eligible for Vision fallback after validated text-path failure. */
const VISION_ELIGIBLE_INTENTS = new Set<LogementDocumentIntent>([
  "acquisition",
  "legal",
  "ownership",
  "performance",
  "rental",
  "fiscal",
  "charges",
  "copro",
]);

/** Parser-sovereign — never Vision fallback. */
const VISION_BLOCKED_INTENTS = new Set<LogementDocumentIntent>(["financing"]);

export type VisionFallbackResolverInput = {
  fileName: string;
  documentIntent: LogementDocumentIntent;
  invalidCorpusDetected: boolean;
  ocrFailureReason?: string | null;
  extractedTextLength: number;
  semanticExtractionSuccess: boolean;
  semanticNormalizedFieldCount: number;
  ocrQualityAcceptable?: boolean;
  alphaRatio?: number;
  tableDensity?: number;
  narrativeDensity?: number;
  isSpreadsheet?: boolean;
  isStructuredTableDominant?: boolean;
  density?: LogementDocumentDensity;
};

export type VisionFallbackDecision = {
  activate: boolean;
  activationReason: string | null;
  blockedReason: string | null;
};

import { logVisionFallbackCheckpoint, logVisionFallbackDebug } from "./vision-fallback-trace";

export { logVisionFallbackCheckpoint, logVisionFallbackDebug };

function hasValidatedTextPathFailure(input: VisionFallbackResolverInput): string | null {
  if (input.invalidCorpusDetected) return "invalid_corpus_detected";
  if (input.ocrFailureReason) return "ocr_hard_failure";
  if (input.extractedTextLength < OCR_FAILURE_MIN_TEXT_LENGTH) {
    return "extracted_text_below_threshold";
  }
  if (input.ocrQualityAcceptable === false) return "ocr_quality_too_low";
  if (!input.semanticExtractionSuccess && input.semanticNormalizedFieldCount === 0) {
    return "empty_canonical_extraction";
  }
  return null;
}

/**
 * Decide whether to escalate from OCR/text path to GPT Vision multimodal extraction.
 * Vision activates ONLY after validated failure on narrative logement documents.
 */
export function resolveVisionFallback(input: VisionFallbackResolverInput): VisionFallbackDecision {
  const density =
    input.density ?? computeLogementDocumentDensity("", input.fileName);

  const tableDensity = input.tableDensity ?? density.tableDensity;
  const narrativeDensity = input.narrativeDensity ?? density.narrativeDensity;
  const isSpreadsheet = input.isSpreadsheet ?? density.isSpreadsheet;
  const isStructuredTableDominant =
    input.isStructuredTableDominant ?? density.isStructuredTableDominant;

  if (input.semanticExtractionSuccess && input.semanticNormalizedFieldCount > 0) {
    const decision: VisionFallbackDecision = {
      activate: false,
      activationReason: null,
      blockedReason: "text_path_succeeded_with_fields",
    };
    logVisionFallbackDebug({
      fallbackActivated: false,
      ...decision,
      documentIntent: input.documentIntent,
      semanticNormalizedFieldCount: input.semanticNormalizedFieldCount,
    });
    return decision;
  }

  if (VISION_BLOCKED_INTENTS.has(input.documentIntent)) {
    const decision: VisionFallbackDecision = {
      activate: false,
      activationReason: null,
      blockedReason: `parser_sovereign_intent_${input.documentIntent}`,
    };
    logVisionFallbackDebug({ fallbackActivated: false, ...decision, documentIntent: input.documentIntent });
    return decision;
  }

  if (isSpreadsheet) {
    const decision: VisionFallbackDecision = {
      activate: false,
      activationReason: null,
      blockedReason: "spreadsheet_parser_sovereign",
    };
    logVisionFallbackDebug({ fallbackActivated: false, ...decision, fileName: input.fileName });
    return decision;
  }

  if (isStructuredTableDominant && tableDensity > narrativeDensity) {
    const decision: VisionFallbackDecision = {
      activate: false,
      activationReason: null,
      blockedReason: "structured_table_dominant",
    };
    logVisionFallbackDebug({
      fallbackActivated: false,
      ...decision,
      tableDensity,
      narrativeDensity,
    });
    return decision;
  }

  if (!VISION_ELIGIBLE_INTENTS.has(input.documentIntent)) {
    const decision: VisionFallbackDecision = {
      activate: false,
      activationReason: null,
      blockedReason: `intent_not_vision_eligible_${input.documentIntent}`,
    };
    logVisionFallbackDebug({ fallbackActivated: false, ...decision });
    return decision;
  }

  const failureReason = hasValidatedTextPathFailure(input);
  if (!failureReason) {
    const decision: VisionFallbackDecision = {
      activate: false,
      activationReason: null,
      blockedReason: "no_validated_text_path_failure",
    };
    logVisionFallbackDebug({
      fallbackActivated: false,
      ...decision,
      extractedTextLength: input.extractedTextLength,
      semanticExtractionSuccess: input.semanticExtractionSuccess,
    });
    return decision;
  }

  const decision: VisionFallbackDecision = {
    activate: true,
    activationReason: failureReason,
    blockedReason: null,
  };

  logVisionFallbackCheckpoint("vision_fallback_activated", {
    activationReason: decision.activationReason,
    documentIntent: input.documentIntent,
    OCRFailureReason: input.ocrFailureReason ?? null,
    extractedTextLength: input.extractedTextLength,
    invalidCorpusDetected: input.invalidCorpusDetected,
    semanticNormalizedFieldCount: input.semanticNormalizedFieldCount,
    tableDensity,
    narrativeDensity,
  });

  return decision;
}
