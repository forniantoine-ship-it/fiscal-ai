/**
 * MICRO-JALON socle patrimonial P0 — checkBilanEquilibre().
 * Run: npx tsx --test src/runtime/bilan-check-equilibre.test.ts
 * Scénarios R15, R16 (contrat P0 §21) + cas nominal équilibré.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { checkBilanEquilibre } from "./capabilities/bilan/check-bilan-equilibre";
import type { PatrimonialState } from "./capabilities/bilan/types";

function nulConfirme(): { status: "NUL_CONFIRME"; montant: number; raison: string } {
  return { status: "NUL_CONFIRME", montant: 0, raison: "confirmé nul" };
}

function patrimoineBase(overrides: Partial<PatrimonialState> = {}): PatrimonialState {
  return {
    exercice: 2025,
    resultatComptable: 1000,
    immobilisations: { actifs: [], brutTotal: 50000, cumuleTotal: 10000, netTotal: 40000, brutFiable: true, netFiable: true, raisons: [] },
    tresorerie: { etat: "TRESORERIE_COMPLETE", clotureRetenue: 2000, ecart: 0, raison: "ok" },
    compteExploitant: { disponible: true, clotureN: 30000, ouvertureManquante: false, raison: "ok" },
    ran: { disponible: true, valeur: 0, raison: "ok" },
    emprunts: { etat: "DISPONIBLE", totalCRD: 12000, source: "F-011" },
    tiers: { creances: nulConfirme(), dettes: nulConfirme() },
    // Correction P1-A / R-01 : subventions lues par checkBilanEquilibre via
    // montantCapitauxPropresPatrimoniaux (même source que la case 142).
    subventionsInvestissement: { status: "NUL_CONFIRME", montant: 0, raison: "confirmé nul" },
    // P1-B.2 : champs obligatoires — checkBilanEquilibre ne les lit pas encore
    // (limite connue) ; fixture de complétude uniquement.
    lignesSimples: {
      autresImmobilisationsIncorporellesBrut: nulConfirme(),
      autresImmobilisationsIncorporellesNet: nulConfirme(),
      immobilisationsFinancieresBrut: nulConfirme(),
      immobilisationsFinancieresNet: nulConfirme(),
      avancesAcomptesVerses: nulConfirme(),
      avancesAcomptesVersesAmort: nulConfirme(),
      clientsAmortissementsProvisions: nulConfirme(),
      autresCreancesAmortissementsProvisions: nulConfirme(),
      valeursMobilieresPlacementBrut: nulConfirme(),
      valeursMobilieresPlacementNet: nulConfirme(),
      chargesConstateesAvance: nulConfirme(),
      chargesConstateesAvanceAmort: nulConfirme(),
      produitsConstatesAvance: nulConfirme(),
      autresDettes: nulConfirme(),
    },
    // P1-B.3 : fixture de complétude — checkBilanEquilibre ne lit pas encore
    // la ventilation (limite connue, comme lignesSimples).
    ventilationTiers: {
      cases: {
        avancesAcomptesVerses: nulConfirme(),
        clients: nulConfirme(),
        autresCreances: nulConfirme(),
        chargesConstateesAvance: nulConfirme(),
        avancesAcomptesRecus: nulConfirme(),
        fournisseurs: nulConfirme(),
        dettesFiscalesSociales: nulConfirme(),
        comptesCourantsAssocies: { status: "NON_APPLICABLE", montant: 0, raison: "EI" },
        produitsConstatesAvance: nulConfirme(),
        autresDettes: nulConfirme(),
      },
      montantsNonVentiles: [],
      conflits: [],
      projectionFiable: true,
    },
    // P1-B.4 strict : emprunt présent + dettes NUL → séparé (bucket vide).
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
    disponibilitesAmortissementsProvisions: nulConfirme(),
    ...overrides,
  };
}

describe("checkBilanEquilibre — cas nominal", () => {
  it("EQUILIBRE quand actif net = passif, toutes données fiables", () => {
    // Actif net = 40000 (immo) + 2000 (trésorerie) = 42000
    // Passif = 142(30000+0+1000=31000) + 176(12000) = 43000 → PAS égal, ajustons
    const patrimoine = patrimoineBase({ resultatComptable: 0, compteExploitant: { disponible: true, clotureN: 30000, ouvertureManquante: false, raison: "ok" } });
    // Actif net = 40000 + 2000 = 42000 ; Passif = 30000+0+0 + 12000 = 42000
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "EQUILIBRE");
    assert.equal(result.totalActifNet, 42000);
    assert.equal(result.totalPassif, 42000);
    assert.equal(result.ecart, 0);
  });

  it("R15 — 112 ≠ 180 (déséquilibre réel, toutes données fiables) → génération bloquée, jamais corrigée par un ajustement", () => {
    const patrimoine = patrimoineBase({ resultatComptable: 5000 }); // introduit un écart volontaire
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DESEQUILIBRE_REEL");
    assert.ok(result.ecart !== 0 && result.ecart !== undefined);
    assert.ok(result.reasons[0].includes("écart"));
  });

  it("R16 — donnée manquante (trésorerie inconnue) → génération bloquée, statut DONNEE_MANQUANTE", () => {
    const patrimoine = patrimoineBase({ tresorerie: { etat: "TRESORERIE_INCONNUE", raison: "aucune information" } });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DONNEE_MANQUANTE");
    assert.equal(result.totalActifNet, undefined, "aucun total ne doit être calculé si une donnée manque");
  });

  it("R16 — donnée manquante (compte exploitant indisponible) → DONNEE_MANQUANTE", () => {
    const patrimoine = patrimoineBase({ compteExploitant: { disponible: false, ouvertureManquante: false, raison: "apports manquants" } });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DONNEE_MANQUANTE");
  });

  it("R16 — donnée manquante (RAN indisponible) → DONNEE_MANQUANTE", () => {
    const patrimoine = patrimoineBase({ ran: { disponible: false, raison: "RAN historique non fourni" } });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DONNEE_MANQUANTE");
  });

  it("R16 — donnée manquante (emprunts inconnus) → DONNEE_MANQUANTE", () => {
    const patrimoine = patrimoineBase({ emprunts: { etat: "INCONNU", raison: "aucune source" } });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DONNEE_MANQUANTE");
  });

  it("R16 — donnée manquante (immobilisations non fiables côté brut) → DONNEE_MANQUANTE", () => {
    const patrimoine = patrimoineBase({ immobilisations: { actifs: [], brutTotal: undefined, cumuleTotal: undefined, netTotal: undefined, brutFiable: false, netFiable: false, raisons: ["valeurTerrain absent"] } });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DONNEE_MANQUANTE");
  });

  it("STOCK_OUVERTURE_ABSENT quand le solde d'ouverture du compte exploitant manque (N+1 sans clôture N reprise)", () => {
    const patrimoine = patrimoineBase({ compteExploitant: { disponible: false, ouvertureManquante: true, raison: "ouverture manquante" } });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "STOCK_OUVERTURE_ABSENT");
  });

  it("DIVERGENCE_SOURCE quand la trésorerie diverge (reconstruction ≠ déclaré)", () => {
    const patrimoine = patrimoineBase({ tresorerie: { etat: "TRESORERIE_DIVERGENTE", ecart: 150, raison: "écart non expliqué" } });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DIVERGENCE_SOURCE");
  });

  it("DIVERGENCE_SOURCE quand les immobilisations ne sont fiables qu'au brut (composant nouveau F-012 sans cumulé)", () => {
    const patrimoine = patrimoineBase({ immobilisations: { actifs: [], brutTotal: 60000, cumuleTotal: undefined, netTotal: undefined, brutFiable: true, netFiable: false, raisons: ["composant nouveau F-012"] } });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DIVERGENCE_SOURCE");
  });

  it("DONNEE_MANQUANTE quand les emprunts sont inconnus (aucune des deux sources)", () => {
    const patrimoine = patrimoineBase({ emprunts: { etat: "INCONNU", raison: "aucune source" } });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DONNEE_MANQUANTE");
  });

  it("DIVERGENCE_SOURCE quand F-011 et BilanInputs.financements.clotureCRD divergent sur le CRD", () => {
    const patrimoine = patrimoineBase({ emprunts: { etat: "DIVERGENT", raison: "F-011 (20000) ≠ déclaré (25000)" } });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DIVERGENCE_SOURCE");
  });

  it("120 débiteur (négatif) : jamais forcé à 0, jamais transformé en résultat, jamais utilisé comme plug — le signe est conservé dans le total 142", () => {
    const patrimoine = patrimoineBase({
      compteExploitant: { disponible: true, clotureN: -5000, ouvertureManquante: false, raison: "ok" },
      resultatComptable: 47000,
      // Passif = 142(-5000+0+47000=42000) + 176(12000) = 54000 ; actif net = 40000+2000=42000 → pas égal volontairement.
    });
    const result = checkBilanEquilibre({ patrimoine });
    // Le point testé n'est pas l'équilibre lui-même mais que -5000 traverse tel quel.
    assert.equal(result.status, "DESEQUILIBRE_REEL");
    // 42000 (total142 attendu) apparaît dans le total passif publié.
    assert.equal(result.totalPassif, 42000 + 12000);
  });
});

describe("checkBilanEquilibre — correction P0-1 (tiers), NO SILENT ZERO", () => {
  it("T1 — tiers entièrement absent (undefined), emprunts par ailleurs présents : jamais EQUILIBRE", () => {
    const patrimoine = patrimoineBase({ tiers: { creances: { status: "INCONNU", raison: "absent" }, dettes: { status: "INCONNU", raison: "absent" } } });
    const result = checkBilanEquilibre({ patrimoine });
    assert.notEqual(result.status, "EQUILIBRE");
    assert.equal(result.status, "DONNEE_MANQUANTE");
  });

  it("T2 — tiers renseigné mais sans statut explicite sur un poste ({} équivalent) : bloqué", () => {
    const patrimoine = patrimoineBase({ tiers: { creances: { status: "INCONNU", raison: "aucune saisie" }, dettes: { status: "INCONNU", raison: "aucune saisie" } } });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DONNEE_MANQUANTE");
  });

  it("T3 — créances ET dettes explicitement INCONNU : bloqué", () => {
    const patrimoine = patrimoineBase({
      tiers: { creances: { status: "INCONNU", raison: "inconnu" }, dettes: { status: "INCONNU", raison: "inconnu" } },
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DONNEE_MANQUANTE");
  });

  it("T4 — créances et dettes NUL_CONFIRME = 0 explicitement : accepté, peut atteindre EQUILIBRE", () => {
    const patrimoine = patrimoineBase({ resultatComptable: 0, tiers: { creances: nulConfirme(), dettes: nulConfirme() } });
    // Actif net = 40000 + 2000 + 0 = 42000 ; Passif = 30000+0+0 + 12000+0 = 42000
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "EQUILIBRE");
  });

  it("T5 — créances=1500, dettes=800 déclarées + réconciliation SEPARE emprunt : valeurs intégrées, jamais ignorées", () => {
    const patrimoine = patrimoineBase({
      resultatComptable: 0,
      tiers: { creances: { status: "DECLARE", montant: 1500, raison: "déclaré" }, dettes: { status: "DECLARE", montant: 800, raison: "déclaré" } },
      reconciliationEmpruntsTiers: {
        etat: "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET",
        contributionEmpruntEquilibre: 12000,
        raison: "séparé explicite",
        bloquant: false,
      },
    });
    const result = checkBilanEquilibre({ patrimoine });
    // Actif net = 40000+2000+1500 = 43500 ; Passif = 30000+12000+800 = 42800 → écart réel de 700
    assert.equal(result.status, "DESEQUILIBRE_REEL");
    assert.equal(result.totalActifNet, 43500);
    assert.equal(result.totalPassif, 42800);
  });

  it("T6 — créance connue mais dette inconnue : bloqué (une seule inconnue suffit)", () => {
    const patrimoine = patrimoineBase({
      tiers: { creances: { status: "DECLARE", montant: 1500, raison: "déclaré" }, dettes: { status: "INCONNU", raison: "inconnu" } },
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DONNEE_MANQUANTE");
  });
});

describe("checkBilanEquilibre — correction P0-2 (découvert bancaire)", () => {
  it("D1 — découvert bancaire sans dette de passif reconnue : DONNEE_MANQUANTE, jamais EQUILIBRE", () => {
    const patrimoine = patrimoineBase({
      resultatComptable: 0,
      tresorerie: { etat: "TRESORERIE_NULLE_DECLAREE", clotureRetenue: 0, decouvertBancaire: 350, raison: "découvert orphelin" },
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DONNEE_MANQUANTE");
  });

  it("D2 — découvert bancaire avec dette reconnue au passif : intégré au total 176/180, bilan à nouveau évaluable", () => {
    // Actif net = 40000 (immo) + 0 (084=0) = 40000 ; Passif = 30000(142) + 12000(156) + 350(découvert) = 42350 → écart réel.
    const patrimoine = patrimoineBase({
      resultatComptable: 0,
      tresorerie: { etat: "TRESORERIE_NULLE_DECLAREE", clotureRetenue: 0, decouvertBancaire: 350, decouvertDettePassif: 350, raison: "découvert reconnu" },
      // dettes NUL (fixture) ⇒ découvert implicitement séparé du bucket.
      reconciliationDecouvertTiers: {
        etat: "DECOUVERT_SEPARE_ET_EXCLU_DU_BUCKET",
        contributionDecouvertEquilibre: 350,
        raison: "dettes NUL + découvert",
        bloquant: false,
      },
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.notEqual(result.status, "DONNEE_MANQUANTE", "le découvert a désormais une contrepartie reconnue, il ne doit plus bloquer la génération pour cette raison");
    assert.equal(result.totalPassif, 30000 + 12000 + 350);
  });
});

describe("Correction R-01 — check et 142 partagent les capitaux propres (dont 137)", () => {
  it("R01-1 — 137 NUL_CONFIRME : comportement historique EQUILIBRE conservé", () => {
    const patrimoine = patrimoineBase({
      resultatComptable: 0,
      compteExploitant: { disponible: true, clotureN: 30000, ouvertureManquante: false, raison: "ok" },
      subventionsInvestissement: { status: "NUL_CONFIRME", montant: 0, raison: "nul" },
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "EQUILIBRE");
    assert.equal(result.totalPassif, 42000);
  });

  it("R01-2 — 137 DECLARE 2500 avec actif +2500 : EQUILIBRE, passif intègre 2500", () => {
    // Actif 40000+4500=44500 ; Passif = (30000+0+0+2500)+12000 = 44500
    const patrimoine = patrimoineBase({
      resultatComptable: 0,
      compteExploitant: { disponible: true, clotureN: 30000, ouvertureManquante: false, raison: "ok" },
      tresorerie: { etat: "TRESORERIE_COMPLETE", clotureRetenue: 4500, ecart: 0, raison: "ok" },
      subventionsInvestissement: { status: "DECLARE", montant: 2500, raison: "subvention" },
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "EQUILIBRE");
    assert.equal(result.totalPassif, 44500);
    assert.equal(result.totalActifNet, 44500);
  });

  it("R01-3 — 137 DECLARE 2500 sans actif correspondant : DESEQUILIBRE_REEL (jamais EQUILIBRE artificiel)", () => {
    const patrimoine = patrimoineBase({
      resultatComptable: 0,
      compteExploitant: { disponible: true, clotureN: 30000, ouvertureManquante: false, raison: "ok" },
      subventionsInvestissement: { status: "DECLARE", montant: 2500, raison: "subvention" },
    });
    // Actif 42000 ; Passif 30000+2500+12000 = 44500
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DESEQUILIBRE_REEL");
    assert.equal(result.totalPassif, 44500);
    assert.notEqual(result.status, "EQUILIBRE");
  });

  it("R01-4 — 137 INCONNU : DONNEE_MANQUANTE, jamais faux zéro ni EQUILIBRE", () => {
    const patrimoine = patrimoineBase({
      resultatComptable: 0,
      subventionsInvestissement: { status: "INCONNU", raison: "subventions inconnues" },
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "DONNEE_MANQUANTE");
    assert.ok(result.reasons.some((r) => r.includes("subventions") || r.includes("INCONNU") || r.includes("aucune")));
    assert.equal(result.totalPassif, undefined);
  });

  it("R01-5 — 137 DECLARE 0 : montant nul déclaré distinct de INCONNU, EQUILIBRE possible", () => {
    const patrimoine = patrimoineBase({
      resultatComptable: 0,
      compteExploitant: { disponible: true, clotureN: 30000, ouvertureManquante: false, raison: "ok" },
      subventionsInvestissement: { status: "DECLARE", montant: 0, raison: "déclaré nul" },
    });
    const result = checkBilanEquilibre({ patrimoine });
    assert.equal(result.status, "EQUILIBRE");
    assert.equal(result.totalPassif, 42000);
  });
});
