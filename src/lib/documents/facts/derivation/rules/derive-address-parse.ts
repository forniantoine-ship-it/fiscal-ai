import type { DocumentFact } from "../../document-fact";
import { createDerivedFact, hasDerivedFact } from "../create-derived-fact";
import { isAddressParseSourceType } from "../derivation-rules";
import { parseAddressComponents } from "./address-parse";

export function deriveAddressParse(
  facts: readonly DocumentFact[],
  derivedFacts: readonly DocumentFact[],
): DocumentFact[] {
  const next: DocumentFact[] = [];
  const allFacts = [...facts, ...derivedFacts];

  for (const sourceFact of facts) {
    if (!isAddressParseSourceType(sourceFact.type)) continue;
    if (sourceFact.status !== "extracted") continue;
    if (!sourceFact.value?.trim()) continue;

    const parsed = parseAddressComponents(sourceFact.value);
    const evidence = sourceFact.evidence ?? { snippet: sourceFact.value };

    if (parsed.line && !hasDerivedFact(allFacts, sourceFact.id, "address_parse", "address.line")) {
      next.push(
        createDerivedFact({
          type: "address.line",
          documentId: sourceFact.documentId,
          value: parsed.line,
          derivationRule: "address_parse",
          derivedFrom: [sourceFact.id],
          sourceFact,
          evidence,
        }),
      );
    }

    if (
      parsed.postalCode &&
      !hasDerivedFact(allFacts, sourceFact.id, "address_parse", "address.postal_code")
    ) {
      next.push(
        createDerivedFact({
          type: "address.postal_code",
          documentId: sourceFact.documentId,
          value: parsed.postalCode,
          derivationRule: "address_parse",
          derivedFrom: [sourceFact.id],
          sourceFact,
          evidence,
        }),
      );
    }

    if (parsed.city && !hasDerivedFact(allFacts, sourceFact.id, "address_parse", "address.city")) {
      next.push(
        createDerivedFact({
          type: "address.city",
          documentId: sourceFact.documentId,
          value: parsed.city,
          derivationRule: "address_parse",
          derivedFrom: [sourceFact.id],
          sourceFact,
          evidence,
        }),
      );
    }

    if (
      parsed.country &&
      !hasDerivedFact(allFacts, sourceFact.id, "address_parse", "address.country")
    ) {
      next.push(
        createDerivedFact({
          type: "address.country",
          documentId: sourceFact.documentId,
          value: parsed.country,
          derivationRule: "address_parse",
          derivedFrom: [sourceFact.id],
          sourceFact,
          evidence,
        }),
      );
    }
  }

  return next;
}
