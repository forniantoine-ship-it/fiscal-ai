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

describe("F-011 — assurance bancaire vs externe (correctif écrasement)", () => {
  it("amortissable + bancaire + montant connu → comptée comme charge déductible", () => {
    const result = computeFinancementExercice({
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
      prets: [
        {
          pretId: "pret-1",
          typePret: "amortissable",
          capitalInitial: 100000,
          tauxNominal: 0.02,
          dureeMois: 240,
          datePremiereMensualite: "2022-01-01",
          assuranceType: "bancaire",
          assuranceAnnuelle: 661,
        },
      ],
    });
    assert.ok(
      result.charges.prets[0]!.assuranceEmpruntExercice > 0,
      "une assurance bancaire extraite/connue doit être comptée, jamais ignorée du seul fait du type",
    );
  });

  it("in_fine + bancaire + montant connu → comptée comme charge déductible", () => {
    const result = computeFinancementExercice({
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
      prets: [
        {
          pretId: "pret-1",
          typePret: "in_fine",
          capitalInitial: 100000,
          tauxNominal: 0.03,
          dureeMois: 12,
          datePremiereMensualite: "2022-01-01",
          assuranceType: "bancaire",
          assuranceAnnuelle: 661,
        },
      ],
    });
    assert.ok(result.charges.prets[0]!.assuranceEmpruntExercice > 0);
  });

  it("externe + montant connu → non-régression (comportement déjà correct avant le correctif)", () => {
    const result = computeFinancementExercice({
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
      prets: [
        {
          pretId: "pret-1",
          typePret: "amortissable",
          capitalInitial: 100000,
          tauxNominal: 0.02,
          dureeMois: 240,
          datePremiereMensualite: "2022-01-01",
          assuranceType: "externe",
          assuranceAnnuelle: 300,
        },
      ],
    });
    assert.equal(result.charges.prets[0]!.assuranceEmpruntExercice, 300);
  });

  it("bancaire sans montant connu → 0, rien n'est inventé", () => {
    const result = computeFinancementExercice({
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
      prets: [
        {
          pretId: "pret-1",
          typePret: "amortissable",
          capitalInitial: 100000,
          tauxNominal: 0.02,
          dureeMois: 240,
          datePremiereMensualite: "2022-01-01",
          assuranceType: "bancaire",
        },
      ],
    });
    assert.equal(result.charges.prets[0]!.assuranceEmpruntExercice, 0);
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

/**
 * Cycle 20 (audit de clôture) — `new Date("YYYY-MM-DD")` était interprété
 * comme minuit UTC puis relu via des accesseurs locaux (ou reconverti en UTC
 * via `.toISOString()`) dans 5 fichiers F-011 : sous un fuseau serveur à
 * décalage négatif (America/New_York), l'échéancier généré, la répartition
 * pré-exploitation et l'application de l'assurance changeaient de résultat —
 * démontré par la suite complète F-011 (4 tests) qui échouait sous
 * TZ=America/New_York avant correctif, et passe désormais sous 4 fuseaux
 * réels (UTC, Europe/Paris, America/New_York, Pacific/Auckland).
 */
describe("Cycle 20 — F-011 invariant au fuseau horaire du serveur", () => {
  const TIMEZONES = ["UTC", "Europe/Paris", "America/New_York", "Pacific/Auckland"];

  function withTz<T>(tz: string, fn: () => T): T {
    const previous = process.env.TZ;
    process.env.TZ = tz;
    try {
      return fn();
    } finally {
      process.env.TZ = previous;
    }
  }

  it("generateLoanSchedule produit la même première échéance sous les 4 fuseaux testés", () => {
    for (const tz of TIMEZONES) {
      withTz(tz, () => {
        const schedule = generateLoanSchedule({
          capitalInitial: 200000,
          tauxNominal: 0.02,
          dureeMois: 12,
          datePremiereMensualite: "2025-01-01",
        });
        assert.equal(schedule.echeances[0]?.date, "2025-01-01", `sous TZ=${tz}`);
        assert.equal(schedule.echeances[11]?.date, "2025-12-01", `12e échéance sous TZ=${tz}`);
      });
    }
  });

  it("isolatePreExploitationInterests répartit identiquement pré/post mise en service sous les 4 fuseaux testés", () => {
    const schedule = generateLoanSchedule({
      capitalInitial: 200000,
      tauxNominal: 0.02,
      dureeMois: 12,
      datePremiereMensualite: "2025-01-01",
    });
    const results = TIMEZONES.map((tz) =>
      withTz(tz, () =>
        isolatePreExploitationInterests({
          echeances: schedule.echeances,
          exerciceFiscal: 2025,
          dateMiseEnService: "2025-07-01",
        }),
      ),
    );
    const [reference, ...rest] = results;
    for (const [i, result] of rest.entries()) {
      assert.equal(result.interetsPreExploitation, reference!.interetsPreExploitation, `sous TZ=${TIMEZONES[i + 1]}`);
      assert.equal(result.interetsDeductiblesExercice, reference!.interetsDeductiblesExercice, `sous TZ=${TIMEZONES[i + 1]}`);
    }
  });

  it("computeFinancementExercice (assurance appliquée par exercice) produit le même montant sous les 4 fuseaux testés", () => {
    const results = TIMEZONES.map((tz) =>
      withTz(tz, () =>
        computeFinancementExercice({
          exerciceFiscal: 2025,
          dateMiseEnService: "2020-01-01",
          prets: [
            {
              pretId: "p1",
              typePret: "amortissable",
              capitalInitial: 200000,
              tauxNominal: 0.02,
              dureeMois: 12,
              datePremiereMensualite: "2025-01-01",
              assuranceAnnuelle: 300,
              assuranceType: "externe",
            },
          ],
        }),
      ),
    );
    const [reference, ...rest] = results;
    for (const [i, result] of rest.entries()) {
      assert.equal(
        result.charges.totalChargesFinancementExercice,
        reference!.charges.totalChargesFinancementExercice,
        `sous TZ=${TIMEZONES[i + 1]}`,
      );
    }
  });
});
