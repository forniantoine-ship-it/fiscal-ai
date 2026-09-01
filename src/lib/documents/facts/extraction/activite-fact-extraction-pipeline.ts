export { buildMergedActiviteFacts } from "./build-merged-activite-facts";
export { mergeDocumentFacts, type FactMergeConflict } from "./merge-document-facts";
export {
  deterministicInpiRneExtractor,
  extractInpiRneDeterministicFacts,
  DETERMINISTIC_INPI_RNE_EXTRACTOR_ID,
} from "./inpi-rne/deterministic-inpi-rne-extractor";
export type { DeterministicFactExtractor } from "./deterministic-fact-extractor";
