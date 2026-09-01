import {
  rankInsuranceAmountCandidates,
  scoreInsuranceCandidate,
  selectBestInsuranceCandidate,
} from "./insurance-amount-selection";
import { INSURANCE_ANNUAL_PREMIUM_FIELD, resolveInsuranceFieldAmount } from "./insurance-field-orchestration";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const capitalVsCotisation = [
  {
    amount: 6000,
    nearbyText: "Capital mobilier dans l'habitation : 6 000,00 EUR",
  },
  {
    amount: 428.5,
    nearbyText: "Cotisation annuelle TTC : 428,50 EUR",
  },
];

const ranking = rankInsuranceAmountCandidates(capitalVsCotisation);
assert(ranking.targetField === INSURANCE_ANNUAL_PREMIUM_FIELD, "target field");
assert(ranking.deterministicDefault?.amount === 428.5, "deterministic default is cotisation");
assert(resolveInsuranceFieldAmount(ranking) === 428.5, "resolve uses deterministic default");

const capital = ranking.candidates.find((candidate) => candidate.amount === 6000);
assert(capital?.hardExcluded === true, "capital mobilier hard excluded");
assert((capital?.score ?? 0) < 0, "capital mobilier has negative score");

const legacyScored = selectBestInsuranceCandidate(capitalVsCotisation);
const legacyWinner = legacyScored.find((candidate) => candidate.selected);
assert(legacyWinner?.amount === 428.5, "legacy API marks deterministic rank winner");

const cotisationOnly = scoreInsuranceCandidate({
  amount: 120,
  nearbyText: "Prime annuelle TTC 120,00 €",
});
assert(cotisationOnly.finalScore > 0, "prime annuelle and prime ttc contribute score");
assert(cotisationOnly.negativeSignals.length === 0, "no negative signals");

const annualVsTaxes = rankInsuranceAmountCandidates([
  { amount: 1.34, nearbyText: "Taxes TTC : 1,34 EUR" },
  { amount: 428.5, nearbyText: "Cotisation annuelle TTC : 428,50 EUR" },
]);
assert(annualVsTaxes.deterministicDefault?.amount === 428.5, "annual premium beats taxes line");
const taxesOnly = annualVsTaxes.candidates.find((c) => c.amount === 1.34);
assert(taxesOnly?.hardExcluded === false, "taxes line is soft-negative only, not hard excluded");
assert((taxesOnly?.score ?? 0) < (annualVsTaxes.deterministicDefault?.score ?? 0), "taxes score below annual");

const annualVsComponents = rankInsuranceAmountCandidates([
  { amount: 12.5, nearbyText: "Protection juridique : 12,50 EUR" },
  { amount: 8.2, nearbyText: "Contribution attentat : 8,20 EUR" },
  { amount: 512, nearbyText: "Prime annuelle TTC : 512,00 EUR" },
]);
assert(annualVsComponents.deterministicDefault?.amount === 512, "prime annuelle beats riders");

const annualVsProrata = rankInsuranceAmountCandidates([
  { amount: 214, nearbyText: "Cotisation prorata TTC : 214,00 EUR" },
  { amount: 428.5, nearbyText: "Cotisation annuelle TTC : 428,50 EUR" },
]);
assert(annualVsProrata.deterministicDefault?.amount === 428.5, "cotisation annuelle beats prorata");

const annualWithBreakdown = rankInsuranceAmountCandidates([
  {
    amount: 4.0,
    nearbyText: "Protection juridique : 4,00 EUR",
  },
  {
    amount: 80.15,
    nearbyText:
      "Cotisation annuelle TTC : 80,15 EUR Protection juridique : 4,00 EUR Contribution attentat : 2,00 EUR",
  },
]);
assert(
  annualWithBreakdown.deterministicDefault?.amount === 80.15,
  "annual premium stays eligible with soft breakdown in same OCR window",
);
const premiumRow = annualWithBreakdown.candidates.find((c) => c.amount === 80.15);
assert(premiumRow?.hardExcluded === false, "primary annual signal prevents soft-negative hard exclusion");
assert(premiumRow?.positiveSignals.some((s) => s.includes("cotisation annuelle")), "primary signal kept");
assert((premiumRow?.score ?? 0) > 0, "soft negatives waived when primary annual signal present");

console.log("[insurance-amount-selection.test] all assertions passed");
