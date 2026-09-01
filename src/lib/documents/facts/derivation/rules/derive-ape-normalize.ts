import type { DocumentFact } from "../../document-fact";
import { createDerivedFact, hasDerivedFact } from "../create-derived-fact";
import { isCanonicalApeCode, normalizeApeCode } from "./ape-normalize";

export function deriveApeNormalize(
  facts: readonly DocumentFact[],
  derivedFacts: readonly DocumentFact[],
): DocumentFact[] {
  const next: DocumentFact[] = [];
  const allFacts = [...facts, ...derivedFacts];

  for (const sourceFact of facts) {
    if (sourceFact.type !== "registry.ape_code") continue;
    if (sourceFact.status !== "extracted") continue;
    if (!sourceFact.value?.trim()) continue;
    if (hasDerivedFact(allFacts, sourceFact.id, "ape_normalize", "registry.ape_code")) continue;

    const normalized = normalizeApeCode(sourceFact.value);
    if (!normalized) continue;
    if (isCanonicalApeCode(sourceFact.value.trim())) continue;

    next.push(
      createDerivedFact({
        type: "registry.ape_code",
        documentId: sourceFact.documentId,
        value: normalized,
        normalizedValue: normalized,
        derivationRule: "ape_normalize",
        derivedFrom: [sourceFact.id],
        sourceFact,
        evidence: sourceFact.evidence ?? { snippet: sourceFact.value },
      }),
    );
  }

  return next;
}
