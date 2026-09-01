import type { ActiviteInpiGptData } from "@/lib/documents/gpt";

import { adaptActiviteGptToFacts } from "../activite-gpt-to-facts";
import type { DocumentFact } from "../document-fact";
import {
  deterministicInpiRneExtractor,
  extractInpiRneDeterministicFacts,
} from "./inpi-rne/deterministic-inpi-rne-extractor";
import { mergeDocumentFacts, type FactMergeConflict } from "./merge-document-facts";

export function buildMergedActiviteFacts(
  rawText: string,
  gptData: ActiviteInpiGptData,
  documentId: string,
): {
  facts: DocumentFact[];
  deterministicFacts: DocumentFact[];
  gptFacts: DocumentFact[];
  mergeConflicts: FactMergeConflict[];
} {
  const deterministicFacts = deterministicInpiRneExtractor.canHandle(rawText)
    ? extractInpiRneDeterministicFacts(rawText, documentId)
    : [];

  const gptFacts = adaptActiviteGptToFacts(gptData, documentId, rawText);
  const { facts, conflicts } = mergeDocumentFacts(deterministicFacts, gptFacts);

  return {
    facts,
    deterministicFacts,
    gptFacts,
    mergeConflicts: conflicts,
  };
}
