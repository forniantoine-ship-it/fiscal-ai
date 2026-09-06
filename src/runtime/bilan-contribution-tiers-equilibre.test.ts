/**
 * MICRO-JALON P1-B.4 — contribution unique tiers à l'équilibre
 * (bucket P0 ↔ ventilation P1-B.3). Une réalité → une contribution.
 * Run: npx tsx --test src/runtime/bilan-contribution-tiers-equilibre.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { checkBilanEquilibre } from "./capabilities/bilan/check-bilan-equilibre";
import {
  resolveContributionTiersEquilibre,
  sommeCreancesVentilees,
  sommeDettesVentilees,
} from "./capabilities/bilan/contribution-tiers-equilibre";
import { resolveVentilationTiers } from "./capabilities/bilan/ventilation-tiers";
import type { PatrimonialState, VentilationTiersResolution } from "./capabilities/bilan/types";

function nulConfirme(): { status: "NUL_CONFIRME"; montant: number; raison: string } {
  return { status: "NUL_CONFIRME", montant: 0, raison: "confirmé nul" };
}

function ventilationVide(): VentilationTiersResolution {
  return resolveVentilationTiers(undefined);
}

function patrimoineBase(overrides: Partial<PatrimonialState> = {}): PatrimonialState {
  return {
    exercice: 2025,
    resultatComptable: 0,
    immobilisations: { actifs: [], brutTotal: 50000, cumuleTotal: 10000, netTotal: 40000, brutFiable: true, netFiable: true, raisons: [] },
    tresorerie: { etat: "TRESORERIE_COMPLETE", clotureRetenue: 2000, ecart: 0, raison: "ok" },
    compteExploitant: { disponible: true, clotureN: 30000, ouvertureManquante: false, raison: "ok" },
    ran: { disponible: true, valeur: 0, raison: "ok" },
    emprunts: { etat: "DISPONIBLE", totalCRD: 12000, source: "F-011" },
    tiers: { creances: nulConfirme(), dettes: nulConfirme() },
    subventionsInvestissement: { status: "NUL_CONFIRME", montant: 0, raison: "ok" },
    lignesSimples: {
      autresImmobilisationsIncorporellesBrut: nulConfirme(),
      autresImmobilisationsIncorporellesNet: nulConfirme(),
      immobilisationsFinancieresBrut: nulConfirme(),
      immobilisationsFinancieresNet: nulConfirme(),
      avancesAcomptesVerses: nulConfirme(),
      valeursMobilieresPlacementBrut: nulConfirme(),
      valeursMobilieresPlacementNet: nulConfirme(),
      chargesConstateesAvance: nulConfirme(),
      produitsConstatesAvance: nulConfirme(),
      autresDettes: nulConfirme(),
    },
    ventilationTiers: ventilationVide(),
    reconciliationEmpruntsTiers: {
      etat: "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET",
      contributionEmpruntEquilibre: 12000,
      raison: "fixture : dettes NUL + emprunt",
      bloquant: false,
    },
    reconciliationDecouvertTiers: {
      etat: "AUCUN_DECOUVERT_CANONIQUE",
      contributionDecouvertEquilibre: 0,
      raison: "fixture",
      bloquant: false,
    },
    ...overrides,
  };
}

describe("resolveContributionTiersEquilibre — doctrine P1-B.4", () => {
  it("A — bucket seul 10000, aucune ventilation → contribution 10000 (P0 conservé)", () => {
    const contrib = resolveContributionTiersEquilibre(
      { creances: { status: "DECLARE", montant: 10000, raison: "ok" }, dettes: { status: "NUL_CONFIRME", montant: 0, raison: "ok" } },
      ventilationVide(),
    );
    assert.equal(contrib.creances.etat, "BUCKET_SEUL");
    assert.equal(contrib.creances.montantRetenu, 10000);
    assert.equal(contrib.creances.source, "BUCKET");
    assert.equal(contrib.utilisablePourEquilibre, true);
  });

  it("B — bucket 10000 / ventilation complète 10000 → contribution 10000, pas 20000", () => {
    const ventilation = resolveVentilationTiers({
      postes: [
        { nature: "LOYER_DU_PAR_LOCATAIRE", montant: 6000 },
        { nature: "AUTRE_CREANCE_ACTIVITE", montant: 4000 },
      ],
    });
    assert.equal(sommeCreancesVentilees(ventilation), 10000);
    const contrib = resolveContributionTiersEquilibre(
      { creances: { status: "DECLARE", montant: 10000, raison: "ok" }, dettes: { status: "NUL_CONFIRME", montant: 0, raison: "ok" } },
      ventilation,
    );
    assert.equal(contrib.creances.etat, "VENTILATION_COMPLETE");
    assert.equal(contrib.creances.montantRetenu, 10000);
    assert.notEqual(contrib.creances.montantRetenu, 20000);
    assert.equal(contrib.utilisablePourEquilibre, true);
  });

  it("C — bucket 10000 / ventilation 3000 → PARTIELLE, jamais 13000, reste 7000 INCONNU", () => {
    const ventilation = resolveVentilationTiers({
      postes: [{ nature: "FOURNISSEUR_NON_PAYE", montant: 3000 }],
    });
    const contrib = resolveContributionTiersEquilibre(
      { creances: { status: "NUL_CONFIRME", montant: 0, raison: "ok" }, dettes: { status: "DECLARE", montant: 10000, raison: "ok" } },
      ventilation,
    );
    assert.equal(contrib.dettes.etat, "VENTILATION_PARTIELLE");
    assert.equal(contrib.dettes.resteNonVentile, 7000);
    assert.equal(contrib.dettes.montantRetenu, undefined);
    assert.equal(contrib.utilisablePourEquilibre, false);
    assert.ok(contrib.raisonsBlocage.some((r) => r.includes("partielle")));
  });

  it("D — ventilation 12000 > bucket 10000 → SUPERIEURE / blocage", () => {
    const ventilation = resolveVentilationTiers({
      postes: [{ nature: "DEPOT_GARANTIE_LOCATAIRE", montant: 12000 }],
    });
    const contrib = resolveContributionTiersEquilibre(
      { creances: { status: "NUL_CONFIRME", montant: 0, raison: "ok" }, dettes: { status: "DECLARE", montant: 10000, raison: "ok" } },
      ventilation,
    );
    assert.equal(contrib.dettes.etat, "VENTILATION_SUPERIEURE");
    assert.equal(contrib.utilisablePourEquilibre, false);
  });

  it("E — bucket INCONNU + ventilation 3000 → NON_ARBITRABLE, pas de faux zéro", () => {
    const ventilation = resolveVentilationTiers({
      postes: [{ nature: "LOYER_DU_PAR_LOCATAIRE", montant: 3000 }],
    });
    const contrib = resolveContributionTiersEquilibre(
      { creances: { status: "INCONNU", raison: "absent" }, dettes: { status: "NUL_CONFIRME", montant: 0, raison: "ok" } },
      ventilation,
    );
    assert.equal(contrib.creances.etat, "NON_ARBITRABLE");
    assert.equal(contrib.creances.montantRetenu, undefined);
    assert.equal(contrib.utilisablePourEquilibre, false);
  });

  it("F — bucket NUL_CONFIRME + ventilation DECLARE → INCOHERENTE / blocage", () => {
    const ventilation = resolveVentilationTiers({
      postes: [{ nature: "FOURNISSEUR_NON_PAYE", montant: 3000 }],
    });
    const contrib = resolveContributionTiersEquilibre(
      { creances: { status: "NUL_CONFIRME", montant: 0, raison: "ok" }, dettes: { status: "NUL_CONFIRME", montant: 0, raison: "ok" } },
      ventilation,
    );
    assert.equal(contrib.dettes.etat, "INCOHERENTE");
    assert.equal(contrib.utilisablePourEquilibre, false);
  });

  it("I — nature inconnue → jamais classée en 072/175, équilibre non utilisable", () => {
    const ventilation = resolveVentilationTiers({
      postes: [{ nature: "NATURE_INCONNUE", montant: 500 }],
    });
    assert.equal(ventilation.cases.autresCreances.status, "INCONNU");
    assert.equal(ventilation.cases.autresDettes.status, "INCONNU");
    const contrib = resolveContributionTiersEquilibre(
      { creances: { status: "DECLARE", montant: 500, raison: "ok" }, dettes: { status: "NUL_CONFIRME", montant: 0, raison: "ok" } },
      ventilation,
    );
    assert.equal(contrib.utilisablePourEquilibre, false);
  });
});

describe("checkBilanEquilibre — intégration P1-B.4", () => {
  it("A — bucket seul : comportement P0 conservé (EQUILIBRE nominal)", () => {
    // Actif 40000+2000=42000 ; Passif 30000+12000=42000
    const result = checkBilanEquilibre({ patrimoine: patrimoineBase() });
    assert.equal(result.status, "EQUILIBRE");
    assert.equal(result.totalActifNet, 42000);
  });

  it("B — ventilation complète cohérente : contribution unique, pas double", () => {
    const ventilation = resolveVentilationTiers({
      postes: [{ nature: "LOYER_DU_PAR_LOCATAIRE", montant: 1500 }],
    });
    // Actif = 40000 + 2000 + 1500 = 43500
    // Passif = 30000 + 12000 + 1500 dettes? wait dettes nul — need balance
    // Adjust: creances 1500, reduce compte exploitant by 1500 → 28500 ; passif = 28500+12000=40500 ; actif 43500 — no
    // Better: creances 1500, dettes 0, clotureN = 31500 → passif 31500+12000=43500
    const patrimoine = patrimoineBase({
      tiers: { creances: { status: "DECLARE", montant: 1500, raison: "ok" }, dettes: nulConfirme() },
      ventilationTiers: ventilation,
      compteExploitant: { disponible: true, clotureN: 31500, ouvertureManquante: false, raison: "ok" },
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "EQUILIBRE");
    assert.equal(result.totalActifNet, 43500);
    assert.equal(result.totalPassif, 43500);
  });

  it("C — ventilation partielle : bloqué, jamais 13000 en contribution", () => {
    const ventilation = resolveVentilationTiers({
      postes: [{ nature: "FOURNISSEUR_NON_PAYE", montant: 3000 }],
    });
    const patrimoine = patrimoineBase({
      tiers: { creances: nulConfirme(), dettes: { status: "DECLARE", montant: 10000, raison: "ok" } },
      ventilationTiers: ventilation,
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DONNEE_MANQUANTE");
    assert.ok(result.reasons.some((r) => r.includes("partielle") || r.includes("10000")));
  });

  it("D — ventilation > bucket : DIVERGENCE_SOURCE", () => {
    const ventilation = resolveVentilationTiers({
      postes: [{ nature: "DEPOT_GARANTIE_LOCATAIRE", montant: 12000 }],
    });
    const patrimoine = patrimoineBase({
      tiers: { creances: nulConfirme(), dettes: { status: "DECLARE", montant: 10000, raison: "ok" } },
      ventilationTiers: ventilation,
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DIVERGENCE_SOURCE");
  });

  it("G — emprunt F-011 + dettes ventilées complètes + réconciliation SEPARE : pas de double comptage", () => {
    const ventilation = resolveVentilationTiers({
      postes: [{ nature: "FOURNISSEUR_NON_PAYE", montant: 2000 }],
    });
    const patrimoine = patrimoineBase({
      tiers: { creances: nulConfirme(), dettes: { status: "DECLARE", montant: 2000, raison: "ok" } },
      ventilationTiers: ventilation,
      compteExploitant: { disponible: true, clotureN: 28000, ouvertureManquante: false, raison: "ok" },
      emprunts: { etat: "DISPONIBLE", totalCRD: 12000, source: "F-011" },
      reconciliationEmpruntsTiers: {
        etat: "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET",
        contributionEmpruntEquilibre: 12000,
        raison: "explicite séparé",
        bloquant: false,
      },
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "EQUILIBRE");
    assert.equal(result.totalPassif, 42000); // 28000 + 12000 + 2000
  });

  it("H — découvert + bucket dettes DECLARE sans réconciliation : blocage", () => {
    const patrimoine = patrimoineBase({
      tresorerie: {
        etat: "TRESORERIE_DECLAREE",
        clotureRetenue: 0,
        decouvertBancaire: 500,
        decouvertDettePassif: 500,
        raison: "découvert reconnu",
      },
      tiers: { creances: nulConfirme(), dettes: { status: "DECLARE", montant: 500, raison: "ok" } },
      emprunts: { etat: "DISPONIBLE", totalCRD: 0, source: "F-011" },
      reconciliationEmpruntsTiers: {
        etat: "AUCUN_EMPRUNT_CANONIQUE",
        contributionEmpruntEquilibre: 0,
        raison: "pas d'emprunt",
        bloquant: false,
      },
      reconciliationDecouvertTiers: {
        etat: "DECOUVERT_PRESENCE_BUCKET_NON_RECONCILIEE",
        contributionDecouvertEquilibre: undefined,
        raison: "DECOUVERT_PRESENCE_BUCKET_NON_RECONCILIEE : découvert non réconcilié",
        bloquant: true,
      },
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DIVERGENCE_SOURCE");
    assert.ok(result.reasons.some((r) => r.includes("DECOUVERT_PRESENCE_BUCKET_NON_RECONCILIEE")));
  });

  it("8 — EMPRUNT dans ventilation → conflit / non utilisable", () => {
    const ventilation = resolveVentilationTiers({
      postes: [{ nature: "EMPRUNT" as never, montant: 20000 }],
    });
    const contrib = resolveContributionTiersEquilibre(
      { creances: nulConfirme(), dettes: { status: "DECLARE", montant: 10000, raison: "ok" } },
      ventilation,
    );
    assert.equal(contrib.utilisablePourEquilibre, false);
    assert.ok(ventilation.conflits.some((c) => c.code === "NATURE_INTERDITE"));
  });

  it("somme dettes ventilées ignore 173 NON_APPLICABLE", () => {
    const v = resolveVentilationTiers({
      postes: [{ nature: "FOURNISSEUR_NON_PAYE", montant: 100 }],
    });
    assert.equal(v.cases.comptesCourantsAssocies.status, "NON_APPLICABLE");
    assert.equal(sommeDettesVentilees(v), 100);
  });
});
