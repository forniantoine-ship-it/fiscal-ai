/**
 * Charge document reading orchestrator.
 *
 * Runs DocumentReadingModeResolver BEFORE parser dispatch.
 * Parser always extracts first; GPT never rewrites parser structure.
 */

import type { Extraction, LmnpDocument } from "@/lib/lmnp/types/domain";
import type { ChargeDocumentType } from "@/lib/lmnp/services/classify-charge-document";
import type { ParserArbitrationMode } from "./insurance-field-orchestration";
import { logDocumentReadingModeDebug } from "./document-reading-mode-debug";
import {
  resolveDocumentReadingMode,
  shouldEnableSemanticArbitration,
} from "./document-reading-mode-resolver";
import type {
  CandidatePoolId,
  DocumentReadingMode,
  DocumentReadingModeDecision,
} from "./document-reading-mode-types";
import {
  logReadingModeTrace,
  resetReadingModeTraceClock,
} from "./reading-mode-trace-instrumentation";

export type ChargeReadingOrchestrationContext = {
  document: LmnpDocument;
  corpus: string;
  chargeDocumentType: ChargeDocumentType;
  extractions: Extraction[];
  readingMode: DocumentReadingModeDecision;
};

export type ChargeParserDispatchConfig = {
  readingMode: DocumentReadingMode;
  arbitrationMode: ParserArbitrationMode;
  candidatePoolsSelected: CandidatePoolId[];
  parserDominant: boolean;
  semanticGuidanceEnabled: boolean;
  /** Fallback to OCR extractions when parser yields no transactions. */
  allowOcrFallback: boolean;
};

/**
 * Resolves reading mode and builds orchestration context for a charge document.
 */
export function buildChargeReadingOrchestrationContext(params: {
  document: LmnpDocument;
  corpus: string;
  chargeDocumentType: ChargeDocumentType;
  extractions: Extraction[];
}): ChargeReadingOrchestrationContext {
  resetReadingModeTraceClock();
  const corpusLines = params.corpus.split(/\n+/);
  let maxLineLength = 0;
  let maxLineIndex = 0;
  for (let i = 0; i < corpusLines.length; i++) {
    const len = corpusLines[i]!.trim().length;
    if (len > maxLineLength) {
      maxLineLength = len;
      maxLineIndex = i;
    }
  }
  logReadingModeTrace("buildChargeReadingOrchestrationContext_entry", params.corpus.length, {
    documentId: params.document.id,
    chargeDocumentType: params.chargeDocumentType,
    lineCount: corpusLines.length,
    maxLineLength,
    maxLineIndex,
    singleDominantLine: maxLineLength >= params.corpus.length * 0.9,
  });
  logReadingModeTrace(
    "buildChargeReadingOrchestrationContext_before_resolveDocumentReadingMode",
    params.corpus.length,
  );
  const readingMode = resolveDocumentReadingMode({
    corpus: params.corpus,
    fileName: params.document.fileName,
    chargeDocumentType: params.chargeDocumentType,
    workspaceDocumentType: params.document.documentType,
  });
  logReadingModeTrace(
    "buildChargeReadingOrchestrationContext_after_resolveDocumentReadingMode",
    params.corpus.length,
    { detectedReadingMode: readingMode.detectedReadingMode },
  );

  const ctx: ChargeReadingOrchestrationContext = {
    document: params.document,
    corpus: params.corpus,
    chargeDocumentType: params.chargeDocumentType,
    extractions: params.extractions,
    readingMode,
  };
  logReadingModeTrace("buildChargeReadingOrchestrationContext_exit", params.corpus.length);
  return ctx;
}

/**
 * Maps reading mode decision to parser dispatch configuration.
 */
export function buildParserDispatchConfig(
  decision: DocumentReadingModeDecision,
): ChargeParserDispatchConfig {
  const semanticEnabled = shouldEnableSemanticArbitration(decision);

  return {
    readingMode: decision.detectedReadingMode,
    arbitrationMode: semanticEnabled ? "pending_semantic" : "deterministic_only",
    candidatePoolsSelected: decision.candidatePoolsSelected,
    parserDominant: decision.parserDominant,
    semanticGuidanceEnabled: decision.semanticGuidanceEnabled,
    allowOcrFallback: decision.detectedReadingMode !== "structured_table",
  };
}

export function logChargeReadingOrchestration(
  ctx: ChargeReadingOrchestrationContext,
  config: ChargeParserDispatchConfig,
  stage: string,
): void {
  logDocumentReadingModeDebug(stage, ctx.readingMode, {
    documentId: ctx.document.id,
    fileName: ctx.document.fileName,
    chargeDocumentType: ctx.chargeDocumentType,
    parserDispatch: {
      readingMode: config.readingMode,
      arbitrationMode: config.arbitrationMode,
      allowOcrFallback: config.allowOcrFallback,
    },
  });
}
