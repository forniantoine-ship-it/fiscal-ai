import { rankInsuranceAmountCandidates } from "./insurance-amount-selection";
import {
  applySemanticArbitration,
  resolveInsuranceFieldAmount,
} from "./insurance-field-orchestration";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const ranking = rankInsuranceAmountCandidates([
  { amount: 6000, nearbyText: "Capital mobilier : 6 000 EUR" },
  { amount: 428.5, nearbyText: "Cotisation annuelle TTC : 428,50 EUR" },
]);

const premiumId = ranking.deterministicDefault!.candidateId;

const arbitrated = applySemanticArbitration(ranking, {
  semanticChoiceCandidateId: premiumId,
  rationale: "Cotisation annuelle is the deductible premium, not insured capital.",
});

assert(arbitrated.arbitration.mode === "semantic_resolved", "semantic resolved");
assert(resolveInsuranceFieldAmount(arbitrated) === 428.5, "semantic choice resolves amount");

try {
  applySemanticArbitration(ranking, {
    semanticChoiceCandidateId: "invented-id",
    rationale: "invalid",
  });
  throw new Error("expected throw for invented candidate id");
} catch {
  // expected
}

console.log("[insurance-field-orchestration.test] all assertions passed");
