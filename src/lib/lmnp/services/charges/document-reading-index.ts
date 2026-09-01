/**
 * Charge document reading strategy architecture — public exports.
 * Scope: heterogeneous charge documents only.
 */

export type {
  CandidatePoolId,
  DocumentReadingMode,
  DocumentReadingModeDecision,
  DocumentStructureHints,
  DominantSource,
  ResolveDocumentReadingModeInput,
} from "./document-reading-mode-types";

export {
  resolveDocumentReadingMode,
  shouldEnableSemanticArbitration,
  isParserSovereign,
} from "./document-reading-mode-resolver";

export { detectDocumentStructureHints } from "./document-structure-signals";

export {
  logDocumentReadingModeDebug,
  DOCUMENT_READING_MODE_DEBUG_PREFIX,
} from "./document-reading-mode-debug";

export {
  buildChargeReadingOrchestrationContext,
  buildParserDispatchConfig,
  logChargeReadingOrchestration,
  type ChargeReadingOrchestrationContext,
  type ChargeParserDispatchConfig,
} from "./charge-reading-orchestrator";

export {
  resolveReadingStrategyWithGpt,
  resolveDocumentReadingModeWithStrategy,
  type ReadingStrategistInput,
  type ReadingStrategistResult,
  type ReadingStrategistCandidateSummary,
} from "./document-reading-strategist-gpt";
