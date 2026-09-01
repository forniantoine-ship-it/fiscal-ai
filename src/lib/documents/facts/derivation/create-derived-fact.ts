import { createDocumentFact } from "../document-fact";
import type { DocumentFact, FactEvidence } from "../document-fact";
import type { FactType } from "../fact-type-registry";
import type { DerivationRuleId } from "./derivation-rules";

export function createDerivedFactId(
  sourceFactId: string,
  rule: DerivationRuleId,
  type: FactType,
): string {
  return `${sourceFactId}:derived:${rule}:${type}`;
}

export function createDerivedFact(input: {
  type: FactType;
  documentId: string;
  value: string;
  derivationRule: DerivationRuleId;
  derivedFrom: string[];
  sourceFact: DocumentFact;
  evidence?: FactEvidence;
  normalizedValue?: string;
}): DocumentFact {
  const sourceId = input.derivedFrom[0];
  if (!sourceId) {
    throw new Error("createDerivedFact requires at least one derivedFrom fact id");
  }

  return createDocumentFact({
    id: createDerivedFactId(sourceId, input.derivationRule, input.type),
    type: input.type,
    documentId: input.documentId,
    value: input.value,
    normalizedValue: input.normalizedValue,
    status: "proposed",
    origin: "deduction",
    fieldSource: "derived",
    derivedFrom: input.derivedFrom,
    derivationRule: input.derivationRule,
    requiresConfirmation: true,
    evidence: input.evidence ?? input.sourceFact.evidence,
    observedAt: input.sourceFact.observedAt,
  });
}

export function hasDerivedFact(
  facts: readonly DocumentFact[],
  sourceFactId: string,
  rule: DerivationRuleId,
  type: FactType,
): boolean {
  const expectedId = createDerivedFactId(sourceFactId, rule, type);
  return facts.some((fact) => fact.id === expectedId);
}

export function findExtractedFact(
  facts: readonly DocumentFact[],
  type: FactType,
): DocumentFact | undefined {
  return facts.find((fact) => fact.type === type && fact.status === "extracted" && Boolean(fact.value));
}
