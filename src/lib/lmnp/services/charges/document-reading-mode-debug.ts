/**
 * Runtime diagnostics for charge document reading mode resolution.
 */

import type { DocumentReadingModeDecision } from "./document-reading-mode-types";

export const DOCUMENT_READING_MODE_DEBUG_PREFIX = "[document-reading-mode-debug]";

export function logDocumentReadingModeDebug(
  stage: string,
  decision: DocumentReadingModeDecision,
  extra?: Record<string, unknown>,
): void {
  console.log(DOCUMENT_READING_MODE_DEBUG_PREFIX, {
    stage,
    detectedReadingMode: decision.detectedReadingMode,
    dominantSource: decision.dominantSource,
    tableContainsTargetData: decision.tableContainsTargetData,
    routingReason: decision.routingReason,
    parserDominant: decision.parserDominant,
    semanticGuidanceEnabled: decision.semanticGuidanceEnabled,
    candidatePoolsSelected: decision.candidatePoolsSelected,
    chargeDocumentType: decision.chargeDocumentType,
    ...extra,
  });
}
