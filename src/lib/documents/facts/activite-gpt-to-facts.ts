import type { ActiviteInpiGptData } from "@/lib/documents/gpt";

import { resolveGptEntrepreneurAddressFactType } from "./activite-address-semantics";
import { createDocumentFact, createFactId } from "./document-fact";
import type { DocumentFact } from "./document-fact";
import { createFactExtractionResult, type FactExtractionResult } from "./fact-extraction-result";
import type { FactType } from "./fact-type-registry";

export const ACTIVITE_GPT_EXTRACTOR_ID = "activite-gpt-v1";

/** Scalar + establishment GPT fields with a stable 1:1 FactType mapping. */
export const ACTIVITE_GPT_TO_FACT_MAP = {
  nom: "person.name.family",
  prenom: "person.name.given",
  siren: "registry.siren",
  email: "contact.email",
  telephone: "contact.phone",
  adresseEtablissement: "address.establishment",
} as const satisfies Partial<Record<keyof ActiviteInpiGptData, FactType>>;

const GPT_MAPPED_FIELD_KEYS = Object.keys(
  ACTIVITE_GPT_TO_FACT_MAP,
) as (keyof typeof ACTIVITE_GPT_TO_FACT_MAP)[];

function createMissingGptFact(type: FactType, documentId: string): DocumentFact {
  return createDocumentFact({
    id: createFactId(type, documentId),
    type,
    documentId,
    status: "missing",
    origin: "gpt",
    requiresConfirmation: false,
  });
}

function createProposedGptFact(type: FactType, documentId: string, value: string): DocumentFact {
  return createDocumentFact({
    id: createFactId(type, documentId),
    type,
    documentId,
    value,
    status: "proposed",
    origin: "gpt",
    fieldSource: "judgment",
    requiresConfirmation: true,
  });
}

function adaptEntrepreneurAddressFact(
  gptData: ActiviteInpiGptData,
  documentId: string,
  rawText?: string,
): DocumentFact {
  const rawValue = gptData.adresseEntrepreneur?.trim();

  if (!rawValue) {
    return createMissingGptFact("address.personal", documentId);
  }

  const resolvedType = rawText
    ? resolveGptEntrepreneurAddressFactType(rawText, rawValue)
    : null;

  if (resolvedType === "address.personal") {
    return createProposedGptFact(resolvedType, documentId, rawValue);
  }

  return createDocumentFact({
    id: createFactId("address.personal", documentId),
    type: "address.personal",
    documentId,
    status: "missing",
    origin: "gpt",
    rejectedValue: rawValue,
    requiresConfirmation: false,
  });
}

export function adaptActiviteGptToFacts(
  gptData: ActiviteInpiGptData,
  documentId: string,
  rawText?: string,
): DocumentFact[] {
  const facts: DocumentFact[] = [];

  for (const gptField of GPT_MAPPED_FIELD_KEYS) {
    const factType = ACTIVITE_GPT_TO_FACT_MAP[gptField]!;
    const rawValue = gptData[gptField]?.trim();

    if (!rawValue) {
      facts.push(createMissingGptFact(factType, documentId));
      continue;
    }

    facts.push(createProposedGptFact(factType, documentId, rawValue));
  }

  facts.push(adaptEntrepreneurAddressFact(gptData, documentId, rawText));

  return facts;
}

export function adaptActiviteGptToFactExtractionResult(
  gptData: ActiviteInpiGptData,
  documentId: string,
  rawText?: string,
): FactExtractionResult {
  return createFactExtractionResult({
    documentId,
    extractorId: ACTIVITE_GPT_EXTRACTOR_ID,
    facts: adaptActiviteGptToFacts(gptData, documentId, rawText),
  });
}

export function resolveFactForType(
  facts: readonly DocumentFact[],
  type: FactType,
  options?: { entityId?: string; unscopedOnly?: boolean },
): DocumentFact | undefined {
  let candidates = facts.filter((fact) => fact.type === type);
  if (options?.entityId) {
    candidates = candidates.filter((fact) => fact.entityId === options.entityId);
  } else if (options?.unscopedOnly) {
    candidates = candidates.filter((fact) => !fact.entityId);
  }
  if (candidates.length === 0) return undefined;

  const extracted = candidates.find((fact) => fact.status === "extracted" && fact.value);
  if (extracted) return extracted;

  const proposed = candidates.find((fact) => fact.status === "proposed" && fact.value);
  if (proposed) return proposed;

  const rejected = candidates.find((fact) => fact.rejectedValue);
  if (rejected) return rejected;

  return candidates.find((fact) => fact.status === "missing") ?? candidates[0];
}

export function findFactsByType(facts: readonly DocumentFact[], type: FactType): DocumentFact[] {
  return facts.filter((fact) => fact.type === type);
}

export function findActiviteFact(
  facts: readonly DocumentFact[],
  type: FactType,
): DocumentFact | undefined {
  return resolveFactForType(facts, type);
}
