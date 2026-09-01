import {
  applyGroundingDecisionsToFacts,
  buildActiviteGroundingDecisions,
  projectGroundedFactsToActivite,
  type ActiviteFactsGroundingResult,
} from "./activite-facts-projection";
import { deriveDocumentFacts, type DerivationEngineResult } from "./derivation/derivation-engine";
import { buildMergedActiviteFacts } from "./extraction/build-merged-activite-facts";
import { createFactExtractionResult } from "./fact-extraction-result";
import type { FactExtractionResult } from "./fact-extraction-result";
import type { DocumentFact } from "./document-fact";
import type { ActiviteInpiGptData } from "@/lib/documents/gpt";

export type GroundingEngineInput = {
  rawText: string;
  extraction: FactExtractionResult;
  gptData?: ActiviteInpiGptData;
};

export type GroundingEngineResult = {
  /** Final fact store after grounding + derivation. */
  extraction: FactExtractionResult;
  groundedExtraction: FactExtractionResult;
  derivation: DerivationEngineResult;
  activiteProjection?: ActiviteFactsGroundingResult;
  deterministicFacts?: DocumentFact[];
  gptFacts?: DocumentFact[];
  mergeConflicts?: import("./extraction/merge-document-facts").FactMergeConflict[];
};

function emptyDerivation(facts: readonly DocumentFact[]): DerivationEngineResult {
  return {
    facts: [...facts],
    derivedFacts: [],
    steps: [],
  };
}

export class GroundingEngine {
  ground(input: GroundingEngineInput): GroundingEngineResult {
    const { rawText, extraction } = input;
    const trimmedText = rawText.trim();
    if (!trimmedText) {
      const derivation = emptyDerivation(extraction.facts);
      return {
        extraction: { ...extraction, facts: derivation.facts },
        groundedExtraction: extraction,
        derivation,
      };
    }

    const gptData = input.gptData ?? rebuildActiviteGptDataFromFacts(extraction.facts);
    const decisions = buildActiviteGroundingDecisions(gptData, trimmedText);
    const groundedFacts = applyGroundingDecisionsToFacts(
      extraction.facts,
      decisions,
      extraction.documentId,
    );

    const groundedExtraction: FactExtractionResult = {
      ...extraction,
      facts: groundedFacts,
    };

    const derivation = deriveDocumentFacts(groundedFacts);
    const derivedExtraction: FactExtractionResult = {
      ...groundedExtraction,
      facts: derivation.facts,
    };

    const activiteProjection = projectGroundedFactsToActivite(derivedExtraction, gptData);

    return {
      extraction: derivedExtraction,
      groundedExtraction,
      derivation,
      activiteProjection,
    };
  }
}

export function groundActiviteFactExtraction(
  rawText: string,
  gptData: ActiviteInpiGptData,
  documentId = "activite-document",
): GroundingEngineResult {
  const merged = buildMergedActiviteFacts(rawText, gptData, documentId);
  const extraction = createFactExtractionResult({
    documentId,
    extractorId: "activite-fact-pipeline-v1",
    facts: merged.facts,
  });

  const result = new GroundingEngine().ground({ rawText, extraction, gptData });

  return {
    ...result,
    deterministicFacts: merged.deterministicFacts,
    gptFacts: merged.gptFacts,
    mergeConflicts: merged.mergeConflicts,
  };
}

function rebuildActiviteGptDataFromFacts(facts: readonly DocumentFact[]): ActiviteInpiGptData {
  const data: ActiviteInpiGptData = {};
  for (const fact of facts) {
    if (!fact.value) continue;
    switch (fact.type) {
      case "person.name.family":
        data.nom = fact.value;
        break;
      case "person.name.given":
        data.prenom = fact.value;
        break;
      case "registry.siren":
        data.siren = fact.value;
        break;
      case "contact.email":
        data.email = fact.value;
        break;
      case "contact.phone":
        data.telephone = fact.value;
        break;
      case "address.headquarters":
        data.adresseEntrepreneur = fact.value;
        break;
      case "address.personal":
        data.adresseEntrepreneur = fact.value;
        break;
      case "address.establishment":
        data.adresseEtablissement = fact.value;
        break;
      default:
        break;
    }
  }
  return data;
}

export const groundingEngine = new GroundingEngine();
