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
import { mapCreditFinancingToFinancementCharges } from "./f011/credit-financing-to-financement-charges";
import type { CreditFinancingData } from "@/lib/lmnp/types";

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

/**
 * F011 fees/guarantee V1 fix — même philosophie que NEXT-2 (firstPaymentDate)
 * ci-dessus, pour `souscritCetExercice` : management by exception, tri-état
 * jamais collapsé, jamais inféré.
 */
describe("F011 fees/guarantee V1 fix — isCreditProfileIncomplete inclut souscritCetExercice quand des frais sont saisis", () => {
  it("Case A — fees = 0 (jamais saisis) → complet, indépendamment de souscritCetExercice", () => {
    assert.equal(isCreditProfileIncomplete(profileWith(completeLoan())), false);
  });

  it("Case F — frais de dossier > 0 sans réponse → incomplet", () => {
    assert.equal(isCreditProfileIncomplete(profileWith(completeLoan({ loanApplicationFees: "800" }))), true);
  });

  it("frais de garantie > 0 sans réponse → incomplet", () => {
    assert.equal(isCreditProfileIncomplete(profileWith(completeLoan({ loanGuaranteeFees: "500" }))), true);
  });

  it("Case G — dossier ancien : champ souscritCetExercice totalement absent (pré-fix) + frais > 0 → incomplet, jamais déduit par défaut", () => {
    const legacyLoan = completeLoan({ loanApplicationFees: "800" });
    delete (legacyLoan as { souscritCetExercice?: boolean }).souscritCetExercice;
    assert.equal(isCreditProfileIncomplete(profileWith(legacyLoan)), true);
  });

  it("Case B/C/D — frais > 0 + souscritCetExercice: true → complet", () => {
    assert.equal(
      isCreditProfileIncomplete(
        profileWith(completeLoan({ loanApplicationFees: "800", loanGuaranteeFees: "500", souscritCetExercice: true })),
      ),
      false,
    );
  });

  it("Case E — frais > 0 + souscritCetExercice: false (répondu) → complet, jamais traité comme non répondu", () => {
    assert.equal(
      isCreditProfileIncomplete(profileWith(completeLoan({ loanApplicationFees: "800", souscritCetExercice: false }))),
      false,
    );
  });

  it("Case J — multi-prêts : un prêt sans réponse rend le profil global incomplet même si l'autre a répondu", () => {
    const profile: CreditFormValues = {
      loans: [
        completeLoan({ loanApplicationFees: "800", souscritCetExercice: true }),
        completeLoan({ bank: "Banque 2", loanApplicationFees: "600" }),
      ],
      summary: { annualInterest: "9000", annualInsurance: "500", remainingCapital: "300000" },
    };
    assert.equal(isCreditProfileIncomplete(profile), true);

    const corrected: CreditFormValues = {
      loans: [profile.loans[0]!, { ...profile.loans[1]!, souscritCetExercice: false }],
      summary: profile.summary,
    };
    assert.equal(isCreditProfileIncomplete(corrected), false, "répondre au second prêt rend le profil complet");
  });

  it("comportement historique inchangé : firstPaymentDate manquante reste bloquante indépendamment des frais", () => {
    assert.equal(
      isCreditProfileIncomplete(profileWith(completeLoan({ firstPaymentDate: "", souscritCetExercice: true }))),
      true,
    );
  });
});

/**
 * Case N — tri-état préservé au roundtrip FORM → DOMAINE → FORM, jamais
 * collapsé (`Boolean(undefined) === false` serait un bug classique).
 */
describe("F011 fees/guarantee V1 fix — souscritCetExercice : roundtrip tri-état FORM ↔ DOMAINE", () => {
  it("true → true", () => {
    const financing = formValuesToFinancing(profileWith(completeLoan({ souscritCetExercice: true })), 2024);
    assert.equal(financing.loans[0]?.souscritCetExercice, true);
    const restored = financingToFormValues(financing);
    assert.equal(restored.loans[0]?.souscritCetExercice, true);
  });

  it("false → false, jamais collapsé à undefined", () => {
    const financing = formValuesToFinancing(profileWith(completeLoan({ souscritCetExercice: false })), 2024);
    assert.equal(financing.loans[0]?.souscritCetExercice, false);
    const restored = financingToFormValues(financing);
    assert.equal(restored.loans[0]?.souscritCetExercice, false);
  });

  it("undefined → undefined, jamais défaulté à true ni false", () => {
    const financing = formValuesToFinancing(profileWith(completeLoan()), 2024);
    assert.equal(financing.loans[0]?.souscritCetExercice, undefined);
    const restored = financingToFormValues(financing);
    assert.equal(restored.loans[0]?.souscritCetExercice, undefined);
  });

  it("cycle complet confirm → edit (rien ne change) → reconfirm : le fait ne dérive jamais", () => {
    const financing1 = formValuesToFinancing(profileWith(completeLoan({ souscritCetExercice: false })), 2024);
    const restored = financingToFormValues(financing1);
    const financing2 = formValuesToFinancing(restored, 2024);
    assert.equal(financing2.loans[0]?.souscritCetExercice, false, "jamais réinitialisé à undefined ni basculé à true");
  });
});

/**
 * Case H/I (mandatoire) — RÉGRESSION cross-canal F011 → Tunnel A.
 *
 * Reproduit exactement le scénario identifié par l'audit indépendant :
 * F011FinancementAssistantPanel.tsx écrit `creditFinancing` avec
 * `loanApplicationFees`/`loanGuaranteeFees`/`souscritCetExercice` déjà
 * résolus (même fixture que `financingFromF011` du TEST D ci-dessus, pour
 * l'assurance — étendue ici aux frais). Le client revisite ensuite Tunnel A
 * (CreditDocumentStep.tsx), NE CHANGE RIEN, et reconfirme : ce chemin
 * recalcule TOUJOURS `financementCharges` depuis `creditFinancing` via
 * `mapCreditFinancingToFinancementCharges()`. Avant ce correctif, cette
 * reconfirmation écrasait silencieusement la déduction correcte par 0€
 * (la fonction ne lisait ni les frais ni `souscritCetExercice`).
 */
describe("F011 fees/guarantee V1 fix — Case H/I : régression cross-canal F011 → Tunnel A (reconfirmation sans changement)", () => {
  function financingFromF011WithFees(souscritCetExercice: boolean): CreditFinancingData {
    return {
      loans: [
        {
          id: "loan-f011",
          bank: "Prêt 1",
          loanType: "amortissable",
          borrowedAmount: 200000,
          rate: 3.5,
          durationMonths: 240,
          monthlyPayment: 0,
          insurance: 300,
          fees: 0,
          loanApplicationFees: 800,
          loanGuaranteeFees: 500,
          souscritCetExercice,
          startDate: "2026-01-15",
          firstPaymentDate: "2026-02-01",
          remainingCapital: 195000,
        },
      ],
      summary: { fiscalYearLabel: "2026", annualInterest: 6900, annualInsurance: 300, remainingCapital: 195000 },
      installments: [],
    };
  }

  it("Case H — F011 dit true → reconfirmation Tunnel A sans changement → frais TOUJOURS déduits, jamais réinitialisés à 0", () => {
    const financingFromF011 = financingFromF011WithFees(true);

    // Étape 1 — la confirmation F011 elle-même produit bien la déduction
    // (même que la panel calcule via son propre computeForLoans(), non
    // reproduit ici — on part de son résultat déjà persisté).
    const directFromF011 = mapCreditFinancingToFinancementCharges({
      financing: financingFromF011,
      exerciceFiscal: 2026,
      dateMiseEnService: "2020-01-01",
    });
    assert.equal(directFromF011.financementCharges.prets[0]?.fraisDossierDeductibles, 800, "précondition — F011 seul déduit déjà correctement");
    assert.equal(directFromF011.financementCharges.prets[0]?.garantieDeductible, 500);

    // Étape 2 — Tunnel A charge ce même creditFinancing (CreditDocumentStep
    // au montage) sans que le client ne touche à rien.
    const uiRestored = financingToFormValues(financingFromF011);
    assert.equal(uiRestored.loans[0]?.souscritCetExercice, true, "le fait doit survivre au chargement Tunnel A");

    // Étape 3 — le client clique "Confirmer" sans rien changer :
    // CreditDocumentStep.tsx reconstruit `financing` puis recalcule
    // `financementCharges` via mapCreditFinancingToFinancementCharges().
    const reconfirmedFinancing = formValuesToFinancing(uiRestored, 2024);
    const reconfirmed = mapCreditFinancingToFinancementCharges({
      financing: reconfirmedFinancing,
      exerciceFiscal: 2026,
      dateMiseEnService: "2020-01-01",
    });
    assert.equal(
      reconfirmed.financementCharges.prets[0]?.fraisDossierDeductibles,
      800,
      "RÉGRESSION si 0 : la reconfirmation Tunnel A a silencieusement perdu la déduction F011",
    );
    assert.equal(
      reconfirmed.financementCharges.prets[0]?.garantieDeductible,
      500,
      "RÉGRESSION si 0 : idem pour la garantie",
    );
  });

  it("Case I — F011 dit false → reconfirmation Tunnel A sans changement → non-déduction préservée (jamais basculée à déductible)", () => {
    const financingFromF011 = financingFromF011WithFees(false);

    const uiRestored = financingToFormValues(financingFromF011);
    assert.equal(uiRestored.loans[0]?.souscritCetExercice, false);

    const reconfirmedFinancing = formValuesToFinancing(uiRestored, 2024);
    const reconfirmed = mapCreditFinancingToFinancementCharges({
      financing: reconfirmedFinancing,
      exerciceFiscal: 2026,
      dateMiseEnService: "2020-01-01",
    });
    assert.equal(reconfirmed.financementCharges.prets[0]?.fraisDossierDeductibles, 0);
    assert.equal(reconfirmed.financementCharges.prets[0]?.garantieDeductible, 0);
  });
});
