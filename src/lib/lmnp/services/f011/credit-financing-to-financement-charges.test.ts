import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { excludedLoanIdsFromFinancing, mapCreditFinancingToFinancementCharges } from "./credit-financing-to-financement-charges";
import type { CreditFinancingData } from "@/lib/lmnp/types";

const BASE_LOAN: CreditFinancingData["loans"][0] = {
  id: "loan-1",
  bank: "Crédit Foncier",
  loanType: "Prêt amortissable",
  borrowedAmount: 120000,
  rate: 2,
  durationMonths: 240,
  monthlyPayment: 950,
  insurance: 20,
  fees: 0,
  startDate: "2022-01-15",
  firstPaymentDate: "2022-01-01",
  remainingCapital: 118000,
};

function financingWith(loans: CreditFinancingData["loans"]): CreditFinancingData {
  return {
    loans,
    summary: { fiscalYearLabel: "2022", annualInterest: 0, annualInsurance: 0, remainingCapital: 0 },
    installments: [],
  };
}

describe("F-011 — Cycle 4 §11 : le trou financementCharges côté Tunnel A", () => {
  it("un crédit confirmé avec date de mise en service connue produit financementCharges", () => {
    const { financementCharges, excludedLoanIds } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([BASE_LOAN]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(excludedLoanIds.length, 0);
    assert.equal(financementCharges.exerciceFiscal, 2022);
    assert.ok(financementCharges.totalChargesFinancementExercice > 0, "n'est plus 0 € comme avant ce correctif");
  });

  it("l'exercice fiscal écrit est celui du dossier (workspace.fiscalYear.year)", () => {
    // F-006/aggregateFiscalInputs attendent `exerciceFiscal` = `workspace.fiscalYear.year`
    // tel quel. Depuis l'alignement du modèle d'années, `revenueYear` du tunnel crédit
    // vaut aussi l'exercice (voir f011-revenue-year-model.test.ts) : les deux années
    // ne peuvent plus diverger.
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([BASE_LOAN]),
      exerciceFiscal: 2023, // = workspace.fiscalYear.year
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(financementCharges.exerciceFiscal, 2023);
  });

  it("un prêt sans date de première mensualité est exclu, jamais daté arbitrairement", () => {
    const incompleteLoan = { ...BASE_LOAN, id: "loan-2", firstPaymentDate: "" };
    const { financementCharges, excludedLoanIds } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([BASE_LOAN, incompleteLoan]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.deepEqual(excludedLoanIds, ["loan-2"]);
    assert.equal(financementCharges.prets.length, 1);
    assert.equal(financementCharges.prets[0]?.pretId, "loan-1");
  });

  it("le type de prêt inconnu retombe sur amortissable — jamais in fine par défaut (sous-estimerait moins qu'une surestimation)", () => {
    const ambiguousLoan = { ...BASE_LOAN, loanType: "Prêt travaux" };
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([ambiguousLoan]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(financementCharges.prets[0]?.typePret, "amortissable");
  });

  it("un texte 'in fine' explicite est respecté, jamais écrasé par le défaut", () => {
    const inFineLoan = { ...BASE_LOAN, loanType: "Prêt in fine" };
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([inFineLoan]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(financementCharges.prets[0]?.typePret, "in_fine");
    assert.equal(financementCharges.prets[0]?.capitalRembourseExercice, 0);
  });

  it("aucun prêt confirmé (dossier 'sans crédit') → financementCharges vide, pas d'erreur", () => {
    const { financementCharges, excludedLoanIds } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(financementCharges.totalChargesFinancementExercice, 0);
    assert.deepEqual(excludedLoanIds, []);
  });

  it("NEXT-3 (blocker fix) — `creditFinancing.loans[].insurance` est déjà l'unité canonique ANNUELLE : transport pur, AUCUNE conversion dans ce mapper", () => {
    // BASE_LOAN.insurance = 240 (divisible par 12 sans reliquat d'arrondi
    // mensuel — `applyLoanInsurance` répartit /12 puis resomme) : à ce niveau
    // (mapper fiscal), c'est déjà une valeur ANNUELLE canonique (normalisée
    // en amont par credit-profile.ts pour Tunnel A, ou écrite directement en
    // annuel par le nouvel assistant F011) — jamais une valeur mensuelle. Le
    // mapper ne doit JAMAIS multiplier par 12 : un audit contradictoire a
    // démontré qu'un ×12 local ici provoquait une surestimation ×12 pour les
    // prêts confirmés par le nouvel assistant F011 (qui écrit déjà en annuel).
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([{ ...BASE_LOAN, insurance: 240 }]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(
      financementCharges.totalAssurance,
      240,
      "transport pur : 240 (canonique annuel) → 240 au moteur, jamais 2880",
    );
  });

  it("NEXT-3 — sans assurance saisie, aucune valeur n'est inventée", () => {
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([{ ...BASE_LOAN, insurance: 0 }]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(financementCharges.totalAssurance, 0);
  });

  it("NEXT-3 — totalAssurancePreExploitation (déjà calculé par le moteur) est désormais transmis", () => {
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([BASE_LOAN]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(typeof financementCharges.totalAssurancePreExploitation, "number");
  });

  it("Case F/G — frais de dossier/garantie sans réponse à « souscrit cette année ? » (souscritCetExercice absent) restent non déduits, jamais inventés", () => {
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([{ ...BASE_LOAN, loanApplicationFees: 800, loanGuaranteeFees: 500 }]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(
      financementCharges.prets[0]?.fraisDossierDeductibles,
      0,
      "le moteur n'accorde ce montant que si anneeSouscription === exerciceFiscal — jamais inventé sans réponse",
    );
    assert.equal(financementCharges.prets[0]?.garantieDeductible, 0);
  });

  it("Case B — frais de dossier > 0 + souscritCetExercice: true → déduit exactement une fois", () => {
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([{ ...BASE_LOAN, loanApplicationFees: 800, souscritCetExercice: true }]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(financementCharges.prets[0]?.fraisDossierDeductibles, 800);
    assert.equal(financementCharges.prets[0]?.garantieDeductible, 0);
  });

  it("Case C — frais de garantie > 0 + souscritCetExercice: true → déduit exactement une fois", () => {
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([{ ...BASE_LOAN, loanGuaranteeFees: 500, souscritCetExercice: true }]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(financementCharges.prets[0]?.garantieDeductible, 500);
    assert.equal(financementCharges.prets[0]?.fraisDossierDeductibles, 0);
  });

  it("Case D — les deux frais > 0 + souscritCetExercice: true → tous deux déduits, sans double comptage l'un sur l'autre", () => {
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([{ ...BASE_LOAN, loanApplicationFees: 800, loanGuaranteeFees: 500, souscritCetExercice: true }]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(financementCharges.prets[0]?.fraisDossierDeductibles, 800);
    assert.equal(financementCharges.prets[0]?.garantieDeductible, 500);
  });

  it("Case E — frais > 0 + souscritCetExercice: false (répondu, prêt d'un exercice antérieur) → non déductibles pour cet exercice", () => {
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([{ ...BASE_LOAN, loanApplicationFees: 800, loanGuaranteeFees: 500, souscritCetExercice: false }]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(financementCharges.prets[0]?.fraisDossierDeductibles, 0);
    assert.equal(financementCharges.prets[0]?.garantieDeductible, 0);
  });

  it("Case J — multi-prêts : un prêt répondu ne contamine jamais un prêt non répondu, et réciproquement", () => {
    const loanA = { ...BASE_LOAN, id: "loan-A", loanApplicationFees: 800, souscritCetExercice: true };
    const loanB = { ...BASE_LOAN, id: "loan-B", loanApplicationFees: 600, souscritCetExercice: undefined };
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([loanA, loanB]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    const byId = Object.fromEntries(financementCharges.prets.map((p) => [p.pretId, p.fraisDossierDeductibles]));
    assert.equal(byId["loan-A"], 800, "loan-A a répondu true — déduit");
    assert.equal(byId["loan-B"], 0, "loan-B n'a pas répondu — jamais déduit ni contaminé par loan-A");
  });

  it("aucun double comptage : ajouter frais de dossier/garantie ne modifie jamais les intérêts déjà calculés", () => {
    const before = mapCreditFinancingToFinancementCharges({
      financing: financingWith([BASE_LOAN]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    const after = mapCreditFinancingToFinancementCharges({
      financing: financingWith([{ ...BASE_LOAN, loanApplicationFees: 800, loanGuaranteeFees: 500, souscritCetExercice: true }]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(
      before.financementCharges.totalInteretsEmprunt,
      after.financementCharges.totalInteretsEmprunt,
      "les intérêts sont indépendants des frais de dossier/garantie, jamais recalculés/doublés",
    );
  });

  it("NEXT-3 — multi-prêts : l'assurance (canonique annuelle) d'un prêt exclu (date manquante) ne contamine jamais le prêt valide", () => {
    const validLoan = { ...BASE_LOAN, id: "loan-valid", insurance: 300 };
    const excludedLoan = { ...BASE_LOAN, id: "loan-excluded", insurance: 9999, firstPaymentDate: "" };
    const { financementCharges, excludedLoanIds } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([validLoan, excludedLoan]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.deepEqual(excludedLoanIds, ["loan-excluded"]);
    assert.equal(financementCharges.prets.length, 1);
    assert.equal(
      financementCharges.totalAssurance,
      300,
      "transport pur du prêt valide, jamais l'assurance du prêt exclu (9999) mélangée",
    );
  });

  it("NEXT-3 — deux prêts valides avec assurances (canoniques annuelles) différentes : sommées correctement, sans contamination d'ID", () => {
    const loanA = { ...BASE_LOAN, id: "loan-A", insurance: 240, borrowedAmount: 100000 };
    const loanB = { ...BASE_LOAN, id: "loan-B", insurance: 480, borrowedAmount: 150000 };
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([loanA, loanB]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(financementCharges.totalAssurance, 720, "240+480, transport pur, jamais ×12 supplémentaire");
    const byId = Object.fromEntries(financementCharges.prets.map((p) => [p.pretId, p.assuranceEmpruntExercice]));
    assert.equal(byId["loan-A"], 240);
    assert.equal(byId["loan-B"], 480);
  });

  it("NEXT-3 — l'ajout de l'assurance ne modifie pas les intérêts déjà correctement calculés (pas de double comptage)", () => {
    const before = mapCreditFinancingToFinancementCharges({
      financing: financingWith([{ ...BASE_LOAN, insurance: 0 }]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    const after = mapCreditFinancingToFinancementCharges({
      financing: financingWith([{ ...BASE_LOAN, insurance: 240 }]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(
      before.financementCharges.totalInteretsEmprunt,
      after.financementCharges.totalInteretsEmprunt,
      "les intérêts sont indépendants de l'assurance, jamais recalculés/doublés",
    );
  });

  it("NEXT-3 (blocker fix) — TEST déterminant : une valeur canonique déjà annuelle (écrite par le nouvel assistant F011) n'est jamais reconvertie ×12", () => {
    // Reproduit exactement ce que F011FinancementAssistantPanel.tsx écrit :
    // insurance = loan.assuranceAnnuelle (déjà annuel), jamais mensuel.
    const loanFromNewAssistant = { ...BASE_LOAN, id: "loan-f011", insurance: 300 };
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([loanFromNewAssistant]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(
      financementCharges.totalAssurance,
      300,
      "jamais 3600 (300×12) — c'est exactement le blocker identifié par l'audit contradictoire NEXT-3",
    );
  });
});

describe("F011 fees/guarantee V1 fix — excludedLoanIdsFromFinancing() étendu (complétude)", () => {
  it("Case A — fees = 0, souscritCetExercice jamais répondu → jamais exclu (le fait est hors-sujet)", () => {
    const ids = excludedLoanIdsFromFinancing(financingWith([{ ...BASE_LOAN, loanApplicationFees: 0, loanGuaranteeFees: 0 }]));
    assert.deepEqual(ids, []);
  });

  it("Case F/G — fees > 0 + souscritCetExercice absent (dossier ancien ou jamais répondu) → exclu/incomplet", () => {
    const ids = excludedLoanIdsFromFinancing(financingWith([{ ...BASE_LOAN, loanApplicationFees: 800 }]));
    assert.deepEqual(ids, ["loan-1"]);
  });

  it("Case B/D — fees > 0 + souscritCetExercice: true → complet, jamais exclu", () => {
    const ids = excludedLoanIdsFromFinancing(
      financingWith([{ ...BASE_LOAN, loanApplicationFees: 800, loanGuaranteeFees: 500, souscritCetExercice: true }]),
    );
    assert.deepEqual(ids, []);
  });

  it("Case E — fees > 0 + souscritCetExercice: false (répondu) → complet, jamais exclu", () => {
    const ids = excludedLoanIdsFromFinancing(financingWith([{ ...BASE_LOAN, loanApplicationFees: 800, souscritCetExercice: false }]));
    assert.deepEqual(ids, []);
  });

  it("préserve intégralement l'exclusion NEXT-2 (firstPaymentDate manquante), jamais remplacée", () => {
    const ids = excludedLoanIdsFromFinancing(financingWith([{ ...BASE_LOAN, firstPaymentDate: "" }]));
    assert.deepEqual(ids, ["loan-1"], "toujours exclu pour date manquante, indépendamment des frais");
  });

  it("Case J — multi-prêts : isolation complète entre un prêt complet et un prêt incomplet", () => {
    const loanA = { ...BASE_LOAN, id: "loan-A", loanApplicationFees: 800, souscritCetExercice: true };
    const loanB = { ...BASE_LOAN, id: "loan-B", loanApplicationFees: 600, souscritCetExercice: undefined };
    assert.deepEqual(excludedLoanIdsFromFinancing(financingWith([loanA, loanB])), ["loan-B"]);

    const loanBAnswered = { ...loanB, souscritCetExercice: false };
    assert.deepEqual(
      excludedLoanIdsFromFinancing(financingWith([loanA, loanBAnswered])),
      [],
      "répondre false à loan-B le rend complet, loan-A reste inchangé",
    );
  });
});

// K — vérification au niveau des types : `dateMiseEnService` est un `string`
// requis, pas `string | undefined`. Le compilateur interdit donc à tout
// appelant d'omettre la précondition Cycle 1 — ce n'est pas une convention,
// c'est imposé par le type lui-même.
function _typeLevelCheck_dateMiseEnServiceEstRequise() {
  // @ts-expect-error — dateMiseEnService manquant doit être un refus de compilation.
  mapCreditFinancingToFinancementCharges({ financing: financingWith([]), exerciceFiscal: 2022 });
}
void _typeLevelCheck_dateMiseEnServiceEstRequise;
