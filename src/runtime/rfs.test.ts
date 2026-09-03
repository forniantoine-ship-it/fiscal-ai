/**
 * Cycle 26 — Représentation Fiscale Structurée (RFS).
 * Run: npx tsx --test src/runtime/rfs.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFiscalRepresentation } from "./capabilities/rfs/build-fiscal-representation";
import type { FiscalResult } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { AmortissementPlan } from "./capabilities/f010/types";
import type { PretFinancementExercice } from "./capabilities/f011/types";

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  return {
    exercice: 2025,
    recettes: { total: 9000 },
    charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0 },
    resultatAvantAmort: 7000,
    amortCalcule: 1500,
    amortDeduct: 1500,
    amortReporte: 0,
    amortReportesUtilises: 0,
    resultatFiscal: 5500,
    deficitNouveau: 0,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
    status: "computed",
    anomalies: [],
    ...overrides,
  };
}

const IDENTITE: IdentiteDeclarante = {
  siren: "123456789",
  siret: "12345678901234",
  denomination: "Marie Dupont",
};

describe("Cycle 26 — buildFiscalRepresentation() n'invente ni ne recalcule rien", () => {
  it("RFS.fiscalResult est la MÊME référence que le FiscalResult injecté — pas une copie, pas une reconstruction", () => {
    const fr = fiscalResult();
    const rfs = buildFiscalRepresentation({ fiscalResult: fr, identite: IDENTITE });
    assert.equal(rfs.fiscalResult, fr, "même objet en mémoire — la RFS ne reconstruit jamais le FiscalResult");
  });

  it("RFS.exercice provient de fiscalResult.exercice, jamais d'une valeur saisie séparément", () => {
    const fr = fiscalResult({ exercice: 2024 });
    const rfs = buildFiscalRepresentation({ fiscalResult: fr, identite: IDENTITE });
    assert.equal(rfs.exercice, 2024);
  });

  it("RFS.identite est la même référence que l'identité injectée", () => {
    const fr = fiscalResult();
    const rfs = buildFiscalRepresentation({ fiscalResult: fr, identite: IDENTITE });
    assert.equal(rfs.identite, IDENTITE);
  });

  it("immobilisations absentes → RFS.immobilisations undefined, jamais un plan vide inventé", () => {
    const rfs = buildFiscalRepresentation({ fiscalResult: fiscalResult(), identite: IDENTITE });
    assert.equal(rfs.immobilisations, undefined);
    assert.equal(rfs.trace.sources.immobilisations, undefined);
  });

  it("immobilisations fournies → lignes RFS strictement identiques aux lignes persistées (F-010), aucune transformation", () => {
    const plan: AmortissementPlan = {
      lignes: [
        { label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 },
        { label: "Mobilier - Pack meubles", montant: 5400, dureeAnnees: 7, dotationExercice: 491, amortissementsCumules: 491, vnc: 4909 },
      ],
      totalAnnuelExercice: 863,
      totalBrut: 42586,
    };
    const rfs = buildFiscalRepresentation({ fiscalResult: fiscalResult(), identite: IDENTITE, immobilisations: plan });
    assert.equal(rfs.immobilisations, plan, "même objet — aucune ligne recalculée ni réordonnée");
    assert.equal(rfs.trace.sources.immobilisations, "draft.logementAmortissement.plan (F-010)");
  });

  it("emprunts fournis → capitalRestantDu31_12 strictement identique à la valeur persistée (F-011), aucun recalcul", () => {
    const prets: PretFinancementExercice[] = [
      {
        pretId: "pret-1",
        typePret: "amortissable",
        interetsEmpruntExercice: 4602,
        interetsPreExploitation: 0,
        assuranceEmpruntExercice: 601,
        assurancePreExploitation: 0,
        capitalRembourseExercice: 496,
        capitalRestantDu31_12: 130256,
        fraisDossierDeductibles: 0,
        garantieDeductible: 1763,
        iraDeductible: 0,
      },
    ];
    const rfs = buildFiscalRepresentation({ fiscalResult: fiscalResult(), identite: IDENTITE, emprunts: prets });
    assert.equal(rfs.emprunts, prets, "même tableau — aucun solde recalculé");
    assert.equal(rfs.emprunts?.[0].capitalRestantDu31_12, 130256);
    assert.equal(rfs.trace.sources.emprunts, "draft.financementCharges.prets (F-011)");
  });

  it("trace.sourceFiscalResultAt provient de fiscalResult.trace.computedAt — permet de détecter un RFS bâti sur un calcul obsolète", () => {
    const fr = fiscalResult({ trace: { ksArtifacts: [], computedAt: "2025-05-01T10:00:00.000Z", journal: [] } });
    const rfs = buildFiscalRepresentation({ fiscalResult: fr, identite: IDENTITE });
    assert.equal(rfs.trace.sourceFiscalResultAt, "2025-05-01T10:00:00.000Z");
  });

  it("Cycle 35 — immobilisations fournies avec valeurTerrain → RFS.immobilisations.valeurTerrain strictement identique, aucun recalcul", () => {
    const plan = {
      lignes: [{ label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 }],
      totalAnnuelExercice: 372,
      totalBrut: 37186,
      valeurTerrain: 17960.39,
    };
    const rfs = buildFiscalRepresentation({ fiscalResult: fiscalResult(), identite: IDENTITE, immobilisations: plan });
    assert.equal(rfs.immobilisations, plan, "même objet — aucune valeur recalculée, valeurTerrain incluse");
    assert.equal(rfs.immobilisations?.valeurTerrain, 17960.39);
  });

  it("Cycle 35 — immobilisations fournies SANS valeurTerrain (dossier/fixture antérieur) → RFS.immobilisations.valeurTerrain undefined, jamais 0 inventé", () => {
    const plan = {
      lignes: [{ label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 }],
      totalAnnuelExercice: 372,
      totalBrut: 37186,
    };
    const rfs = buildFiscalRepresentation({ fiscalResult: fiscalResult(), identite: IDENTITE, immobilisations: plan });
    assert.equal(rfs.immobilisations?.valeurTerrain, undefined, "compatibilité ascendante — pas de 0 par défaut");
  });
});
