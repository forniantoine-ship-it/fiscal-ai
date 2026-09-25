/**
 * Modèle d'années — exercice 2025 (revenus/charges 01/01/2025 → 31/12/2025, déclaré en 2026).
 *
 * `fiscalYear.year` = l'exercice. F-011 calcule les charges de financement sur cet
 * exercice ; le tunnel crédit doit donc lire les échéances de CETTE année
 * (`revenueYear` = exercice), sinon l'assurance transmise à F-011 est celle de
 * l'année précédente.
 *
 * ORACLE INDÉPENDANT (arithmétique à la main, jamais recopiée de la sortie du code) :
 *  - prêt de 100 000 €, échéances datées : oct.–déc. 2024 (3 lignes) puis 2025 (12 lignes)
 *  - 2024 : intérêts 300,00 / capital 500,00 / assurance 30,00 par mois
 *  - 2025 : intérêts 290,00 / capital 510,00 / assurance 25,00 par mois
 *  ⇒ 2024 : intérêts 900,00 ; assurance 90,00 ; capital restant dû 100 000 − 1 500 = 98 500,00
 *  ⇒ 2025 : intérêts 3 480,00 ; assurance 300,00 (12 × 25) ; CRD 98 500 − 6 120 = 92 380,00
 *  ⇒ assurance annuelle transmise à F-011 : 25 × 12 = 300,00 (2025) contre 30 × 12 = 360,00 (2024)
 *
 * R1 (tableau documentaire prioritaire) — chaque ligne porte le CRD imprimé (colonne lue par le parseur
 * spatial, 100 000 − capital cumulé). Le tableau étant exploitable, F-011 lit intérêts ET assurance de
 * l'exercice dans le tableau : la contamination d'année du PRÉREMPLISSAGE (contre-épreuve 2024) ne peut
 * plus atteindre F-011. Avant R1, ces tests figeaient la reconstruction « depuis les termes du prêt »
 * malgré le tableau présent — la substitution silencieuse corrigée par R1.
 *
 * Run: npx tsx --test src/lib/lmnp/services/f011/f011-revenue-year-model.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { hydrateCreditFormFromSession } from "@/lib/lmnp/services/credit-gpt-ui-prefill";
import { formValuesToFinancing, revenueYearForExercice } from "@/lib/lmnp/services/credit-profile";
import { mapCreditFinancingToFinancementCharges } from "./credit-financing-to-financement-charges";

const EXERCICE = 2025;

const row = (date: string, interest: number, principal: number, insurance: number, remainingCapital: number) => ({
  date,
  interest,
  principal,
  insurance,
  fees: 0,
  totalPayment: interest + principal + insurance,
  remainingCapital,
});

const INSTALLMENTS = [
  row("2024-10-05", 300, 500, 30, 99500),
  row("2024-11-05", 300, 500, 30, 99000),
  row("2024-12-05", 300, 500, 30, 98500),
  ...Array.from({ length: 12 }, (_, i) => row(`2025-${String(i + 1).padStart(2, "0")}-05`, 290, 510, 25, 98500 - 510 * (i + 1))),
];

const SESSION = {
  amortization: { loanAmount: 100000, loanDurationMonths: 240, firstPaymentDate: "2024-10-05", installments: INSTALLMENTS },
  loanOffer: {
    bankName: "Banque Test",
    loanType: "Prêt amortissable",
    interestRate: 3.5,
    loanAmount: 100000,
    loanDurationMonths: 240,
  },
};

/** Chaîne de production : préremplissage crédit (revenueYear) → financing → F-011 sur l'exercice. */
function creditChain(revenueYear: number) {
  const { nextValues } = hydrateCreditFormFromSession({ session: SESSION as never, revenueYear });
  const financing = formValuesToFinancing(nextValues, revenueYear);
  const { financementCharges } = mapCreditFinancingToFinancementCharges({
    financing,
    exerciceFiscal: EXERCICE,
    dateMiseEnService: "2024-10-01",
  });
  return { form: nextValues, financing, charges: financementCharges };
}

describe("revenueYear = exercice (modèle d'années)", () => {
  it("le tunnel crédit lit l'exercice lui-même : exercice 2025 → revenueYear 2025", () => {
    assert.equal(revenueYearForExercice(EXERCICE), 2025);
    assert.equal(revenueYearForExercice(2026), 2026);
  });

  it("revenueYear = 2025 (attendu) : le préremplissage porte les chiffres 2025", () => {
    const { form, financing } = creditChain(revenueYearForExercice(EXERCICE));
    assert.equal(form.summary.annualInterest, "3480");
    assert.equal(form.summary.annualInsurance, "300");
    assert.equal(form.summary.remainingCapital, "92380");
    assert.equal(form.summary.remainingCapitalAsOf, "2025-12-05");
    assert.equal(form.loans[0]?.insurance, "25");
    assert.equal(financing.loans[0]?.insurance, 300);
    assert.equal(financing.summary.fiscalYearLabel, "2025");
  });

  it("revenueYear = 2025 (attendu) : F-011 reçoit l'assurance 2025 → totalAssurance = 12 × 25,00 = 300,00 €", () => {
    const { charges } = creditChain(revenueYearForExercice(EXERCICE));
    assert.equal(charges.exerciceFiscal, 2025);
    assert.equal(charges.totalAssurance, 300);
  });

  it("CONTRE-ÉPREUVE revenueYear = 2024 (ancien modèle -1) : préremplissage sur la mauvaise année", () => {
    const { form, financing } = creditChain(2024);
    assert.equal(form.summary.annualInterest, "900");
    assert.equal(form.summary.annualInsurance, "90");
    assert.equal(form.summary.remainingCapital, "98500");
    assert.equal(form.summary.remainingCapitalAsOf, "2024-12-05");
    assert.equal(form.loans[0]?.insurance, "30");
    assert.equal(financing.loans[0]?.insurance, 360);
  });

  it("CONTRE-ÉPREUVE revenueYear = 2024 : l'assurance 2024 du préremplissage (360,00) n'atteint plus F-011 — le tableau 2025 fait foi (300,00)", () => {
    const correct = creditChain(revenueYearForExercice(EXERCICE)).charges;
    const wrong = creditChain(2024);
    assert.equal(wrong.financing.loans[0]?.insurance, 360, "le préremplissage reste contaminé (ancien modèle -1)");
    assert.equal(correct.totalAssurance, 300);
    assert.equal(wrong.charges.totalAssurance, 300, "R1 — assurance lue dans les lignes 2025 du tableau, jamais le montant saisi");
    assert.equal(wrong.charges.totalChargesFinancementExercice, correct.totalChargesFinancementExercice);
  });

  it("les intérêts F-011 de l'exercice ne dépendent pas de revenueYear : lus dans le tableau documentaire (12 × 290,00 = 3 480,00), CRD 92 380,00", () => {
    const correct = creditChain(2025).charges;
    const wrong = creditChain(2024).charges;
    assert.equal(wrong.totalInteretsEmprunt, correct.totalInteretsEmprunt);
    assert.equal(correct.totalInteretsEmprunt, 3480);
    assert.equal(correct.prets[0]?.capitalRestantDu31_12, 92380);
  });
});

describe("garde statique — plus aucune compensation « année - 1 » dans le chemin modifié", () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("reducer, CreditDocumentStep et pipeline crédit passent par revenueYearForExercice", () => {
    for (const rel of [
      "src/lib/lmnp/store/reducer.ts",
      "src/components/lmnp/documents/CreditDocumentStep.tsx",
      "src/lib/lmnp/services/credit-gpt-pipeline.ts",
    ]) {
      const src = strip(read(rel));
      assert.match(src, /revenueYearForExercice\(/, rel);
      assert.doesNotMatch(src, /revenueYearFromDeclaration/, rel);
    }
  });

  it("aucun `fiscalYear.year - 1` résiduel dans le reducer ni dans CreditDocumentStep", () => {
    for (const rel of ["src/lib/lmnp/store/reducer.ts", "src/components/lmnp/documents/CreditDocumentStep.tsx"]) {
      assert.doesNotMatch(strip(read(rel)), /fiscalYear\.year\s*-\s*1/, rel);
    }
  });

  it("revenueYearForExercice est l'identité (le -1 historique est supprimé à la source)", () => {
    const src = strip(read("src/lib/lmnp/services/credit-profile.ts"));
    assert.match(src, /export function revenueYearForExercice\(fiscalYear: number\): number \{\s*return fiscalYear;\s*\}/);
  });
});
