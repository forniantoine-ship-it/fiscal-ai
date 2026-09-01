import type { DocumentFact } from "../document-fact";
import { createDocumentFact, createFactId } from "../document-fact";
import type { FactType } from "../fact-type-registry";
import { DETERMINISTIC_INPI_RNE_EXTRACTOR_ID } from "./inpi-rne/deterministic-inpi-rne-extractor";

export type FactMergeConflict = {
  type: FactType;
  deterministicFactId: string;
  gptFactId: string;
  deterministicValue: string;
  gptValue: string;
};

export type MergeDocumentFactsResult = {
  facts: DocumentFact[];
  conflicts: FactMergeConflict[];
};

const SINGLETON_GPT_TYPES: FactType[] = [
  "person.name.family",
  "person.name.given",
  "registry.siren",
  "contact.email",
  "contact.phone",
  "address.headquarters",
  "address.personal",
  "address.establishment",
];

function isDeterministicExtracted(fact: DocumentFact): boolean {
  return (
    fact.extractorId === DETERMINISTIC_INPI_RNE_EXTRACTOR_ID &&
    fact.status === "extracted" &&
    Boolean(fact.value)
  );
}

function normalizeComparable(value: string, type: FactType): string {
  if (type === "registry.siren" || type === "registry.siret") {
    return value.replace(/\D/g, "");
  }
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findDeterministicSingleton(
  deterministicFacts: readonly DocumentFact[],
  type: FactType,
): DocumentFact | undefined {
  return deterministicFacts.find(
    (fact) => fact.type === type && !fact.entityId && isDeterministicExtracted(fact),
  );
}

export function mergeDocumentFacts(
  deterministicFacts: readonly DocumentFact[],
  gptFacts: readonly DocumentFact[],
): MergeDocumentFactsResult {
  const merged: DocumentFact[] = [...deterministicFacts];
  const conflicts: FactMergeConflict[] = [];

  for (const gptFact of gptFacts) {
    if (!SINGLETON_GPT_TYPES.includes(gptFact.type)) continue;

    const deterministic = findDeterministicSingleton(deterministicFacts, gptFact.type);
    if (deterministic) {
      if (gptFact.value) {
        const sameValue =
          normalizeComparable(deterministic.value ?? "", gptFact.type) ===
          normalizeComparable(gptFact.value, gptFact.type);
        if (!sameValue) {
          conflicts.push({
            type: gptFact.type,
            deterministicFactId: deterministic.id,
            gptFactId: gptFact.id,
            deterministicValue: deterministic.value ?? "",
            gptValue: gptFact.value,
          });
          merged.push(
            createDocumentFact({
              ...gptFact,
              status: "proposed",
              origin: "gpt",
              fieldSource: "judgment",
              conflictWith: [deterministic.id],
              requiresConfirmation: true,
            }),
          );
        }
      }
      continue;
    }

    merged.push(gptFact);
  }

  return { facts: merged, conflicts };
}

export function hasDeterministicSiretFacts(facts: readonly DocumentFact[]): boolean {
  return facts.some((fact) => fact.type === "registry.siret" && isDeterministicExtracted(fact));
}

export function isPreservedDeterministicFact(fact: DocumentFact): boolean {
  return isDeterministicExtracted(fact);
}

export function createMissingGptSlotFacts(
  gptFacts: readonly DocumentFact[],
  documentId: string,
  deterministicFacts: readonly DocumentFact[],
): DocumentFact[] {
  const missingSlots: DocumentFact[] = [];

  for (const gptFact of gptFacts) {
    if (gptFact.value) continue;
    if (findDeterministicSingleton(deterministicFacts, gptFact.type)) continue;
    if (gptFact.status !== "missing") continue;

    missingSlots.push(
      createDocumentFact({
        id: createFactId(gptFact.type, documentId, "gpt-missing"),
        type: gptFact.type,
        documentId,
        status: "missing",
        origin: "gpt",
        extractorId: gptFact.extractorId,
        requiresConfirmation: false,
      }),
    );
  }

  return missingSlots;
}
