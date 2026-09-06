/**
 * MICRO-JALON P1-B.3 — ventilation économique des tiers (nature → case Cerfa).
 * Aucune UX / questionnaire. Les buckets P0 ne sont jamais projetés en case.
 * Run: npx tsx --test src/runtime/bilan-ventilation-tiers.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assemblePatrimoine } from "./capabilities/bilan/assemble-patrimoine";
import { resolveLignesSimples } from "./capabilities/bilan/lignes-simples";
import { resolveTiers } from "./capabilities/bilan/tiers";
import {
  caseCerfaPourNature,
  detecterConflitsDoubleComptage,
  gateTotal096AvecVentilation,
  gateTotal176AvecVentilation,
  resolveVentilationTiers,
} from "./capabilities/bilan/ventilation-tiers";
import {
  resolveReconciliationDecouvertTiers,
  resolveReconciliationEmpruntsTiers,
} from "./capabilities/bilan/reconciliation-emprunts-tiers";
import type { BilanInputs, LignesSimplesResolution, VentilationTiersResolution } from "./capabilities/bilan/types";
import type { FiscalResult } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { FiscalRepresentation } from "./capabilities/rfs/types";

function montant(res: { status: string; montant?: number }): number | undefined {
  return res.status === "DECLARE" || res.status === "NUL_CONFIRME" || res.status === "NON_APPLICABLE"
    ? (res as { montant: number }).montant
    : undefined;
}

describe("resolveVentilationTiers — classification nature → case", () => {
  it("1 — créance client (loyer dû) → case 068 DECLARE", () => {
    const res = resolveVentilationTiers({
      postes: [{ nature: "LOYER_DU_PAR_LOCATAIRE", montant: 1200, libelle: "Loyer décembre dû par le locataire" }],
    });
    assert.equal(caseCerfaPourNature("LOYER_DU_PAR_LOCATAIRE"), "068");
    assert.equal(res.cases.clients.status, "DECLARE");
    assert.equal(montant(res.cases.clients), 1200);
    assert.equal(res.cases.autresCreances.status, "INCONNU", "ne dump pas vers 072");
  });

  it("2 — dette fournisseur → case 166", () => {
    const res = resolveVentilationTiers({
      postes: [{ nature: "FOURNISSEUR_NON_PAYE", montant: 450, libelle: "Facture plombier non payée" }],
    });
    assert.equal(res.cases.fournisseurs.status, "DECLARE");
    assert.equal(montant(res.cases.fournisseurs), 450);
  });

  it("3 — dette fiscale/sociale → case 172", () => {
    const res = resolveVentilationTiers({
      postes: [{ nature: "DETTE_FISCALE_OU_SOCIALE", montant: 320 }],
    });
    assert.equal(res.cases.dettesFiscalesSociales.status, "DECLARE");
    assert.equal(montant(res.cases.dettesFiscalesSociales), 320);
  });

  it("4 — dépôt de garantie → case 175", () => {
    const res = resolveVentilationTiers({
      postes: [{ nature: "DEPOT_GARANTIE_LOCATAIRE", montant: 1500, libelle: "Dépôt de garantie locataire" }],
    });
    assert.equal(res.cases.autresDettes.status, "DECLARE");
    assert.equal(montant(res.cases.autresDettes), 1500);
  });

  it("5 — loyer encaissé d'avance → case 174", () => {
    const res = resolveVentilationTiers({
      postes: [{ nature: "LOYER_ENCAISSE_D_AVANCE", montant: 800 }],
    });
    assert.equal(res.cases.produitsConstatesAvance.status, "DECLARE");
    assert.equal(montant(res.cases.produitsConstatesAvance), 800);
  });

  it("6 — acompte versé à un fournisseur → case 064", () => {
    const res = resolveVentilationTiers({
      postes: [{ nature: "ACOMPTE_VERSE_A_FOURNISSEUR", montant: 200 }],
    });
    assert.equal(res.cases.avancesAcomptesVerses.status, "DECLARE");
    assert.equal(montant(res.cases.avancesAcomptesVerses), 200);
  });

  it("7 — nature inconnue reste non ventilée (INCONNU sur les cases, jamais 072/175)", () => {
    const res = resolveVentilationTiers({
      postes: [{ nature: "NATURE_INCONNUE", montant: 999, libelle: "Somme dont on ignore la nature" }],
    });
    assert.equal(res.montantsNonVentiles.length, 1);
    assert.equal(res.montantsNonVentiles[0]?.montant, 999);
    assert.equal(res.cases.autresCreances.status, "INCONNU");
    assert.equal(res.cases.autresDettes.status, "INCONNU");
    assert.equal(res.projectionFiable, false);
  });

  it("8 — nature inconnue ne devient jamais 0", () => {
    const res = resolveVentilationTiers({
      postes: [{ nature: "NATURE_INCONNUE", montant: 50 }],
    });
    assert.ok(res.montantsNonVentiles[0] && res.montantsNonVentiles[0].montant !== 0);
    assert.equal("montant" in res.cases.clients, false);
  });

  it("173 est NON_APPLICABLE pour EI même sans postes", () => {
    const res = resolveVentilationTiers(undefined);
    assert.equal(res.cases.comptesCourantsAssocies.status, "NON_APPLICABLE");
    assert.equal(montant(res.cases.comptesCourantsAssocies), 0);
  });

  it("plusieurs postes même nature : somme DECLARE", () => {
    const res = resolveVentilationTiers({
      postes: [
        { nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 },
        { nature: "LOYER_DU_PAR_LOCATAIRE", montant: 700 },
      ],
    });
    assert.equal(montant(res.cases.clients), 1200);
  });
});

describe("anti-double-comptage P1-B.3", () => {
  const lignesVides = resolveLignesSimples(undefined);

  function baseVentilation(overrides?: Partial<VentilationTiersResolution>): VentilationTiersResolution {
    const v = resolveVentilationTiers({
      postes: [{ nature: "FOURNISSEUR_NON_PAYE", montant: 100 }],
    });
    return { ...v, ...overrides };
  }

  it("9 — dette ventilée + bucket tiers.dettes DECLARE divergent → conflit BUCKET_TIERS_ET_VENTILATION", () => {
    const ventilation = baseVentilation(); // fournisseur 100
    const tiers = resolveTiers({ creances: { status: "NUL_CONFIRME" }, dettes: { status: "DECLARE", montant: 500 } });
    const conflits = detecterConflitsDoubleComptage({
      ventilation,
      tiers,
      emprunts: { etat: "INCONNU", raison: "n/a" },
      tresorerie: { etat: "TRESORERIE_COMPLETE", clotureRetenue: 0, raison: "ok" },
      lignesSimples: lignesVides,
    });
    assert.ok(conflits.some((c) => c.code === "BUCKET_TIERS_ET_VENTILATION"));
  });

  it("9b — dette ventilée + bucket DECLARE égal → pas de conflit BUCKET (couverture complète P1-B.4)", () => {
    const ventilation = baseVentilation(); // fournisseur 100
    const tiers = resolveTiers({ creances: { status: "NUL_CONFIRME" }, dettes: { status: "DECLARE", montant: 100 } });
    const conflits = detecterConflitsDoubleComptage({
      ventilation,
      tiers,
      emprunts: { etat: "INCONNU", raison: "n/a" },
      tresorerie: { etat: "TRESORERIE_COMPLETE", clotureRetenue: 0, raison: "ok" },
      lignesSimples: lignesVides,
    });
    assert.ok(!conflits.some((c) => c.code === "BUCKET_TIERS_ET_VENTILATION"));
  });

  it("10a — nature EMPRUNT interdite en ventilation (source canonique 156)", () => {
    const res = resolveVentilationTiers({
      postes: [{ nature: "EMPRUNT" as never, montant: 20000, libelle: "Capital restant dû" }],
    });
    assert.ok(res.conflits.some((c) => c.code === "NATURE_INTERDITE"));
    assert.equal(res.cases.autresDettes.status, "INCONNU", "l'emprunt n'est pas dumpé en 175");
    assert.equal(res.projectionFiable, false);
  });

  it("10b — découvert porté au passif + tiers.dettes DECLARE sans réconciliation → NON_RECONCILIEE bloquant", () => {
    const res = resolveReconciliationDecouvertTiers(
      {
        etat: "TRESORERIE_DECLAREE",
        clotureRetenue: 0,
        decouvertBancaire: 500,
        decouvertDettePassif: 500,
        raison: "découvert",
      },
      { status: "DECLARE", montant: 500, raison: "ok" },
      undefined,
    );
    assert.equal(res.etat, "DECOUVERT_PRESENCE_BUCKET_NON_RECONCILIEE");
    assert.equal(res.bloquant, true);
  });

  it("10c — emprunt F-011 + bucket tiers.dettes DECLARE sans réconciliation → NON_RECONCILIEE bloquant", () => {
    const res = resolveReconciliationEmpruntsTiers(
      { etat: "DISPONIBLE", totalCRD: 20000, source: "F-011" },
      { status: "DECLARE", montant: 800, raison: "ok" },
      undefined,
    );
    assert.equal(res.etat, "EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE");
    assert.equal(res.bloquant, true);
  });

  it("lignesSimples DECLARE et ventilation DECLARE divergents sur 175 → conflit", () => {
    const ventilation = resolveVentilationTiers({
      postes: [{ nature: "DEPOT_GARANTIE_LOCATAIRE", montant: 1500 }],
    });
    const lignesSimples = resolveLignesSimples({ autresDettes: { status: "DECLARE", montant: 2000 } });
    const conflits = detecterConflitsDoubleComptage({
      ventilation,
      tiers: resolveTiers({ creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } }),
      emprunts: { etat: "INCONNU", raison: "n/a" },
      tresorerie: { etat: "TRESORERIE_COMPLETE", clotureRetenue: 0, raison: "ok" },
      lignesSimples,
    });
    assert.ok(conflits.some((c) => c.code === "LIGNE_SIMPLE_ET_VENTILATION" && c.raison.includes("175")));
  });
});

describe("gates totaux avec ventilation", () => {
  function toutesLignesConnues(): LignesSimplesResolution {
    return resolveLignesSimples({
      autresImmobilisationsIncorporellesBrut: { status: "NUL_CONFIRME" },
      autresImmobilisationsIncorporellesNet: { status: "NUL_CONFIRME" },
      immobilisationsFinancieresBrut: { status: "NUL_CONFIRME" },
      immobilisationsFinancieresNet: { status: "NUL_CONFIRME" },
      avancesAcomptesVerses: { status: "NUL_CONFIRME" },
      avancesAcomptesVersesAmort: { status: "NUL_CONFIRME" },
      clientsAmortissementsProvisions: { status: "NUL_CONFIRME" },
      autresCreancesAmortissementsProvisions: { status: "NUL_CONFIRME" },
      valeursMobilieresPlacementBrut: { status: "NUL_CONFIRME" },
      valeursMobilieresPlacementNet: { status: "NUL_CONFIRME" },
      chargesConstateesAvance: { status: "NUL_CONFIRME" },
      chargesConstateesAvanceAmort: { status: "NUL_CONFIRME" },
      produitsConstatesAvance: { status: "NUL_CONFIRME" },
      autresDettes: { status: "NUL_CONFIRME" },
    });
  }

  it("11 — 068 INCONNU bloque 096 même si 064/080/092 connus", () => {
    const lignes = toutesLignesConnues();
    const ventilation = resolveVentilationTiers({
      postes: [{ nature: "ACOMPTE_VERSE_A_FOURNISSEUR", montant: 10 }],
    });
    // 068/072 restent INCONNU
    const gate = gateTotal096AvecVentilation(lignes, ventilation);
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("068"));
  });

  it("11b — 166 INCONNU bloque 176", () => {
    const lignes = toutesLignesConnues();
    const ventilation = resolveVentilationTiers({
      postes: [{ nature: "DEPOT_GARANTIE_LOCATAIRE", montant: 1500 }],
    });
    const gate = gateTotal176AvecVentilation(lignes, ventilation);
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("166"));
  });

  it("11c — toutes composantes ventilées connues → COMPOSANTES_CONNUES (ne publie pas le Cerfa)", () => {
    const lignes = toutesLignesConnues();
    const ventilation = resolveVentilationTiers({
      postes: [
        { nature: "ACOMPTE_VERSE_A_FOURNISSEUR", montant: 0 }, // will DECLARE 0? montant 0 DECLARE
        { nature: "LOYER_DU_PAR_LOCATAIRE", montant: 1 },
        { nature: "AUTRE_CREANCE_ACTIVITE", montant: 1 },
        { nature: "CHARGE_CONSTATEE_AVANCE", montant: 1 },
        { nature: "ACOMPTE_RECU_SUR_COMMANDE", montant: 1 },
        { nature: "FOURNISSEUR_NON_PAYE", montant: 1 },
        { nature: "DETTE_FISCALE_OU_SOCIALE", montant: 1 },
        { nature: "LOYER_ENCAISSE_D_AVANCE", montant: 1 },
        { nature: "DEPOT_GARANTIE_LOCATAIRE", montant: 1 },
      ],
    });
    // For 096 we need 064,068,072,080,092 — 080 from lignes NUL_CONFIRME
    assert.equal(gateTotal096AvecVentilation(lignes, ventilation).status, "COMPOSANTES_CONNUES");
    assert.equal(gateTotal176AvecVentilation(lignes, ventilation).status, "COMPOSANTES_CONNUES");
  });
});

describe("assemblePatrimoine — ventilation intégrée sans casser P0/P1-A/P1-B.2", () => {
  const FISCAL_RESULT: FiscalResult = {
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
    trace: { ksArtifacts: [], computedAt: "2026-09-06T00:00:00.000Z", journal: [] },
    status: "computed",
    anomalies: [],
  };
  const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "P1-B.3" };

  function rfs(): FiscalRepresentation {
    return {
      exercice: 2025,
      identite: IDENTITE,
      fiscalResult: FISCAL_RESULT,
      emprunts: [
        {
          pretId: "p",
          typePret: "amortissable",
          interetsEmpruntExercice: 0,
          interetsPreExploitation: 0,
          assuranceEmpruntExercice: 0,
          assurancePreExploitation: 0,
          capitalRembourseExercice: 0,
          capitalRestantDu31_12: 10000,
          fraisDossierDeductibles: 0,
          garantieDeductible: 0,
          iraDeductible: 0,
        },
      ],
      trace: {
        ksArtifacts: [],
        assembledAt: "2026-09-06T00:00:00.000Z",
        sourceFiscalResultAt: FISCAL_RESULT.trace.computedAt,
        sources: { identite: "test", fiscalResult: "test" },
      },
    };
  }

  it("12 — buckets P0 ne sont pas projetés : sans ventilation, cases INCONNU même si tiers.creances DECLARE", () => {
    const inputs: BilanInputs = {
      tresorerie: { bankMode: "DEDIE", closingCash: 1000 },
      compteExploitant: { ouverture: 0, apports: 0, prelevements: 0 },
      ran: { situation: "NATIF" },
      tiers: { creances: { status: "DECLARE", montant: 500 }, dettes: { status: "NUL_CONFIRME" } },
      subventionsInvestissement: { status: "NUL_CONFIRME" },
    };
    const patrimoine = assemblePatrimoine(rfs(), inputs);
    assert.equal(patrimoine.tiers.creances.status, "DECLARE");
    assert.equal(patrimoine.ventilationTiers.cases.clients.status, "INCONNU", "tiers.creances ≠ 068");
    assert.equal(patrimoine.ventilationTiers.cases.autresCreances.status, "INCONNU", "tiers.creances ≠ 072");
  });

  it("12b — ventilation classifiée + bucket NUL_CONFIRME : conflit explicite (incohérent P1-B.4)", () => {
    const inputs: BilanInputs = {
      tresorerie: { bankMode: "DEDIE", closingCash: 1000 },
      compteExploitant: { ouverture: 0, apports: 0, prelevements: 0 },
      ran: { situation: "NATIF" },
      tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } },
      subventionsInvestissement: { status: "NUL_CONFIRME" },
      ventilationTiers: {
        postes: [{ nature: "LOYER_DU_PAR_LOCATAIRE", montant: 600 }],
      },
    };
    const patrimoine = assemblePatrimoine(rfs(), inputs);
    assert.equal(patrimoine.ventilationTiers.cases.clients.status, "DECLARE");
    assert.equal(montant(patrimoine.ventilationTiers.cases.clients), 600);
    assert.equal(patrimoine.subventionsInvestissement.status, "NUL_CONFIRME");
    // P1-B.4 : confirmer 0 au bucket tout en déclarant une créance ventilée est incohérent.
    assert.ok(patrimoine.ventilationTiers.conflits.some((c) => c.code === "BUCKET_TIERS_ET_VENTILATION"));
  });

  it("12c — ventilation + bucket DECLARE égal : pas de conflit bucket, contribution unique possible", () => {
    const inputs: BilanInputs = {
      tresorerie: { bankMode: "DEDIE", closingCash: 1000 },
      compteExploitant: { ouverture: 0, apports: 0, prelevements: 0 },
      ran: { situation: "NATIF" },
      tiers: { creances: { status: "DECLARE", montant: 600 }, dettes: { status: "NUL_CONFIRME" } },
      subventionsInvestissement: { status: "NUL_CONFIRME" },
      ventilationTiers: {
        postes: [{ nature: "LOYER_DU_PAR_LOCATAIRE", montant: 600 }],
      },
    };
    const patrimoine = assemblePatrimoine(rfs(), inputs);
    assert.equal(patrimoine.ventilationTiers.cases.clients.status, "DECLARE");
    assert.ok(!patrimoine.ventilationTiers.conflits.some((c) => c.code === "BUCKET_TIERS_ET_VENTILATION"));
  });
});
