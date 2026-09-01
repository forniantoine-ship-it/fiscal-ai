import type { DocumentFact } from "../../document-fact";
import { createDerivedFact, findExtractedFact, hasDerivedFact } from "../create-derived-fact";

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function isValidSiret(value: string): boolean {
  return digitsOnly(value).length === 14;
}

export function deriveSirenFromSiret(
  facts: readonly DocumentFact[],
  derivedFacts: readonly DocumentFact[],
): DocumentFact[] {
  const next: DocumentFact[] = [];
  const allFacts = [...facts, ...derivedFacts];

  if (findExtractedFact(allFacts, "registry.siren")) {
    return next;
  }

  for (const siretFact of facts) {
    if (siretFact.type !== "registry.siret") continue;
    if (siretFact.status !== "extracted") continue;
    if (!siretFact.value || !isValidSiret(siretFact.value)) continue;
    if (hasDerivedFact(allFacts, siretFact.id, "siren_from_siret", "registry.siren")) continue;

    const siretDigits = digitsOnly(siretFact.value);
    const siren = siretDigits.slice(0, 9);

    next.push(
      createDerivedFact({
        type: "registry.siren",
        documentId: siretFact.documentId,
        value: siren,
        derivationRule: "siren_from_siret",
        derivedFrom: [siretFact.id],
        sourceFact: siretFact,
        evidence: siretFact.evidence ?? { snippet: siretFact.value },
      }),
    );
  }

  return next;
}
