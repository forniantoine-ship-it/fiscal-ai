import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mapCreditFinancingToFinancementCharges } from "./credit-financing-to-financement-charges";
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

  it("l'exercice fiscal écrit est celui du dossier (workspace.fiscalYear.year), jamais `revenueYear` (année-1)", () => {
    // Piège identifié en amont de ce cycle : CreditDocumentStep calcule un
    // `revenueYear` = année de déclaration - 1 pour son propre usage interne,
    // mais F-006/aggregateFiscalInputs attendent `exerciceFiscal` = l'année du
    // dossier telle quelle. Utiliser `revenueYear` ici aurait produit un
    // `financementCharges.exerciceFiscal` désynchronisé de `workspace.fiscalYear.year`
    // et déclenché l'anomalie de cohérence d'exercice dans aggregateFiscalInputs.
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([BASE_LOAN]),
      exerciceFiscal: 2023, // = workspace.fiscalYear.year, PAS revenueYearFromDeclaration(2023) = 2022
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

  it("l'assurance confirmée par Tunnel A n'est pas injectée — sa nature bancaire/externe reste inconnue", () => {
    const { financementCharges } = mapCreditFinancingToFinancementCharges({
      financing: financingWith([{ ...BASE_LOAN, insurance: 25 }]),
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
    });
    assert.equal(
      financementCharges.totalAssurance,
      0,
      "même règle prudente que le pont documentaire (Cycle 4 §7) : pas de classification inventée",
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
