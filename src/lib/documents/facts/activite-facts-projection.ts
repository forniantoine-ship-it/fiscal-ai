import type { ActiviteInpiGptData } from "@/lib/documents/gpt";
import type { ActiviteFieldKey } from "@/components/lmnp/activite/ActiviteProfileFields";
import {
  ACTIVITE_GPT_PREFILLABLE_FIELDS,
  missingInpiFieldProvenance,
  type ActiviteFieldProvenanceMap,
} from "@/lib/lmnp/services/activite-field-provenance";

import { ACTIVITE_GPT_TO_FACT_MAP, resolveFactForType } from "./activite-gpt-to-facts";
import {
  hasExplicitEstablishmentAddressEvidence,
  resolveGptEntrepreneurAddressFactType,
} from "./activite-address-semantics";
import {
  projectDocumentFactsToActivite,
  type ActiviteFactProjection,
} from "./activite-fact-projection";
import { DETERMINISTIC_INPI_RNE_EXTRACTOR_ID } from "./extraction/inpi-rne/deterministic-inpi-rne-extractor";
import { createDocumentFact, createFactId, missingDocumentFact } from "./document-fact";
import type { DocumentFact } from "./document-fact";
import {
  hasDeterministicSiretFacts,
  isPreservedDeterministicFact,
} from "./extraction/merge-document-facts";
import type { FactExtractionResult } from "./fact-extraction-result";
import type { FactType } from "./fact-type-registry";
import {
  applyGroundingDecision,
  groundGptAddress,
  groundGptEmail,
  groundGptName,
  groundGptSiren,
  groundGptTelephone,
  groundSiretFromOcr,
  type GroundingDecision,
} from "./grounding-decisions";

const GPT_FIELD_FROM_ACTIVITE: Partial<Record<ActiviteFieldKey, keyof ActiviteInpiGptData>> = {
  lastName: "nom",
  firstName: "prenom",
  siren: "siren",
  email: "email",
  telephone: "telephone",
  establishmentAddress: "adresseEtablissement",
  establishmentCity: "adresseEtablissement",
  establishmentPostalCode: "adresseEtablissement",
};

function isDeterministicScopedAddress(fact: DocumentFact | undefined): boolean {
  return Boolean(
    fact &&
      fact.extractorId === DETERMINISTIC_INPI_RNE_EXTRACTOR_ID &&
      (fact.type === "address.headquarters" || fact.type === "address.establishment") &&
      Boolean(fact.entityId || fact.scope),
  );
}

function buildGroundedDataFromProjection(
  facts: readonly DocumentFact[],
  projection: ActiviteFactProjection,
): ActiviteInpiGptData {
  const groundedData: ActiviteInpiGptData = {};

  if (projection.formValues.lastName) groundedData.nom = projection.formValues.lastName;
  if (projection.formValues.firstName) groundedData.prenom = projection.formValues.firstName;
  if (projection.formValues.siren) groundedData.siren = projection.formValues.siren;
  if (projection.formValues.email) groundedData.email = projection.formValues.email;
  if (projection.formValues.telephone) groundedData.telephone = projection.formValues.telephone;

  if (shouldExposeEstablishmentInGroundedData(facts, projection)) {
    groundedData.adresseEtablissement = [
      projection.formValues.establishmentAddress,
      [projection.formValues.establishmentPostalCode, projection.formValues.establishmentCity]
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join("\n");
  }

  return groundedData;
}

function shouldExposeEstablishmentInGroundedData(
  facts: readonly DocumentFact[],
  projection: ActiviteFactProjection,
): boolean {
  if (!projection.formValues.establishmentAddress) return false;

  const unscoped = resolveFactForType(facts, "address.establishment", { unscopedOnly: true });
  if (unscoped?.value && hasExplicitEstablishmentAddressEvidence(unscoped)) return true;

  return false;
}

export type ActiviteFactsGroundingResult = {
  extraction: FactExtractionResult;
  groundedData: ActiviteInpiGptData;
  fieldProvenance: ActiviteFieldProvenanceMap;
  acceptedFieldKeys: ActiviteFieldKey[];
  rejectedFieldKeys: ActiviteFieldKey[];
  proposedFieldKeys: ActiviteFieldKey[];
  projection: ActiviteFactProjection;
};

export function projectGroundedFactsToActivite(
  extraction: FactExtractionResult,
  gptData: ActiviteInpiGptData,
): ActiviteFactsGroundingResult {
  const projection = projectDocumentFactsToActivite(extraction);
  const groundedData = buildGroundedDataFromProjection(extraction.facts, projection);

  void gptData;

  return {
    extraction,
    groundedData,
    fieldProvenance: projection.fieldProvenance,
    acceptedFieldKeys: projection.acceptedFieldKeys,
    rejectedFieldKeys: projection.rejectedFieldKeys,
    proposedFieldKeys: projection.proposedFieldKeys,
    projection,
  };
}

function updateFactFromDecision(
  fact: DocumentFact,
  decision: GroundingDecision | null,
): DocumentFact {
  if (!decision) {
    return missingDocumentFact(fact.type, fact.documentId);
  }

  const applied = applyGroundingDecision(decision);

  return createDocumentFact({
    ...fact,
    value: applied.value,
    status: applied.status,
    origin: applied.origin,
    fieldSource: applied.fieldSource,
    evidence: applied.evidence ? { snippet: applied.evidence } : undefined,
    rejectedValue: applied.rejectedValue,
    requiresConfirmation: applied.status === "proposed",
  });
}

export function buildActiviteGroundingDecisions(
  gptData: ActiviteInpiGptData,
  rawText: string,
): Partial<Record<FactType, GroundingDecision | null>> {
  const entrepreneurAddressDecision = gptData.adresseEntrepreneur?.trim()
    ? groundGptAddress(gptData.adresseEntrepreneur, rawText, "adresseEntrepreneur")
    : null;

  const decisions: Partial<Record<FactType, GroundingDecision | null>> = {
    "person.name.family": groundGptName(gptData.nom, rawText, "nom"),
    "person.name.given": groundGptName(gptData.prenom, rawText, "prenom"),
    "registry.siren": groundGptSiren(gptData.siren, rawText),
    "registry.siret": groundSiretFromOcr(rawText),
    "contact.email": groundGptEmail(gptData.email, rawText),
    "contact.phone": groundGptTelephone(gptData.telephone, rawText),
    "address.establishment": groundGptAddress(
      gptData.adresseEtablissement,
      rawText,
      "adresseEtablissement",
    ),
  };

  if (resolveGptEntrepreneurAddressFactType(rawText, gptData.adresseEntrepreneur) === "address.personal") {
    decisions["address.personal"] = entrepreneurAddressDecision;
  }

  return decisions;
}

export function applyGroundingDecisionsToFacts(
  facts: DocumentFact[],
  decisions: Partial<Record<FactType, GroundingDecision | null>>,
  documentId: string,
): DocumentFact[] {
  const siretFactId = createFactId("registry.siret", documentId);
  const siretDecision = decisions["registry.siret"];

  const nextFacts = facts.map((fact) => {
    if (isPreservedDeterministicFact(fact)) return fact;

    const decision = decisions[fact.type as keyof typeof decisions];
    if (decision === undefined) return fact;
    return updateFactFromDecision(fact, decision ?? null);
  });

  const hasSiretFact = nextFacts.some((fact) => fact.type === "registry.siret");
  if (!hasSiretFact && siretDecision && !hasDeterministicSiretFacts(facts)) {
    nextFacts.push(
      updateFactFromDecision(
        createDocumentFact({
          id: siretFactId,
          type: "registry.siret",
          documentId,
          status: "missing",
          origin: "document",
          requiresConfirmation: false,
        }),
        siretDecision,
      ),
    );
  }

  return nextFacts;
}

export { ACTIVITE_GPT_TO_FACT_MAP, GPT_FIELD_FROM_ACTIVITE, isDeterministicScopedAddress };
