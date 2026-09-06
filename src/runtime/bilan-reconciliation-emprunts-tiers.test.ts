/**
 * P1-B.4 strict — réconciliation emprunts / découvert ↔ tiers.dettes.
 * Run: npx tsx --test src/runtime/bilan-reconciliation-emprunts-tiers.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { checkBilanEquilibre } from "./capabilities/bilan/check-bilan-equilibre";
import {
  appliquerCoherenceInclusionConjointe,
  resolveReconciliationDecouvertTiers,
  resolveReconciliationEmpruntsTiers,
} from "./capabilities/bilan/reconciliation-emprunts-tiers";
import { resolveVentilationTiers } from "./capabilities/bilan/ventilation-tiers";
import type { PatrimonialState } from "./capabilities/bilan/types";
import { assemblePatrimoine } from "./capabilities/bilan/assemble-patrimoine";
import type { BilanInputs } from "./capabilities/bilan/types";
import type { FiscalResult } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { FiscalRepresentation, ImmobilisationsRfs } from "./capabilities/rfs/types";
import type { PretFinancementExercice } from "./capabilities/f011/types";
function nul(): { status: "NUL_CONFIRME"; montant: number; raison: string } {
  return { status: "NUL_CONFIRME", montant: 0, raison: "nul" };
}

function patrimoineBase(overrides: Partial<PatrimonialState> = {}): PatrimonialState {
  return {
    exercice: 2025,
    resultatComptable: 0,
    immobilisations: { actifs: [], brutTotal: 50000, cumuleTotal: 10000, netTotal: 40000, brutFiable: true, netFiable: true, raisons: [] },
    tresorerie: { etat: "TRESORERIE_COMPLETE", clotureRetenue: 2000, ecart: 0, raison: "ok" },
    compteExploitant: { disponible: true, clotureN: 30000, ouvertureManquante: false, raison: "ok" },
    ran: { disponible: true, valeur: 0, raison: "ok" },
    emprunts: { etat: "DISPONIBLE", totalCRD: 15000, source: "F-011" },
    tiers: { creances: nul(), dettes: nul() },
    subventionsInvestissement: { status: "NUL_CONFIRME", montant: 0, raison: "ok" },
    lignesSimples: {
      autresImmobilisationsIncorporellesBrut: nul(),
      autresImmobilisationsIncorporellesNet: nul(),
      immobilisationsFinancieresBrut: nul(),
      immobilisationsFinancieresNet: nul(),
      avancesAcomptesVerses: nul(),
      avancesAcomptesVersesAmort: nul(),
      clientsAmortissementsProvisions: nul(),
      autresCreancesAmortissementsProvisions: nul(),
      valeursMobilieresPlacementBrut: nul(),
      valeursMobilieresPlacementNet: nul(),
      chargesConstateesAvance: nul(),
      chargesConstateesAvanceAmort: nul(),
      produitsConstatesAvance: nul(),
      autresDettes: nul(),
    },
    ventilationTiers: resolveVentilationTiers(undefined),
    reconciliationEmpruntsTiers: {
      etat: "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET",
      contributionEmpruntEquilibre: 15000,
      raison: "fixture",
      bloquant: false,
    },
    reconciliationDecouvertTiers: {
      etat: "AUCUN_DECOUVERT_CANONIQUE",
      contributionDecouvertEquilibre: 0,
      raison: "fixture",
      bloquant: false,
    },
    disponibilitesAmortissementsProvisions: nul(),
    ...overrides,
  };
}

describe("resolveReconciliationEmpruntsTiers — 3 états", () => {
  it("TEST 1 — séparé/exclu explicite : contribution emprunt = CRD, pas de blocage", () => {
    const res = resolveReconciliationEmpruntsTiers(
      { etat: "DISPONIBLE", totalCRD: 15000, source: "F-011" },
      { status: "DECLARE", montant: 10000, raison: "ok" },
      "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET",
    );
    assert.equal(res.etat, "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET");
    assert.equal(res.contributionEmpruntEquilibre, 15000);
    assert.equal(res.bloquant, false);
  });

  it("TEST 2 — inclus explicite : contribution emprunt équilibre = 0 (déjà dans bucket)", () => {
    const res = resolveReconciliationEmpruntsTiers(
      { etat: "DISPONIBLE", totalCRD: 15000, source: "F-011" },
      { status: "DECLARE", montant: 25000, raison: "ok" },
      "EMPRUNT_INCLUS_DANS_BUCKET",
    );
    assert.equal(res.etat, "EMPRUNT_INCLUS_DANS_BUCKET");
    assert.equal(res.contributionEmpruntEquilibre, 0);
    assert.equal(res.bloquant, false);
  });

  it("TEST 3 — aucune réconciliation : BLOCAGE (différence de montants ne tranche PAS)", () => {
    const res = resolveReconciliationEmpruntsTiers(
      { etat: "DISPONIBLE", totalCRD: 15000, source: "F-011" },
      { status: "DECLARE", montant: 25000, raison: "ok" },
      undefined,
    );
    assert.equal(res.etat, "EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE");
    assert.equal(res.bloquant, true);
    assert.equal(res.contributionEmpruntEquilibre, undefined);
    // 25000 ≠ 15000 ne constitue PAS une preuve de séparation
    assert.ok(res.raison.includes("différence de montants") || res.raison.includes("NON_RECONCILIEE"));
  });

  it("TEST 4 — tiers.dettes INCONNU + emprunt : jamais inventer 0", () => {
    const res = resolveReconciliationEmpruntsTiers(
      { etat: "DISPONIBLE", totalCRD: 15000, source: "F-011" },
      { status: "INCONNU", raison: "absent" },
      undefined,
    );
    assert.equal(res.etat, "EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE");
    assert.equal(res.bloquant, true);
    assert.ok(res.raison.includes("INCONNU"));
  });

  it("TEST 5 — dettes DECLARE, aucun emprunt canonique : AUCUN_EMPRUNT", () => {
    const res = resolveReconciliationEmpruntsTiers(
      { etat: "DISPONIBLE", totalCRD: 0, source: "F-011" },
      { status: "DECLARE", montant: 5000, raison: "ok" },
      undefined,
    );
    assert.equal(res.etat, "AUCUN_EMPRUNT_CANONIQUE");
    assert.equal(res.bloquant, false);
  });

  it("TEST 6 — emprunt + dettes NUL_CONFIRME : séparé (bucket vide), contribution = CRD", () => {
    const res = resolveReconciliationEmpruntsTiers(
      { etat: "DISPONIBLE", totalCRD: 15000, source: "F-011" },
      { status: "NUL_CONFIRME", montant: 0, raison: "nul" },
      undefined,
    );
    assert.equal(res.etat, "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET");
    assert.equal(res.contributionEmpruntEquilibre, 15000);
    assert.equal(res.bloquant, false);
  });

  it("TEST 7 — inclusion déclarée mais bucket < CRD : blocage", () => {
    const res = resolveReconciliationEmpruntsTiers(
      { etat: "DISPONIBLE", totalCRD: 15000, source: "F-011" },
      { status: "DECLARE", montant: 10000, raison: "ok" },
      "EMPRUNT_INCLUS_DANS_BUCKET",
    );
    assert.equal(res.bloquant, true);
  });
});

describe("checkBilanEquilibre — non-double-comptage emprunt", () => {
  it("TEST 1 intégration — séparé : passif = 142 + dettes + emprunt (une fois)", () => {
    // Actif 40000+2000+0=42000 ; Passif = clotureN + 10000 dettes + 15000 emprunt
    // → clotureN = 17000
    const patrimoine = patrimoineBase({
      tiers: { creances: nul(), dettes: { status: "DECLARE", montant: 10000, raison: "ok" } },
      compteExploitant: { disponible: true, clotureN: 17000, ouvertureManquante: false, raison: "ok" },
      reconciliationEmpruntsTiers: {
        etat: "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET",
        contributionEmpruntEquilibre: 15000,
        raison: "séparé",
        bloquant: false,
      },
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "EQUILIBRE");
    assert.equal(result.totalPassif, 42000); // 17000+10000+15000 — pas +15000×2
  });

  it("TEST 2 intégration — inclus : passif = 142 + bucket seul (pas +CRD)", () => {
    // Actif 42000 ; Passif = clotureN + 25000 (inclut emprunt) + 0 emprunt extra
    // → clotureN = 17000
    const patrimoine = patrimoineBase({
      tiers: { creances: nul(), dettes: { status: "DECLARE", montant: 25000, raison: "ok" } },
      compteExploitant: { disponible: true, clotureN: 17000, ouvertureManquante: false, raison: "ok" },
      reconciliationEmpruntsTiers: {
        etat: "EMPRUNT_INCLUS_DANS_BUCKET",
        contributionEmpruntEquilibre: 0,
        raison: "inclus",
        bloquant: false,
      },
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "EQUILIBRE");
    assert.equal(result.totalPassif, 42000); // 17000+25000+0 — pas 17000+25000+15000
  });

  it("TEST 3 intégration — non réconcilié : BLOCAGE même si montants différeraient", () => {
    const patrimoine = patrimoineBase({
      tiers: { creances: nul(), dettes: { status: "DECLARE", montant: 25000, raison: "ok" } },
      reconciliationEmpruntsTiers: {
        etat: "EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE",
        contributionEmpruntEquilibre: undefined,
        raison: "EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE",
        bloquant: true,
      },
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DIVERGENCE_SOURCE");
    assert.ok(result.reasons.some((r) => r.includes("EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE")));
  });
});

describe("découvert — même exigence", () => {
  it("TEST 8a — découvert + dettes DECLARE sans réconciliation → blocage", () => {
    const res = resolveReconciliationDecouvertTiers(
      { etat: "TRESORERIE_DECLAREE", clotureRetenue: 0, decouvertBancaire: 500, decouvertDettePassif: 500, raison: "ok" },
      { status: "DECLARE", montant: 2000, raison: "ok" },
      undefined,
    );
    assert.equal(res.etat, "DECOUVERT_PRESENCE_BUCKET_NON_RECONCILIEE");
    assert.equal(res.bloquant, true);
  });

  it("TEST 8b — découvert séparé explicite → contribution = découvert", () => {
    const res = resolveReconciliationDecouvertTiers(
      { etat: "TRESORERIE_DECLAREE", clotureRetenue: 0, decouvertBancaire: 500, decouvertDettePassif: 500, raison: "ok" },
      { status: "DECLARE", montant: 2000, raison: "ok" },
      "DECOUVERT_SEPARE_ET_EXCLU_DU_BUCKET",
    );
    assert.equal(res.contributionDecouvertEquilibre, 500);
    assert.equal(res.bloquant, false);
  });
});

describe("TEST 7 — nature EMPRUNT en ventilation", () => {
  it("refus + jamais dumpé en 175", () => {
    const v = resolveVentilationTiers({
      postes: [{ nature: "EMPRUNT" as never, montant: 15000 }],
    });
    assert.ok(v.conflits.some((c) => c.code === "NATURE_INTERDITE"));
    assert.equal(v.cases.autresDettes.status, "INCONNU");
  });
});

describe("Correction R-02 — inclusion CONJOINTE emprunt + découvert", () => {
  it("R02-1 — emprunt séparé + découvert séparé : contributions additionnées, pas de blocage", () => {
    const emprunt = resolveReconciliationEmpruntsTiers(
      { etat: "DISPONIBLE", totalCRD: 100000, source: "F-011" },
      { status: "DECLARE", montant: 10000, raison: "ok" },
      "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET",
    );
    const decouvert = resolveReconciliationDecouvertTiers(
      { etat: "TRESORERIE_NULLE_DECLAREE", clotureRetenue: 0, decouvertBancaire: 5000, decouvertDettePassif: 5000, raison: "ok" },
      { status: "DECLARE", montant: 10000, raison: "ok" },
      "DECOUVERT_SEPARE_ET_EXCLU_DU_BUCKET",
    );
    const joint = appliquerCoherenceInclusionConjointe(emprunt, decouvert, { status: "DECLARE", montant: 10000, raison: "ok" }, 100000, 5000);
    assert.equal(joint.reconciliationEmpruntsTiers.bloquant, false);
    assert.equal(joint.reconciliationDecouvertTiers.bloquant, false);
    assert.equal(joint.reconciliationEmpruntsTiers.contributionEmpruntEquilibre, 100000);
    assert.equal(joint.reconciliationDecouvertTiers.contributionDecouvertEquilibre, 5000);
  });

  it("R02-2 — les deux INCLUS, bucket = CRD + découvert : OK, contributions 0+0", () => {
    const emprunt = resolveReconciliationEmpruntsTiers(
      { etat: "DISPONIBLE", totalCRD: 100000, source: "F-011" },
      { status: "DECLARE", montant: 105000, raison: "ok" },
      "EMPRUNT_INCLUS_DANS_BUCKET",
    );
    const decouvert = resolveReconciliationDecouvertTiers(
      { etat: "TRESORERIE_NULLE_DECLAREE", clotureRetenue: 0, decouvertBancaire: 5000, decouvertDettePassif: 5000, raison: "ok" },
      { status: "DECLARE", montant: 105000, raison: "ok" },
      "DECOUVERT_INCLUS_DANS_BUCKET",
    );
    const joint = appliquerCoherenceInclusionConjointe(emprunt, decouvert, { status: "DECLARE", montant: 105000, raison: "ok" }, 100000, 5000);
    assert.equal(joint.reconciliationEmpruntsTiers.bloquant, false);
    assert.equal(joint.reconciliationDecouvertTiers.bloquant, false);
    assert.equal(joint.reconciliationEmpruntsTiers.contributionEmpruntEquilibre, 0);
    assert.equal(joint.reconciliationDecouvertTiers.contributionDecouvertEquilibre, 0);
  });

  it("R02-3 / R02-9 — les deux INCLUS, bucket = emprunt seulement (100k < 105k) : BLOCAGE", () => {
    const emprunt = resolveReconciliationEmpruntsTiers(
      { etat: "DISPONIBLE", totalCRD: 100000, source: "F-011" },
      { status: "DECLARE", montant: 100000, raison: "ok" },
      "EMPRUNT_INCLUS_DANS_BUCKET",
    );
    const decouvert = resolveReconciliationDecouvertTiers(
      { etat: "TRESORERIE_NULLE_DECLAREE", clotureRetenue: 0, decouvertBancaire: 5000, decouvertDettePassif: 5000, raison: "ok" },
      { status: "DECLARE", montant: 100000, raison: "ok" },
      "DECOUVERT_INCLUS_DANS_BUCKET",
    );
    // Sans R-02, les deux unitaires passeraient (100k≥100k et 100k≥5k).
    assert.equal(emprunt.bloquant, false, "précondition : unitaire emprunt non bloquant");
    assert.equal(decouvert.bloquant, false, "précondition : unitaire découvert non bloquant");

    const joint = appliquerCoherenceInclusionConjointe(emprunt, decouvert, { status: "DECLARE", montant: 100000, raison: "ok" }, 100000, 5000);
    assert.equal(joint.reconciliationEmpruntsTiers.bloquant, true);
    assert.equal(joint.reconciliationDecouvertTiers.bloquant, true);
    assert.ok(joint.reconciliationEmpruntsTiers.raison.includes("EMPRUNT_DECOUVERT_INCLUS_SUPERIEURS_AU_BUCKET"));
  });

  it("R02-4 — les deux INCLUS, bucket > CRD + découvert : OK (reliquat opaque conservé dans le bucket)", () => {
    const emprunt = resolveReconciliationEmpruntsTiers(
      { etat: "DISPONIBLE", totalCRD: 100000, source: "F-011" },
      { status: "DECLARE", montant: 120000, raison: "ok" },
      "EMPRUNT_INCLUS_DANS_BUCKET",
    );
    const decouvert = resolveReconciliationDecouvertTiers(
      { etat: "TRESORERIE_NULLE_DECLAREE", clotureRetenue: 0, decouvertBancaire: 5000, decouvertDettePassif: 5000, raison: "ok" },
      { status: "DECLARE", montant: 120000, raison: "ok" },
      "DECOUVERT_INCLUS_DANS_BUCKET",
    );
    const joint = appliquerCoherenceInclusionConjointe(emprunt, decouvert, { status: "DECLARE", montant: 120000, raison: "ok" }, 100000, 5000);
    assert.equal(joint.reconciliationEmpruntsTiers.bloquant, false);
    assert.equal(joint.reconciliationDecouvertTiers.contributionDecouvertEquilibre, 0);
  });

  it("R02-5 — emprunt INCLUS seul, découvert absent : logique unitaire conservée", () => {
    const emprunt = resolveReconciliationEmpruntsTiers(
      { etat: "DISPONIBLE", totalCRD: 15000, source: "F-011" },
      { status: "DECLARE", montant: 25000, raison: "ok" },
      "EMPRUNT_INCLUS_DANS_BUCKET",
    );
    const decouvert = resolveReconciliationDecouvertTiers(
      { etat: "TRESORERIE_COMPLETE", clotureRetenue: 1000, raison: "ok" },
      { status: "DECLARE", montant: 25000, raison: "ok" },
      undefined,
    );
    const joint = appliquerCoherenceInclusionConjointe(emprunt, decouvert, { status: "DECLARE", montant: 25000, raison: "ok" }, 15000, 0);
    assert.equal(joint.reconciliationEmpruntsTiers.bloquant, false);
    assert.equal(joint.reconciliationEmpruntsTiers.contributionEmpruntEquilibre, 0);
    assert.equal(joint.reconciliationDecouvertTiers.etat, "AUCUN_DECOUVERT_CANONIQUE");
  });

  it("R02-6 — découvert INCLUS seul, emprunt absent (CRD 0) : logique unitaire conservée", () => {
    const emprunt = resolveReconciliationEmpruntsTiers(
      { etat: "DISPONIBLE", totalCRD: 0, source: "F-011" },
      { status: "DECLARE", montant: 5000, raison: "ok" },
      undefined,
    );
    const decouvert = resolveReconciliationDecouvertTiers(
      { etat: "TRESORERIE_NULLE_DECLAREE", clotureRetenue: 0, decouvertBancaire: 5000, decouvertDettePassif: 5000, raison: "ok" },
      { status: "DECLARE", montant: 5000, raison: "ok" },
      "DECOUVERT_INCLUS_DANS_BUCKET",
    );
    const joint = appliquerCoherenceInclusionConjointe(emprunt, decouvert, { status: "DECLARE", montant: 5000, raison: "ok" }, 0, 5000);
    assert.equal(joint.reconciliationDecouvertTiers.bloquant, false);
    assert.equal(joint.reconciliationDecouvertTiers.contributionDecouvertEquilibre, 0);
  });

  it("R02-7 — emprunt + dettes INCONNU : blocage unitaire inchangé", () => {
    const res = resolveReconciliationEmpruntsTiers(
      { etat: "DISPONIBLE", totalCRD: 15000, source: "F-011" },
      { status: "INCONNU", raison: "absent" },
      undefined,
    );
    assert.equal(res.bloquant, true);
  });

  it("R02-8 — découvert + dettes INCONNU : blocage unitaire inchangé", () => {
    const res = resolveReconciliationDecouvertTiers(
      { etat: "TRESORERIE_NULLE_DECLAREE", clotureRetenue: 0, decouvertBancaire: 500, decouvertDettePassif: 500, raison: "ok" },
      { status: "INCONNU", raison: "absent" },
      undefined,
    );
    assert.equal(res.bloquant, true);
  });

  it("R02-multi — Σ CRD multi-emprunts + découvert INCLUS > bucket : blocage via assemblePatrimoine", () => {
    const fiscalResult: FiscalResult = {
      exercice: 2025,
      recettes: { total: 0 },
      charges: { totalDeductible: 0, chargesExploitation: 0, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 0 },
      resultatAvantAmort: 0,
      amortCalcule: 0,
      amortDeduct: 0,
      amortReporte: 0,
      amortReportesUtilises: 0,
      resultatFiscal: 0,
      deficitNouveau: 0,
      deficitsImputes: 0,
      perteExceptionnelle: 0,
      stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
      trace: { ksArtifacts: [], computedAt: "2026-01-01T00:00:00.000Z", journal: [] },
      status: "computed",
      anomalies: [],
    };
    const pret = (crd: number, id: string): PretFinancementExercice => ({
      pretId: id,
      typePret: "amortissable",
      interetsEmpruntExercice: 0,
      interetsPreExploitation: 0,
      assuranceEmpruntExercice: 0,
      assurancePreExploitation: 0,
      capitalRembourseExercice: 0,
      capitalRestantDu31_12: crd,
      fraisDossierDeductibles: 0,
      garantieDeductible: 0,
      iraDeductible: 0,
    });
    const immo: ImmobilisationsRfs = {
      lignes: [{ label: "x", montant: 1, dureeAnnees: 1, dotationExercice: 0, amortissementsCumules: 0, vnc: 1 }],
      totalAnnuelExercice: 0,
      totalBrut: 1,
      valeurTerrain: 0,
    };
    const rfs: FiscalRepresentation = {
      exercice: 2025,
      identite: { siren: "1", siret: "1", denomination: "t" } as IdentiteDeclarante,
      fiscalResult,
      immobilisations: immo,
      emprunts: [pret(60000, "a"), pret(40000, "b")], // Σ = 100000
      trace: {
        ksArtifacts: [],
        assembledAt: "2026-01-01T00:00:00.000Z",
        sourceFiscalResultAt: "2026-01-01T00:00:00.000Z",
        sources: { identite: "t", fiscalResult: "t" },
      },
    };
    const inputs: BilanInputs = {
      tresorerie: { bankMode: "DEDIE", closingCash: -5000, decouvertDetteReconnue: 5000 },
      compteExploitant: { ouverture: 0, apports: 0, prelevements: 0 },
      ran: { situation: "NATIF" },
      tiers: {
        creances: { status: "NUL_CONFIRME" },
        dettes: { status: "DECLARE", montant: 100000 },
        reconciliationEmprunts: "EMPRUNT_INCLUS_DANS_BUCKET",
        reconciliationDecouvert: "DECOUVERT_INCLUS_DANS_BUCKET",
      },
      subventionsInvestissement: { status: "NUL_CONFIRME" },
    };
    const patrimoine = assemblePatrimoine(rfs, inputs);
    assert.equal(patrimoine.emprunts.etat, "DISPONIBLE");
    assert.equal(patrimoine.emprunts.etat === "DISPONIBLE" ? patrimoine.emprunts.totalCRD : 0, 100000);
    assert.equal(patrimoine.reconciliationEmpruntsTiers.bloquant, true);
    assert.ok(patrimoine.reconciliationEmpruntsTiers.raison.includes("EMPRUNT_DECOUVERT_INCLUS_SUPERIEURS_AU_BUCKET"));
  });

  it("R02-G — aucun emprunt + aucun découvert : comportement historique non bloquant", () => {
    const emprunt = resolveReconciliationEmpruntsTiers({ etat: "INCONNU", raison: "absent" }, { status: "NUL_CONFIRME", montant: 0, raison: "nul" }, undefined);
    const decouvert = resolveReconciliationDecouvertTiers(
      { etat: "TRESORERIE_COMPLETE", clotureRetenue: 100, raison: "ok" },
      { status: "NUL_CONFIRME", montant: 0, raison: "nul" },
      undefined,
    );
    const joint = appliquerCoherenceInclusionConjointe(emprunt, decouvert, { status: "NUL_CONFIRME", montant: 0, raison: "nul" }, 0, 0);
    assert.equal(joint.reconciliationEmpruntsTiers.bloquant, false);
    assert.equal(joint.reconciliationDecouvertTiers.bloquant, false);
  });
});
