/**
 * NEXT-2 (F011-CREDIT-SILENT-LOAN-EXCLUSION) — `isCreditProfileIncomplete`
 * doit désormais considérer `firstPaymentDate` comme une condition de
 * complétude, au même titre que banque/montant/mensualité : sans elle,
 * `mapCreditFinancingToFinancementCharges()` exclut silencieusement le prêt
 * du calcul des intérêts déductibles.
 * Run: npx tsx --test src/lib/lmnp/services/credit-profile.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  emptyLoanFormValues,
  financingToFormValues,
  formValuesToFinancing,
  isCreditProfileIncomplete,
  type CreditFormValues,
} from "./credit-profile";

function completeLoan(overrides: Partial<ReturnType<typeof emptyLoanFormValues>> = {}) {
  return {
    ...emptyLoanFormValues(),
    bank: "Banque Populaire",
    loanType: "amortissable",
    borrowedAmount: "200000",
    rate: "3.5",
    durationMonths: "240",
    monthlyPayment: "1150",
    insurance: "300",
    remainingCapital: "195000",
    firstPaymentDate: "2020-02-01",
    ...overrides,
  };
}

function profileWith(loan: ReturnType<typeof completeLoan>): CreditFormValues {
  return {
    loans: [loan],
    summary: { annualInterest: "6900", annualInsurance: "300", remainingCapital: "195000" },
  };
}

describe("NEXT-2 — isCreditProfileIncomplete inclut firstPaymentDate", () => {
  it("prêt par ailleurs complet mais sans date de première échéance → incomplet", () => {
    assert.equal(isCreditProfileIncomplete(profileWith(completeLoan({ firstPaymentDate: "" }))), true);
  });

  it("date composée uniquement d'espaces → incomplet (pas de coercition en date valide)", () => {
    assert.equal(isCreditProfileIncomplete(profileWith(completeLoan({ firstPaymentDate: "   " }))), true);
  });

  it("prêt complet avec date de première échéance renseignée → complet", () => {
    assert.equal(isCreditProfileIncomplete(profileWith(completeLoan())), false);
  });

  it("comportement historique inchangé : banque manquante reste bloquante indépendamment de la date", () => {
    assert.equal(isCreditProfileIncomplete(profileWith(completeLoan({ bank: "" }))), true);
  });

  it("deux prêts, un seul sans date → profil global incomplet", () => {
    const profile: CreditFormValues = {
      loans: [completeLoan(), completeLoan({ bank: "Banque 2", firstPaymentDate: "" })],
      summary: { annualInterest: "9000", annualInsurance: "500", remainingCapital: "300000" },
    };
    assert.equal(isCreditProfileIncomplete(profile), true);
  });

  it("correction de la date manquante rend le profil complet", () => {
    const profile: CreditFormValues = {
      loans: [completeLoan(), completeLoan({ bank: "Banque 2", firstPaymentDate: "2021-05-01" })],
      summary: { annualInterest: "9000", annualInsurance: "500", remainingCapital: "300000" },
    };
    assert.equal(isCreditProfileIncomplete(profile), false);
  });
});

/**
 * NEXT-3 (blocker fix) — `creditFinancing.loans[].insurance` est l'unité
 * CANONIQUE ANNUELLE. Le champ UI Tunnel A reste mensuel (ergonomie,
 * placeholder "Assurance mensuelle") : la conversion doit être strictement
 * symétrique à cette frontière FORM ↔ DOMAINE, jamais dans le mapper fiscal.
 * TEST D est le test déterminant qui aurait dû faire échouer NEXT-3 initial :
 * une valeur déjà annuelle (écrite par le nouvel assistant F011) ne doit
 * jamais être reconvertie ×12 lors d'un passage par Tunnel A.
 */
describe("NEXT-3 (blocker fix) — normalisation canonique annuelle de l'assurance à la frontière FORM ↔ DOMAINE", () => {
  it("TEST A — Tunnel A : 25 €/mois saisis → 300 €/an canonique", () => {
    const financing = formValuesToFinancing(profileWith(completeLoan({ insurance: "25" })), 2024);
    assert.equal(financing.loans[0]?.insurance, 300);
  });

  it("TEST B — round-trip confirm → edit → confirm : jamais de dérive ×12/÷12", () => {
    const financing1 = formValuesToFinancing(profileWith(completeLoan({ insurance: "25" })), 2024);
    assert.equal(financing1.loans[0]?.insurance, 300);

    const restored = financingToFormValues(financing1);
    assert.equal(restored.loans[0]?.insurance, "25", "l'UI doit réafficher 25 €/mois, pas 300");

    const financing2 = formValuesToFinancing(restored, 2024);
    assert.equal(financing2.loans[0]?.insurance, 300, "reconfirmer sans rien changer doit redonner exactement 300, jamais 3600 ni 25");
  });

  it("TEST D (déterminant) — cross-canal : une valeur déjà annuelle (nouvel assistant F011) n'est jamais reconvertie ×12 via Tunnel A", () => {
    // Reproduit exactement ce que F011FinancementAssistantPanel.tsx persiste :
    // creditFinancing.loans[].insurance = 300 (déjà annuel).
    const financingFromF011 = {
      loans: [
        {
          id: "loan-1",
          bank: "Prêt 1",
          loanType: "amortissable",
          borrowedAmount: 200000,
          rate: 3.5,
          durationMonths: 240,
          monthlyPayment: 0,
          insurance: 300,
          fees: 0,
          startDate: "2020-02-01",
          firstPaymentDate: "2020-02-01",
          remainingCapital: 195000,
        },
      ],
      summary: { fiscalYearLabel: "2025", annualInterest: 6900, annualInsurance: 300, remainingCapital: 195000 },
      installments: [],
    };

    const uiRestored = financingToFormValues(financingFromF011);
    assert.equal(uiRestored.loans[0]?.insurance, "25", "Tunnel A doit afficher 25 €/mois (300/12)");

    const reconfirmed = formValuesToFinancing(uiRestored, 2024);
    assert.equal(
      reconfirmed.loans[0]?.insurance,
      300,
      "reconfirmer via Tunnel A sans rien changer doit redonner 300, jamais 3600 — c'est le blocker identifié par l'audit contradictoire",
    );
  });

  it("TEST F — assurance à 0 : aucune valeur inventée, round-trip stable", () => {
    const financing = formValuesToFinancing(profileWith(completeLoan({ insurance: "0" })), 2024);
    assert.equal(financing.loans[0]?.insurance, 0);
    const restored = financingToFormValues(financing);
    assert.equal(restored.loans[0]?.insurance, "0");
  });

  it("TEST G — multi-prêts Tunnel A : 25 €/mois + 40 €/mois → 300 + 480 annuels", () => {
    const profile: CreditFormValues = {
      loans: [completeLoan({ insurance: "25" }), completeLoan({ bank: "Banque 2", insurance: "40" })],
      summary: { annualInterest: "9000", annualInsurance: "500", remainingCapital: "300000" },
    };
    const financing = formValuesToFinancing(profile, 2024);
    assert.equal(financing.loans[0]?.insurance, 300);
    assert.equal(financing.loans[1]?.insurance, 480);
  });
});
