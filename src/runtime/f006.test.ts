import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { applyAmortissementStocks } from "./capabilities/f006/apply-amortissement-stocks";
import { computeResultatAvantAmort } from "./capabilities/f006/compute-resultat-avant-amort";
import { produceFiscalResult } from "./capabilities/f006/produce-fiscal-result";
import { explainFiscalResult } from "./presentation/explain-fiscal-result";
import { F006FiscalEngineAssistant } from "./assistants/f006-fiscal-engine/assistant";
import { computeChargesExercice } from "./capabilities/f012/compute-charges-exercice";

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

describe("F-006 — non-régression doublon pré-exploitation F-012 (taxe foncière)", () => {
  it("C. l'écart de résultat entre comptage simple et double égale exactement l'ancien doublon", () => {
    const { charges } = computeChargesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-08-01",
      taxeFonciere: 1200,
    });
    const preExploitationCorrigee = charges.totalPreExploitation; // 700, corrigé (comptage unique)
    const preExploitationAncienBug = preExploitationCorrigee * 2; // simule l'ancien doublon (700 × 2 = 1400)

    const base = {
      exerciceFiscal: 2024,
      totalRecettes: 9000,
      chargesExploitation: charges.totalDeductible,
      chargesFinancement: 0,
      totalChargesDeductibles: charges.totalDeductible,
      amortCalcule: 0,
      perteExceptionnelle: 0,
    };

    const resultatCorrige = computeResultatAvantAmort({
      ...base,
      chargesPreExploitation: preExploitationCorrigee,
    });
    const resultatAncienBug = computeResultatAvantAmort({
      ...base,
      chargesPreExploitation: preExploitationAncienBug,
    });

    assert.equal(
      resultatAncienBug.resultatAvantAmort - resultatCorrige.resultatAvantAmort,
      -preExploitationCorrigee,
    );
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

/**
 * Cycle 32 — audit 2033-B (264/270/310/312/314) : totalNonDeductible est un
 * TRANSPORT pur depuis F-012 (ChargesAssistantOutput.totalNonDeductible),
 * jamais recalculé par F-006. Aucun autre champ FiscalResult n'est affecté ;
 * aucun ordre de calcul (SAV-027) n'est modifié.
 */
describe("Cycle 32 — FiscalResult.charges.totalNonDeductible : transport pur depuis F-012", () => {
  it("un dossier avec 99,40 € de charges non déductibles expose ~99,40 € dans FiscalResult, sans transformation", () => {
    const { result } = produceFiscalResult({
      ...BASE_INPUT,
      chargesAssistant: {
        ...BASE_INPUT.chargesAssistant,
        totalNonDeductible: 99.4,
      },
    });
    assert.equal(result?.charges.totalNonDeductible, 99.4, "valeur transportée telle quelle, pas recalculée");
  });

  it("un dossier sans charge non déductible (0 €) expose exactement 0, jamais une valeur inventée", () => {
    const { result } = produceFiscalResult({
      ...BASE_INPUT,
      chargesAssistant: { ...BASE_INPUT.chargesAssistant, totalNonDeductible: 0 },
    });
    assert.equal(result?.charges.totalNonDeductible, 0);
  });

  it("chargesAssistant.totalNonDeductible absent (assistant pas encore à jour) → 0, jamais undefined ni une estimation", () => {
    const { result } = produceFiscalResult(BASE_INPUT);
    assert.equal(result?.charges.totalNonDeductible, 0);
  });

  it("n'est PAS dérivé de totalDeductible, totalCharges, ni d'aucun autre champ — deux dossiers identiques sauf sur ce seul champ ne divergent que sur lui", () => {
    const sansNonDeductible = produceFiscalResult(BASE_INPUT).result!;
    const avecNonDeductible = produceFiscalResult({
      ...BASE_INPUT,
      chargesAssistant: { ...BASE_INPUT.chargesAssistant, totalNonDeductible: 250 },
    }).result!;

    assert.equal(avecNonDeductible.charges.totalNonDeductible, 250);
    // Tous les autres champs de calcul fiscal restent strictement identiques —
    // la preuve que totalNonDeductible ne recalcule ni ne perturbe rien d'autre.
    assert.equal(avecNonDeductible.charges.totalDeductible, sansNonDeductible.charges.totalDeductible);
    assert.equal(avecNonDeductible.charges.chargesExploitation, sansNonDeductible.charges.chargesExploitation);
    assert.equal(avecNonDeductible.resultatAvantAmort, sansNonDeductible.resultatAvantAmort);
    assert.equal(avecNonDeductible.resultatFiscal, sansNonDeductible.resultatFiscal);
    assert.equal(avecNonDeductible.deficitNouveau, sansNonDeductible.deficitNouveau);
    assert.equal(avecNonDeductible.amortDeduct, sansNonDeductible.amortDeduct);
    assert.equal(avecNonDeductible.amortReporte, sansNonDeductible.amortReporte);
  });

  it("les champs FiscalResult historiques (hors charges.totalNonDeductible) restent identiques à ceux produits avant ce cycle", () => {
    const { result } = produceFiscalResult(BASE_INPUT);
    assert.equal(result?.exercice, 2024);
    assert.equal(result?.recettes.total, 9000);
    assert.equal(result?.charges.totalDeductible, 7000);
    assert.equal(result?.charges.chargesExploitation, 7000);
    assert.equal(result?.charges.chargesFinancement, 0);
    assert.equal(result?.charges.chargesPreExploitation, 560);
    assert.equal(result?.amortCalcule, 6779);
  });
});

/**
 * Cycle 32 — STEP 6 (audit de conformité 2033-B) : limitation documentée de
 * la case 318 quand déficits antérieurs ET limitation d'amortissement
 * coexistent la même année. Ce test ne change AUCUNE règle de F-006
 * (SAV-027 reste intact, `applyAmortissementStocks` n'est pas modifié) : il
 * prouve seulement, avec un cas construit, que amortReporte (case 318) et le
 * "résultat fiscal avant imputation des déficits" (case 352/354) divergent
 * de ce qu'un ordre de calcul indépendant des déficits produirait — d'où le
 * blocage volontaire de 352/354 tant que ce n'est pas arbitré.
 * Important : le RÉSULTAT FISCAL FINAL (bottom line) est identique dans les
 * deux ordres — seule la répartition intermédiaire entre "amortissement
 * reporté" et "déficit antérieur restant" diffère.
 */
describe("Cycle 32 — limitation documentée : ordre déficits/amortissement (SAV-027) affecte la case 318 en présence de déficits antérieurs", () => {
  it("déficit antérieur 4000, résultat avant amort 5000, amortissement calculé 3000 : F-006 reporte 2000 d'amortissement, un ordre 'art. 39C indépendant des déficits' n'en reporterait aucun — même résultat final", () => {
    const applicationF006 = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: 5000,
      amortCalcule: 3000,
      stockDeficitsAnterieurs: [{ millesime: 2023, montant: 4000 }],
      stockAmortissementsReportes: 0,
    });

    // Ordre effectif de F-006 (SAV-027, non modifié) : déficits imputés avant l'amortissement.
    assert.equal(applicationF006.deficitsImputes, 4000, "le déficit antérieur est intégralement imputé en premier");
    assert.equal(applicationF006.amortDeduct, 1000, "il ne reste que 1000 de résultat pour l'amortissement");
    assert.equal(applicationF006.amortReporte, 2000, "3000 calculé − 1000 déduit = 2000 reporté (case 318 actuelle)");
    assert.equal(applicationF006.resultatFiscal, 0);

    // Ordre alternatif "formulaire officiel" (art. 39 C appliqué indépendamment
    // des déficits antérieurs, calculé ici SANS appeler applyAmortissementStocks
    // — pure arithmétique de démonstration, pas une nouvelle règle F-006) :
    const amortDeductFormOrder = Math.min(3000, Math.max(0, 5000)); // limitation sur resultatAvantAmort seul
    const amortReporteFormOrder = 3000 - amortDeductFormOrder;
    const resteApresAmortFormOrder = 5000 - amortDeductFormOrder;
    const deficitImputeFormOrder = Math.min(4000, resteApresAmortFormOrder);
    const resultatFiscalFormOrder = resteApresAmortFormOrder - deficitImputeFormOrder;

    assert.equal(amortReporteFormOrder, 0, "dans cet ordre, aucune limitation d'amortissement n'aurait lieu");
    assert.equal(deficitImputeFormOrder, 2000, "seule une partie du déficit antérieur serait imputée cette année");
    assert.equal(resultatFiscalFormOrder, 0, "le résultat fiscal final est identique dans les deux ordres");

    // La divergence documentée : même résultat final, répartition différente.
    assert.notEqual(
      applicationF006.amortReporte,
      amortReporteFormOrder,
      "case 318 (amortissements excédentaires) diverge selon l'ordre — raison du blocage de 352/354",
    );
    assert.notEqual(applicationF006.deficitsImputes, deficitImputeFormOrder);
  });
});
