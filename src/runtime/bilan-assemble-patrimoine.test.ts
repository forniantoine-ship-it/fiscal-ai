/**
 * MICRO-JALON socle patrimonial P0-3 — source canonique du CRD (156/176).
 * Run: npx tsx --test src/runtime/bilan-assemble-patrimoine.test.ts
 *
 * Corrige `assemblePatrimoine()` : avant cette correction, quand
 * `BilanInputs.financements.clotureCRD` était défini, il écrasait
 * silencieusement `Σ rfs.emprunts[].capitalRestantDu31_12` (F-011) sans
 * jamais vérifier leur concordance — deux vérités possibles pour 156/176.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assemblePatrimoine } from "./capabilities/bilan/assemble-patrimoine";
import type { BilanInputs } from "./capabilities/bilan/types";
import type { FiscalResult } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { FiscalRepresentation } from "./capabilities/rfs/types";
import type { PretFinancementExercice } from "./capabilities/f011/types";

const FISCAL_RESULT: FiscalResult = {
  exercice: 2025,
  recettes: { total: 12000 },
  charges: { totalDeductible: 4000, chargesExploitation: 4000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 100 },
  resultatAvantAmort: 7000,
  amortCalcule: 0,
  amortDeduct: 0,
  amortReporte: 0,
  amortNonDeduitExercice: 0,
  amortReportesUtilises: 0,
  resultatFiscal: 5500,
  deficitNouveau: 0,
  deficitsImputes: 0,
  perteExceptionnelle: 0,
  stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
  trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
  status: "computed",
  anomalies: [],
};

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "Test CRD" };

const BASE_INPUTS: BilanInputs = {
  tresorerie: { bankMode: "DEDIE", closingCash: 1000 },
  compteExploitant: { ouverture: 0, apports: 0, prelevements: 0 },
  ran: { situation: "NATIF" },
  tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } },
};

function emprunt(capitalRestantDu31_12: number): PretFinancementExercice {
  return {
    pretId: "pret-1",
    typePret: "amortissable",
    interetsEmpruntExercice: 0,
    interetsPreExploitation: 0,
    assuranceEmpruntExercice: 0,
    assurancePreExploitation: 0,
    capitalRembourseExercice: 0,
    capitalRestantDu31_12,
    fraisDossierDeductibles: 0,
    garantieDeductible: 0,
    iraDeductible: 0,
  };
}

function rfs(overrides: Partial<FiscalRepresentation> = {}): FiscalRepresentation {
  return {
    exercice: FISCAL_RESULT.exercice,
    identite: IDENTITE,
    fiscalResult: FISCAL_RESULT,
    trace: {
      ksArtifacts: FISCAL_RESULT.trace.ksArtifacts,
      assembledAt: "2026-08-31T00:00:00.000Z",
      sourceFiscalResultAt: FISCAL_RESULT.trace.computedAt,
      sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
    },
    ...overrides,
  };
}

describe("assemblePatrimoine — correction P0-3 : source canonique du CRD", () => {
  it("C1 — F-011 (20000) = déclaré (20000) : cohérent, DISPONIBLE", () => {
    const patrimoine = assemblePatrimoine(rfs({ emprunts: [emprunt(20000)] }), { ...BASE_INPUTS, financements: { clotureCRD: 20000 } });
    assert.equal(patrimoine.emprunts.etat, "DISPONIBLE");
    assert.equal((patrimoine.emprunts as { totalCRD: number }).totalCRD, 20000);
  });

  it("C2 — F-011 (20000) ≠ déclaré (25000) : DIVERGENT, aucune valeur n'est choisie arbitrairement", () => {
    const patrimoine = assemblePatrimoine(rfs({ emprunts: [emprunt(20000)] }), { ...BASE_INPUTS, financements: { clotureCRD: 25000 } });
    assert.equal(patrimoine.emprunts.etat, "DIVERGENT");
    assert.equal((patrimoine.emprunts as { totalCRD: number }).totalCRD, undefined, "aucune des deux valeurs n'est publiée comme totalCRD");
  });

  it("C3 — F-011 absent, financements absent : INCONNU (donnée manquante), jamais 0", () => {
    const patrimoine = assemblePatrimoine(rfs(), BASE_INPUTS);
    assert.equal(patrimoine.emprunts.etat, "INCONNU");
  });

  it("C4a — seule F-011 présente : retenue telle quelle, aucune seconde valeur inventée", () => {
    const patrimoine = assemblePatrimoine(rfs({ emprunts: [emprunt(20000)] }), BASE_INPUTS);
    assert.equal(patrimoine.emprunts.etat, "DISPONIBLE");
    assert.equal((patrimoine.emprunts as { totalCRD: number }).totalCRD, 20000);
  });

  it("C4b — seule la source déclarée (financements.clotureCRD) est présente : retenue telle quelle", () => {
    const patrimoine = assemblePatrimoine(rfs(), { ...BASE_INPUTS, financements: { clotureCRD: 18000 } });
    assert.equal(patrimoine.emprunts.etat, "DISPONIBLE");
    assert.equal((patrimoine.emprunts as { totalCRD: number }).totalCRD, 18000);
  });
});

describe("assemblePatrimoine — tiers et découvert correctement propagés (P0-1/P0-2)", () => {
  it("tiers absent de BilanInputs → PatrimonialState.tiers est toujours défini, avec les deux postes INCONNU", () => {
    const patrimoine = assemblePatrimoine(rfs({ emprunts: [emprunt(20000)] }), { ...BASE_INPUTS, tiers: undefined });
    assert.equal(patrimoine.tiers.creances.status, "INCONNU");
    assert.equal(patrimoine.tiers.dettes.status, "INCONNU");
  });

  it("découvert déclaré et reconnu explicitement au passif : PatrimonialState.tresorerie.decouvertDettePassif porte le montant", () => {
    const patrimoine = assemblePatrimoine(rfs({ emprunts: [emprunt(20000)] }), {
      ...BASE_INPUTS,
      tresorerie: { bankMode: "DEDIE", closingCash: -350, decouvertDetteReconnue: 350 },
    });
    assert.equal(patrimoine.tresorerie.decouvertBancaire, 350);
    assert.equal(patrimoine.tresorerie.decouvertDettePassif, 350);
  });

  it("découvert déclaré sans reconnaissance : decouvertDettePassif reste undefined (orphelin)", () => {
    const patrimoine = assemblePatrimoine(rfs({ emprunts: [emprunt(20000)] }), {
      ...BASE_INPUTS,
      tresorerie: { bankMode: "DEDIE", closingCash: -350 },
    });
    assert.equal(patrimoine.tresorerie.decouvertBancaire, 350);
    assert.equal(patrimoine.tresorerie.decouvertDettePassif, undefined);
  });
});
