import type { ActiviteInpiGptData } from "@/lib/documents/gpt";
import type { ActiviteFieldKey } from "@/components/lmnp/activite/ActiviteProfileFields";
import type { ActiviteFieldProvenanceMap } from "@/lib/lmnp/services/activite-field-provenance";
import type { ActiviteFactProjection } from "@/lib/documents/facts/activite-fact-projection";
import { groundActiviteFactExtraction } from "@/lib/documents/facts/grounding-engine";
import {
  groundGptAddress,
  groundGptEmail,
  groundGptName,
  groundGptSiren,
  groundGptTelephone,
  type GroundingDecision,
} from "@/lib/documents/facts/grounding-decisions";
import {
  findSiretInText,
  isAddressGroundedInText,
  isEmailGroundedInText,
  isExplicitSirenInText,
  isNameGroundedInText,
  isPhoneGroundedInText,
  isSirenGroundedInText,
  normalizePhoneDigits,
} from "@/lib/documents/facts/grounding-text-matchers";

export type ActiviteGptGroundingOutcome = GroundingDecision["outcome"];
export type ActiviteGptGroundingDecision = GroundingDecision;

export type ActiviteGptGroundingResult = {
  groundedData: ActiviteInpiGptData;
  fieldProvenance: ActiviteFieldProvenanceMap;
  acceptedFieldKeys: ActiviteFieldKey[];
  rejectedFieldKeys: ActiviteFieldKey[];
  proposedFieldKeys: ActiviteFieldKey[];
  projection?: ActiviteFactProjection;
};

export {
  findSiretInText,
  groundGptAddress,
  groundGptEmail,
  groundGptName,
  groundGptSiren,
  groundGptTelephone,
  isAddressGroundedInText,
  isEmailGroundedInText,
  isExplicitSirenInText,
  isNameGroundedInText,
  isPhoneGroundedInText,
  isSirenGroundedInText,
  normalizePhoneDigits,
};

/**
 * Deterministic OCR grounding for GPT Activité / INPI extraction.
 * Uses the same normalized OCR text that was sent to GPT (`runActiviteGptPipeline.rawText`).
 *
 * Pipeline: ActiviteInpiGptData → DocumentFact[] → GroundingEngine → projection Activité.
 */
export function groundActiviteGptExtraction(
  rawText: string,
  gptData: ActiviteInpiGptData,
): ActiviteGptGroundingResult {
  const { activiteProjection } = groundActiviteFactExtraction(rawText, gptData);
  if (!activiteProjection) {
    return {
      groundedData: {},
      fieldProvenance: {},
      acceptedFieldKeys: [],
      rejectedFieldKeys: [],
      proposedFieldKeys: [],
    };
  }

  return {
    groundedData: activiteProjection.groundedData,
    fieldProvenance: activiteProjection.fieldProvenance,
    acceptedFieldKeys: activiteProjection.acceptedFieldKeys,
    rejectedFieldKeys: activiteProjection.rejectedFieldKeys,
    proposedFieldKeys: activiteProjection.proposedFieldKeys,
    projection: activiteProjection.projection,
  };
}
