/**
 * G10 — Case 2033-B 318 : MOUVEMENT ANNUEL vs STOCK FINAL.
 *
 * Run: npx tsx --test src/runtime/g10-case-318-annual-vs-stock.test.ts
 *
 * Les attentes sont indépendantes du mapper : le mouvement annuel est
 * `round2(amortCalcule − amortDeduct)`. `amortReporte` reste le stock final
 * (formule TRF-0031 inchangée). Case 318 lit uniquement le mouvement.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { applyAmortissementStocks } from "./capabilities/f006/apply-amortissement-stocks";
import { produceFiscalResult } from "./capabilities/f006/produce-fiscal-result";
import type { FiscalEngineInputs, FiscalResult } from "./capabilities/f006/types";
import { round2 } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import { buildFiscalRepresentation } from "./capabilities/rfs/build-fiscal-representation";
import { map2033BFromRfs } from "./capabilities/rfs/projection/map-2033b";
import type { FiscalRepresentation } from "./capabilities/rfs/types";

const IDENTITE: IdentiteDeclarante = {
  siren: "104545108",
  siret: "10454510800011",
  denomination: "G10 Fixture",
};

function baseInput(overrides: Partial<FiscalEngineInputs> = {}): FiscalEngineInputs {
  return {
    exerciceFiscal: 2025,
    activite: { dateMiseEnService: "2020-01-01", siret: "10454510800011" },
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 12000 },
    chargesAssistant: {
      exerciceFiscal: 2025,
      totalDeductible: 2000,
      totalPreExploitation: 0,
      parCategorie: {},
    },
    financementCharges: {
      exerciceFiscal: 2025,
      totalChargesFinancementExercice: 0,
      totalInteretsPreExploitation: 0,
    },
    amortissementAssistant: {
      exerciceFiscal: 2025,
      totalDotations: 3000,
      status: "validated",
    },
    ...overrides,
  };
}

function rfsFromResult(fr: FiscalResult): FiscalRepresentation {
  return buildFiscalRepresentation({
    identite: IDENTITE,
    fiscalResult: fr,
  });
}

function case318(fr: FiscalResult): number | undefined {
  return map2033BFromRfs(rfsFromResult(fr)).cases.find((c) => c.caseId === "318")?.value;
}

describe("G10 — Cas A : ouverture 0, nouveau non-déduit 2000", () => {
  it("318 = 2000 et stock final = 2000", () => {
    // resultatAvantAmort = 12000 − 2000 = 10000 ; amort 3000 → déduit 1000 max? 
    // Pour obtenir amortDeduct=1000 et non-déduit=2000 : reste après charges doit
    // laisser seulement 1000 pour l'amortissement → recettes − charges = 1000 + amortDeduct window.
    // Simpler: call applyAmortissementStocks directly (oracle indépendant du mapper).
    const app = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: 1000,
      amortCalcule: 3000,
      stockAmortissementsReportes: 0,
    });
    assert.equal(app.amortDeduct, 1000);
    assert.equal(round2(3000 - app.amortDeduct), 2000, "mouvement annuel");
    assert.equal(app.amortReporte, 2000, "stock final");

    const produced = produceFiscalResult(
      baseInput({
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 3000 },
        chargesAssistant: {
          exerciceFiscal: 2025,
          totalDeductible: 2000,
          totalPreExploitation: 0,
          parCategorie: {},
        },
        amortissementAssistant: {
          exerciceFiscal: 2025,
          totalDotations: 3000,
          status: "validated",
        },
        stockAmortissementsReportes: 0,
      }),
    );
    assert.ok(produced.result);
    assert.equal(produced.result!.amortNonDeduitExercice, 2000);
    assert.equal(produced.result!.amortReporte, 2000);
    assert.equal(case318(produced.result!), 2000);
  });
});

describe("G10 — Cas B : ouverture 2000, nouveau non-déduit 2000", () => {
  it("318 = 2000 et stock final = 4000", () => {
    const app = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: 1000,
      amortCalcule: 3000,
      stockAmortissementsReportes: 2000,
    });
    assert.equal(round2(3000 - app.amortDeduct), 2000);
    assert.equal(app.amortReporte, 4000);
    assert.equal(app.amortReportesUtilises, 0);

    const produced = produceFiscalResult(
      baseInput({
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 3000 },
        chargesAssistant: {
          exerciceFiscal: 2025,
          totalDeductible: 2000,
          totalPreExploitation: 0,
          parCategorie: {},
        },
        amortissementAssistant: {
          exerciceFiscal: 2025,
          totalDotations: 3000,
          status: "validated",
        },
        stockAmortissementsReportes: 2000,
      }),
    );
    assert.ok(produced.result);
    assert.equal(produced.result!.amortNonDeduitExercice, 2000);
    assert.equal(produced.result!.amortReporte, 4000);
    assert.equal(case318(produced.result!), 2000);
    assert.notEqual(case318(produced.result!), produced.result!.amortReporte);
  });
});

describe("G10 — Cas C : stock historique partiellement consommé", () => {
  it("318 = 0, consommé = 1000, stock final = 1000", () => {
    // Dotation N entièrement déductible, puis 1000 du stock historique consommé.
    // resultatAvantAmort = 4000, amortCalcule = 3000 → deduct 3000, reste 1000 → utilise 1000 du stock 2000.
    const app = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: 4000,
      amortCalcule: 3000,
      stockAmortissementsReportes: 2000,
    });
    assert.equal(app.amortDeduct, 3000);
    assert.equal(round2(3000 - app.amortDeduct), 0, "nouveau non-déduit");
    assert.equal(app.amortReportesUtilises, 1000, "ancien stock consommé");
    assert.equal(app.amortReporte, 1000, "stock final");

    const produced = produceFiscalResult(
      baseInput({
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 6000 },
        chargesAssistant: {
          exerciceFiscal: 2025,
          totalDeductible: 2000,
          totalPreExploitation: 0,
          parCategorie: {},
        },
        amortissementAssistant: {
          exerciceFiscal: 2025,
          totalDotations: 3000,
          status: "validated",
        },
        stockAmortissementsReportes: 2000,
      }),
    );
    assert.ok(produced.result);
    assert.equal(produced.result!.amortNonDeduitExercice, 0);
    assert.equal(produced.result!.amortReportesUtilises, 1000);
    assert.equal(produced.result!.amortReporte, 1000);
    assert.equal(case318(produced.result!), 0);
  });
});

describe("G10 — Cas D : ouverture 2000, dotation N entièrement déductible", () => {
  it("318 = 0 et stock final = 2000 (stock intact, aucun nouveau non-déduit)", () => {
    // resultatAvantAmort = amortCalcule exactement → deduct full, reste 0 → pas de conso stock.
    const app = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: 3000,
      amortCalcule: 3000,
      stockAmortissementsReportes: 2000,
    });
    assert.equal(app.amortDeduct, 3000);
    assert.equal(round2(3000 - app.amortDeduct), 0);
    assert.equal(app.amortReportesUtilises, 0);
    assert.equal(app.amortReporte, 2000);

    const produced = produceFiscalResult(
      baseInput({
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 5000 },
        chargesAssistant: {
          exerciceFiscal: 2025,
          totalDeductible: 2000,
          totalPreExploitation: 0,
          parCategorie: {},
        },
        amortissementAssistant: {
          exerciceFiscal: 2025,
          totalDotations: 3000,
          status: "validated",
        },
        stockAmortissementsReportes: 2000,
      }),
    );
    assert.ok(produced.result);
    assert.equal(produced.result!.amortNonDeduitExercice, 0);
    assert.equal(produced.result!.amortReporte, 2000);
    assert.equal(case318(produced.result!), 0);
  });
});

describe("G10 — Cas E : ouverture 2000, dotation N = 0", () => {
  it("318 = 0 et stock final = 2000 (reste nul → stock non consommé)", () => {
    const app = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: 0,
      amortCalcule: 0,
      stockAmortissementsReportes: 2000,
    });
    assert.equal(app.amortDeduct, 0);
    assert.equal(round2(0 - app.amortDeduct), 0);
    assert.equal(app.amortReportesUtilises, 0);
    assert.equal(app.amortReporte, 2000);

    const produced = produceFiscalResult(
      baseInput({
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 2000 },
        chargesAssistant: {
          exerciceFiscal: 2025,
          totalDeductible: 2000,
          totalPreExploitation: 0,
          parCategorie: {},
        },
        amortissementAssistant: {
          exerciceFiscal: 2025,
          totalDotations: 0,
          status: "validated",
        },
        stockAmortissementsReportes: 2000,
      }),
    );
    assert.ok(produced.result);
    assert.equal(produced.result!.amortNonDeduitExercice, 0);
    assert.equal(produced.result!.amortReporte, 2000);
    assert.equal(case318(produced.result!), 0);
  });
});

describe("G10 — résultat négatif (déficit avant amort)", () => {
  it("mouvement annuel = amortCalcule entier ; stock final = ouverture + amortCalcule ; 318 = mouvement", () => {
    const app = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: -5000,
      amortCalcule: 3000,
      stockAmortissementsReportes: 2000,
    });
    assert.equal(app.amortDeduct, 0);
    assert.equal(round2(3000 - 0), 3000);
    assert.equal(app.amortReporte, 5000);

    const produced = produceFiscalResult(
      baseInput({
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 1000 },
        chargesAssistant: {
          exerciceFiscal: 2025,
          totalDeductible: 6000,
          totalPreExploitation: 0,
          parCategorie: {},
        },
        amortissementAssistant: {
          exerciceFiscal: 2025,
          totalDotations: 3000,
          status: "validated",
        },
        stockAmortissementsReportes: 2000,
      }),
    );
    assert.ok(produced.result);
    assert.equal(produced.result!.amortNonDeduitExercice, 3000);
    assert.equal(produced.result!.amortReporte, 5000);
    assert.equal(case318(produced.result!), 3000);
  });
});

describe("G10 — première année (ouverture 0)", () => {
  it("318 = stock final = amortCalcule − amortDeduct", () => {
    const produced = produceFiscalResult(
      baseInput({
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 3000 },
        chargesAssistant: {
          exerciceFiscal: 2025,
          totalDeductible: 2000,
          totalPreExploitation: 0,
          parCategorie: {},
        },
        amortissementAssistant: {
          exerciceFiscal: 2025,
          totalDotations: 3000,
          status: "validated",
        },
        stockAmortissementsReportes: 0,
      }),
    );
    assert.ok(produced.result);
    assert.equal(produced.result!.amortNonDeduitExercice, produced.result!.amortReporte);
    assert.equal(case318(produced.result!), produced.result!.amortNonDeduitExercice);
  });
});

describe("G10 — arrondis", () => {
  it("amortNonDeduitExercice = round2(amortCalcule − amortDeduct)", () => {
    const produced = produceFiscalResult(
      baseInput({
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 2500.333 },
        chargesAssistant: {
          exerciceFiscal: 2025,
          totalDeductible: 1000.111,
          totalPreExploitation: 0,
          parCategorie: {},
        },
        amortissementAssistant: {
          exerciceFiscal: 2025,
          totalDotations: 2000.456,
          status: "validated",
        },
        stockAmortissementsReportes: 0,
      }),
    );
    assert.ok(produced.result);
    const fr = produced.result!;
    assert.equal(fr.amortNonDeduitExercice, round2(fr.amortCalcule - fr.amortDeduct));
    assert.equal(case318(fr), fr.amortNonDeduitExercice);
  });
});

describe("G10 — transmission F006 → RFS → 318", () => {
  it("trace 318 pointe vers amortNonDeduitExercice, jamais amortReporte", () => {
    const produced = produceFiscalResult(
      baseInput({
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 3000 },
        chargesAssistant: {
          exerciceFiscal: 2025,
          totalDeductible: 2000,
          totalPreExploitation: 0,
          parCategorie: {},
        },
        amortissementAssistant: {
          exerciceFiscal: 2025,
          totalDotations: 3000,
          status: "validated",
        },
        stockAmortissementsReportes: 2000,
      }),
    );
    assert.ok(produced.result);
    const form = map2033BFromRfs(rfsFromResult(produced.result!));
    const c318 = form.cases.find((c) => c.caseId === "318");
    assert.ok(c318);
    assert.equal(c318!.value, produced.result!.amortNonDeduitExercice);
    assert.match(c318!.trace.path, /amortNonDeduitExercice/);
    assert.doesNotMatch(c318!.trace.path, /amortReporte/);
  });
});

describe("G10 — clôture cas B → ouverture N+1 = 4000", () => {
  it("stocks.amortissementsReportes à clôture = 4000 (transport N→N+1 inchangé)", () => {
    const produced = produceFiscalResult(
      baseInput({
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 3000 },
        chargesAssistant: {
          exerciceFiscal: 2025,
          totalDeductible: 2000,
          totalPreExploitation: 0,
          parCategorie: {},
        },
        amortissementAssistant: {
          exerciceFiscal: 2025,
          totalDotations: 3000,
          status: "validated",
        },
        stockAmortissementsReportes: 2000,
      }),
    );
    assert.ok(produced.result);
    assert.equal(produced.result!.stocks.amortissementsReportes, 4000);
    assert.equal(produced.result!.amortReporte, 4000);
  });
});

describe("G10 — consommation ultérieure du stock sans double comptage", () => {
  it("N+1 consomme le stock sans réinjecter le mouvement N dans 318", () => {
    const nPlus1 = produceFiscalResult(
      baseInput({
        exerciceFiscal: 2026,
        revenusAssistant: { exerciceFiscal: 2026, totalRecettes: 8000 },
        chargesAssistant: {
          exerciceFiscal: 2026,
          totalDeductible: 2000,
          totalPreExploitation: 0,
          parCategorie: {},
        },
        financementCharges: {
          exerciceFiscal: 2026,
          totalChargesFinancementExercice: 0,
          totalInteretsPreExploitation: 0,
        },
        amortissementAssistant: {
          exerciceFiscal: 2026,
          totalDotations: 3000,
          status: "validated",
        },
        logementAmortissement: { computedAt: "2026-01-01T00:00:00.000Z", exerciceFiscal: 2026 },
        // Ouverture = clôture cas B
        stockAmortissementsReportes: 4000,
      }),
    );
    assert.ok(nPlus1.result, `anomalies: ${JSON.stringify(nPlus1.anomalies)}`);
    const fr = nPlus1.result!;
    // 8000 − 2000 = 6000 avant amort ; deduct 3000 ; reste 3000 → consomme 3000 du stock 4000
    assert.equal(fr.amortDeduct, 3000);
    assert.equal(fr.amortNonDeduitExercice, 0);
    assert.equal(fr.amortReportesUtilises, 3000);
    assert.equal(fr.amortReporte, 1000);
    assert.equal(case318(fr), 0, "aucune double comptabilisation du mouvement N dans 318 de N+1");
  });
});
