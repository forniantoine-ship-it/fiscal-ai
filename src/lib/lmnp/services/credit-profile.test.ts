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

import { emptyLoanFormValues, isCreditProfileIncomplete, type CreditFormValues } from "./credit-profile";

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
