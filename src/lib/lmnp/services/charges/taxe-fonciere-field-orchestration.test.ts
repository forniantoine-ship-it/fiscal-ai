import { rankTaxeFonciereAmountCandidates } from "./taxe-fonciere-amount-selection";
import {
  applyTaxeFonciereSemanticArbitration,
  resolveTaxeFonciereFieldAmount,
} from "./taxe-fonciere-field-orchestration";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const ranking = rankTaxeFonciereAmountCandidates([
  { amount: 12_450, nearbyText: "Valeur locative cadastrale : 12 450 EUR" },
  { amount: 842.0, nearbyText: "Net à payer — total des impôts 842,00 EUR" },
]);

const payableId = ranking.deterministicDefault!.candidateId;

const arbitrated = applyTaxeFonciereSemanticArbitration(ranking, {
  semanticChoiceCandidateId: payableId,
  rationale: "Net à payer is the deductible charge, not cadastral base.",
});

assert(arbitrated.arbitration.mode === "semantic_resolved", "semantic resolved");
assert(resolveTaxeFonciereFieldAmount(arbitrated) === 842, "semantic choice resolves amount");

try {
  applyTaxeFonciereSemanticArbitration(ranking, {
    semanticChoiceCandidateId: "invented-id",
    rationale: "invalid",
  });
  throw new Error("expected throw for invented candidate id");
} catch {
  // expected
}

console.log("[taxe-fonciere-field-orchestration.test] all assertions passed");
