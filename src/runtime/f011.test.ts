import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeFinancementExercice } from "./capabilities/f011/compute-financement-exercice";
import { computeInFineInterests } from "./capabilities/f011/compute-in-fine-interests";
import { extractInterestsExercice } from "./capabilities/f011/extract-interests-exercice";
import { generateLoanSchedule } from "./capabilities/f011/generate-loan-schedule";
import { isolatePreExploitationInterests } from "./capabilities/f011/isolate-pre-exploitation-interests";
import { validateFinancement } from "./capabilities/f011/validate-financement";
import { explainFinancement } from "./presentation/explain-financement";

describe("F-011 — reconstruction prêt amortissable", () => {
  it("génère un échéancier cohérent depuis 4 inputs", () => {
    const schedule = generateLoanSchedule({
      capitalInitial: 200000,
      tauxNominal: 0.0185,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-15",
    });

    assert.equal(schedule.echeances.length, 240);
    assert.equal(schedule.echeances[0]?.capitalRestantDu < 200000, true);
    assert.equal(schedule.echeances.at(-1)?.capitalRestantDu, 0);
  });

  it("isole les intérêts pré-exploitation (cas nominal F-011)", () => {
    const schedule = generateLoanSchedule({
      capitalInitial: 200000,
      tauxNominal: 0.0185,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });

    const isolated = isolatePreExploitationInterests({
      echeances: schedule.echeances,
      exerciceFiscal: 2022,
      dateMiseEnService: "2022-03-01",
    });

    assert.equal(isolated.interetsPreExploitation > 0, true);
    assert.equal(isolated.interetsDeductiblesExercice > 0, true);
    assert.equal(
      isolated.interetsPreExploitation + isolated.interetsDeductiblesExercice,
      extractInterestsExercice({ echeances: schedule.echeances, exerciceFiscal: 2022 })
        .interetsExercice,
    );
  });

  it("agrège deux prêts (cas multi-prêts F-011)", () => {
    const result = computeFinancementExercice({
      exerciceFiscal: 2023,
      dateMiseEnService: "2022-06-01",
      prets: [
        {
          pretId: "pret-1",
          typePret: "amortissable",
          capitalInitial: 180000,
          tauxNominal: 0.02,
          dureeMois: 240,
          datePremiereMensualite: "2022-01-15",
        },
        {
          pretId: "pret-2",
          typePret: "amortissable",
          capitalInitial: 30000,
          tauxNominal: 0.025,
          dureeMois: 120,
          datePremiereMensualite: "2023-03-01",
        },
      ],
    });

    assert.equal(result.charges.prets.length, 2);
    assert.equal(
      result.charges.totalInteretsEmprunt,
      result.charges.prets[0]!.interetsEmpruntExercice +
        result.charges.prets[1]!.interetsEmpruntExercice,
    );
    assert.ok(result.charges.totalChargesFinancementExercice > 0);
  });
});

describe("F-011 — prêt in fine", () => {
  it("produit des intérêts constants et CRD stable", () => {
    const { echeances, interetsAnnuels } = computeInFineInterests({
      capitalInitial: 100000,
      tauxNominal: 0.03,
      exerciceFiscal: 2024,
      datePremiereMensualite: "2024-01-01",
      dureeMois: 12,
    });

    assert.equal(interetsAnnuels, 3000);
    assert.ok(echeances.every((e) => e.capital === 0));
    assert.ok(echeances.every((e) => e.capitalRestantDu === 100000));
  });
});

describe("F-011 — validations", () => {
  it("rejette des intérêts supérieurs à capital × taux", () => {
    const validation = validateFinancement({
      capitalInitial: 100000,
      tauxNominal: 0.02,
      interetsDeductibles: 5000,
    });
    assert.equal(validation.valide, false);
  });

  it("produit une explication lisible", () => {
    const result = computeFinancementExercice({
      exerciceFiscal: 2022,
      dateMiseEnService: "2022-06-01",
      prets: [
        {
          pretId: "pret-1",
          typePret: "amortissable",
          capitalInitial: 200000,
          tauxNominal: 0.0185,
          dureeMois: 240,
          datePremiereMensualite: "2022-01-15",
        },
      ],
    });
    const explain = explainFinancement({ charges: result.charges });
    assert.match(explain.explanation, /charges de financement déductibles/);
    assert.match(explain.explanation, /capital ne sont pas déductibles/);
  });
});
