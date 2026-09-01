import type { DocumentFact } from "../document-fact";
import type { DerivationRuleId } from "./derivation-rules";
import { deriveAddressParse } from "./rules/derive-address-parse";
import { deriveApeNormalize } from "./rules/derive-ape-normalize";
import { deriveSirenFromSiret } from "./rules/siren-from-siret";

export type DerivationStep = {
  rule: DerivationRuleId;
  derivedFacts: DocumentFact[];
};

export type DerivationEngineResult = {
  facts: DocumentFact[];
  derivedFacts: DocumentFact[];
  steps: DerivationStep[];
};

type DerivationRuleFn = (
  facts: readonly DocumentFact[],
  derivedFacts: readonly DocumentFact[],
) => DocumentFact[];

const DERIVATION_PIPELINE: DerivationRuleFn[] = [
  deriveSirenFromSiret,
  deriveAddressParse,
  deriveApeNormalize,
];

const RULE_IDS: DerivationRuleId[] = [
  "siren_from_siret",
  "address_parse",
  "ape_normalize",
];

export class DerivationEngine {
  derive(facts: readonly DocumentFact[]): DerivationEngineResult {
    const derivedFacts: DocumentFact[] = [];
    const steps: DerivationStep[] = [];

    for (let index = 0; index < DERIVATION_PIPELINE.length; index++) {
      const rule = DERIVATION_PIPELINE[index]!;
      const ruleId = RULE_IDS[index]!;
      const stepDerived = rule(facts, derivedFacts);
      if (stepDerived.length > 0) {
        derivedFacts.push(...stepDerived);
        steps.push({ rule: ruleId, derivedFacts: stepDerived });
      }
    }

    return {
      facts: [...facts, ...derivedFacts],
      derivedFacts,
      steps,
    };
  }
}

export const derivationEngine = new DerivationEngine();

export function deriveDocumentFacts(facts: readonly DocumentFact[]): DerivationEngineResult {
  return derivationEngine.derive(facts);
}
