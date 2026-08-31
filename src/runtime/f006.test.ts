import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { applyAmortissementStocks } from "./capabilities/f006/apply-amortissement-stocks";
import { computeResultatAvantAmort } from "./capabilities/f006/compute-resultat-avant-amort";
import { produceFiscalResult } from "./capabilities/f006/produce-fiscal-result";
import { explainFiscalResult } from "./presentation/explain-fiscal-result";
import { F006FiscalEngineAssistant } from "./assistants/f006-fiscal-engine/assistant";

const BASE_INPUT = {
  exerciceFiscal: 2024,
  activite: { dateMiseEnService: "2024-04-15", siret: "12345678901234" },
  revenusAssistant: { exerciceFiscal: 2024, totalRecettes: 9000 },
  chargesAssistant: {
    exerciceFiscal: 2024,
    totalDeductible: 7000,
    totalPreExploitation: 560,
    parCategorie: {},
  },
  financementCharges: {
    exerciceFiscal: 2024,
    totalChargesFinancementExercice: 0,
    totalInteretsPreExploitation: 0,
  },
  amortissementAssistant: {
    exerciceFiscal: 2024,
    totalDotations: 6779,
    status: "validated" as const,
  },
  logementAmortissement: { computedAt: "2024-01-01T00:00:00.000Z" },
};

describe("F-006 — TRF-0030 résultat avant amortissement", () => {
  it("calcule recettes - charges (VER-047 base)", () => {
    const result = computeResultatAvantAmort({
      exerciceFiscal: 2024,
      totalRecettes: 9000,
      chargesExploitation: 7560,
      chargesFinancement: 0,
      chargesPreExploitation: 0,
      totalChargesDeductibles: 7560,
      amortCalcule: 6779,
      perteExceptionnelle: 0,
    });
    assert.equal(result.resultatAvantAmort, 1440);
  });

  it("calcule un déficit (CASE-001 / VER-048)", () => {
    const result = computeResultatAvantAmort({
      exerciceFiscal: 2025,
      totalRecettes: 3000,
      chargesExploitation: 5287,
      chargesFinancement: 0,
      chargesPreExploitation: 0,
      totalChargesDeductibles: 5287,
      amortCalcule: 2266,
      perteExceptionnelle: 0,
    });
    assert.equal(result.resultatAvantAmort, -2287);
  });
});

describe("F-006 — TRF-0031 application amortissement et stocks", () => {
  it("VER-047 — résultat nul, amort reporté", () => {
    const result = applyAmortissementStocks({
      exercice: 2024,
      resultatAvantAmort: 1440,
      amortCalcule: 6779,
    });
    assert.equal(result.resultatFiscal, 0);
    assert.equal(result.amortDeduct, 1440);
    assert.equal(result.amortReporte, 5339);
    assert.equal(result.deficitNouveau, 0);
  });

  it("VER-048 — déficit avant amort, amort intégralement reporté", () => {
    const result = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: -2287,
      amortCalcule: 2266,
    });
    assert.equal(result.resultatFiscal, 0);
    assert.equal(result.amortDeduct, 0);
    assert.equal(result.amortReporte, 2266);
    assert.equal(result.deficitNouveau, 2287);
    assert.equal(result.stockDeficitsMisAJour[0]?.millesime, 2025);
  });

  it("VER-049 — bénéfice après amort", () => {
    const result = applyAmortissementStocks({
      exercice: 2024,
      resultatAvantAmort: 10000,
      amortCalcule: 6779,
    });
    assert.equal(result.amortDeduct, 6779);
    assert.equal(result.resultatFiscal, 3221);
  });

  it("VER-050 — imputation déficits antérieurs", () => {
    const result = applyAmortissementStocks({
      exercice: 2024,
      resultatAvantAmort: 5000,
      amortCalcule: 3000,
      stockDeficitsAnterieurs: [{ millesime: 2020, montant: 2000 }],
    });
    assert.equal(result.deficitsImputes, 2000);
    assert.equal(result.amortDeduct, 3000);
    assert.equal(result.resultatFiscal, 0);
  });

  it("VER-051 — expiration déficit > 10 ans", () => {
    const result = applyAmortissementStocks({
      exercice: 2035,
      resultatAvantAmort: 1000,
      amortCalcule: 0,
      stockDeficitsAnterieurs: [
        { millesime: 2023, montant: 500 },
        { millesime: 2024, montant: 300 },
      ],
    });
    assert.ok(result.deficitsExpires.some((d) => d.millesime === 2023));
    assert.ok(!result.stockDeficitsMisAJour.some((d) => d.millesime === 2023));
  });
});

describe("F-006 — composition produceFiscalResult", () => {
  it("agrège F-011 + F-012 sans recalculer", () => {
    const input = {
      ...BASE_INPUT,
      chargesAssistant: {
        exerciceFiscal: 2024,
        totalDeductible: 7000,
        totalPreExploitation: 0,
      },
      financementCharges: {
        exerciceFiscal: 2024,
        totalChargesFinancementExercice: 560,
        totalInteretsPreExploitation: 0,
      },
    };
    const { result } = produceFiscalResult(input);
    assert.ok(result);
    assert.equal(result!.charges.chargesExploitation, 7000);
    assert.equal(result!.charges.chargesFinancement, 560);
    assert.equal(result!.charges.totalDeductible, 7560);
    assert.equal(result!.resultatAvantAmort, 1440);
    assert.equal(result!.resultatFiscal, 0);
  });

  it("CASE-001 — Marie Dupont déficit première année", () => {
    const { result } = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2025-09-01" },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 3000 },
      chargesAssistant: {
        exerciceFiscal: 2025,
        totalDeductible: 5287,
        totalPreExploitation: 0,
      },
      financementCharges: {
        exerciceFiscal: 2025,
        totalChargesFinancementExercice: 0,
        totalInteretsPreExploitation: 0,
      },
      amortissementAssistant: {
        exerciceFiscal: 2025,
        totalDotations: 2266.1,
        status: "validated",
      },
      logementAmortissement: { computedAt: "2025-01-01T00:00:00.000Z" },
    });
    assert.ok(result);
    assert.equal(result!.resultatAvantAmort, -2287);
    assert.equal(result!.amortDeduct, 0);
    assert.equal(result!.deficitNouveau, 2287);
    assert.equal(result!.amortReporte, 2266.1);
  });

  it("bloque si F-014 non validé", () => {
    const { result, anomalies } = produceFiscalResult({
      ...BASE_INPUT,
      amortissementAssistant: {
        exerciceFiscal: 2024,
        totalDotations: 1000,
        status: "contested",
      },
    });
    assert.equal(result, undefined);
    assert.ok(anomalies.some((a) => a.severity === "fatal"));
  });
});

describe("F-006 — Explanation Engine", () => {
  it("explique un déficit avant amortissement", () => {
    const { result } = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2025-09-01" },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 3000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 5287, totalPreExploitation: 0 },
      amortissementAssistant: {
        exerciceFiscal: 2025,
        totalDotations: 2266,
        status: "validated",
      },
    });
    const explain = explainFiscalResult({ result: result! });
    assert.match(explain.headline, /Déficit/i);
    assert.match(explain.explanation, /ne peut pas créer de déficit/i);
  });
});

describe("F-006 — Assistant Fiscal Engine", () => {
  const ctx = { dossierId: "test", fiscalYear: 2024, route: "/assistants/fiscal" };

  it("démarre avec un résultat calculé", () => {
    const assistant = new F006FiscalEngineAssistant(ctx, BASE_INPUT);
    const turn = assistant.start();
    assert.equal(turn.state.step, "preview");
    assert.ok(turn.state.result);
    assert.equal(turn.state.result!.fiscalResult.resultatFiscal, 0);
  });

  it("redirige si prérequis manquants", () => {
    const assistant = new F006FiscalEngineAssistant(ctx, {
      exerciceFiscal: 2024,
      activite: {},
    });
    const turn = assistant.start();
    assert.equal(turn.state.step, "blocked");
    assert.equal(turn.event, "REDIRECT_PREREQUIS");
  });
});

describe("Cycle 16 — indemnitesAssurance ventilée dans FiscalResult.recettes", () => {
  it("produceFiscalResult reprend indemnitesAssurance depuis revenusAssistant sans recalcul", () => {
    const { result } = produceFiscalResult({
      ...BASE_INPUT,
      revenusAssistant: {
        exerciceFiscal: 2024,
        totalRecettes: 13000,
        loyersEncaisses: 9000,
        indemnitesAssurance: 4000,
      },
    });

    assert.equal(result?.recettes.indemnitesAssurance, 4000);
    assert.equal(result?.recettes.total, 13000);
  });
});
