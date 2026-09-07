/**
 * B-FAMILY-2 — état UI pur de collecte ventilation tiers famille B.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/ventilation-tiers-intake.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_VENTILATION_TIERS_INTAKE_STATE,
  NATURES_A_PAYER,
  NATURES_A_RECEVOIR,
  ajouterPoste,
  listeEstValide,
  modifierPoste,
  posteMontantValide,
  retirerPoste,
  type PosteIntakeRow,
} from "./ventilation-tiers-intake";

describe("A — liste à recevoir vide sans confirmation", () => {
  it("état initial : aucun poste, aucune confirmation — ne doit jamais être interprété comme un zéro", () => {
    assert.deepEqual(EMPTY_VENTILATION_TIERS_INTAKE_STATE.postesRecevoir, []);
    assert.equal(EMPTY_VENTILATION_TIERS_INTAKE_STATE.confirmationRecevoirVide, false);
  });
});

describe("B — liste à recevoir confirmée vide", () => {
  it("la confirmation est un booléen indépendant, jamais dérivé de la liste", () => {
    const state = { ...EMPTY_VENTILATION_TIERS_INTAKE_STATE, confirmationRecevoirVide: true };
    assert.equal(state.postesRecevoir.length, 0);
    assert.equal(state.confirmationRecevoirVide, true);
  });
});

describe("C/D — ajout d'un poste 068 et 072", () => {
  it("ajoute un poste LOYER_DU_PAR_LOCATAIRE (068), montant vide par défaut (jamais 0)", () => {
    const postes = ajouterPoste([], "LOYER_DU_PAR_LOCATAIRE", "id-1");
    assert.equal(postes.length, 1);
    assert.equal(postes[0].nature, "LOYER_DU_PAR_LOCATAIRE");
    assert.equal(postes[0].montantRaw, "");
    assert.equal(postes[0].libelle, "");
  });

  it("ajoute un poste AUTRE_CREANCE_ACTIVITE (072)", () => {
    const postes = ajouterPoste([], "AUTRE_CREANCE_ACTIVITE", "id-2");
    assert.equal(postes[0].nature, "AUTRE_CREANCE_ACTIVITE");
  });
});

describe("E — plusieurs postes de la même catégorie", () => {
  it("deux postes LOYER_DU_PAR_LOCATAIRE distincts coexistent sans fusion", () => {
    let postes = ajouterPoste([], "LOYER_DU_PAR_LOCATAIRE", "id-1");
    postes = ajouterPoste(postes, "LOYER_DU_PAR_LOCATAIRE", "id-2");
    assert.equal(postes.length, 2);
    assert.notEqual(postes[0].id, postes[1].id);
    assert.equal(postes[0].nature, "LOYER_DU_PAR_LOCATAIRE");
    assert.equal(postes[1].nature, "LOYER_DU_PAR_LOCATAIRE");
  });
});

describe("F — liste à payer confirmée vide", () => {
  it("indépendante de la confirmation à recevoir", () => {
    const state = { ...EMPTY_VENTILATION_TIERS_INTAKE_STATE, confirmationPayerVide: true };
    assert.equal(state.confirmationRecevoirVide, false);
    assert.equal(state.confirmationPayerVide, true);
  });
});

describe("G/H/I — ajout 164/166/172", () => {
  it("164 ACOMPTE_RECU_SUR_COMMANDE", () => {
    const postes = ajouterPoste([], "ACOMPTE_RECU_SUR_COMMANDE", "id-1");
    assert.equal(postes[0].nature, "ACOMPTE_RECU_SUR_COMMANDE");
  });
  it("166 FOURNISSEUR_NON_PAYE", () => {
    const postes = ajouterPoste([], "FOURNISSEUR_NON_PAYE", "id-1");
    assert.equal(postes[0].nature, "FOURNISSEUR_NON_PAYE");
  });
  it("172 DETTE_FISCALE_OU_SOCIALE", () => {
    const postes = ajouterPoste([], "DETTE_FISCALE_OU_SOCIALE", "id-1");
    assert.equal(postes[0].nature, "DETTE_FISCALE_OU_SOCIALE");
  });
});

describe("J — plusieurs catégories simultanément", () => {
  it("la liste à payer peut contenir 164, 166 et 172 en même temps, sans interférence", () => {
    let postes = ajouterPoste([], "ACOMPTE_RECU_SUR_COMMANDE", "id-1");
    postes = ajouterPoste(postes, "FOURNISSEUR_NON_PAYE", "id-2");
    postes = ajouterPoste(postes, "DETTE_FISCALE_OU_SOCIALE", "id-3");
    assert.deepEqual(
      postes.map((p) => p.nature),
      ["ACOMPTE_RECU_SUR_COMMANDE", "FOURNISSEUR_NON_PAYE", "DETTE_FISCALE_OU_SOCIALE"],
    );
  });
});

describe("K — modification/suppression d'un poste", () => {
  it("modifierPoste met à jour montant/libellé/nature d'une seule ligne, jamais les autres", () => {
    let postes = ajouterPoste([], "LOYER_DU_PAR_LOCATAIRE", "id-1");
    postes = ajouterPoste(postes, "AUTRE_CREANCE_ACTIVITE", "id-2");
    postes = modifierPoste(postes, "id-1", { montantRaw: "450", libelle: "Loyer décembre" });
    assert.equal(postes[0].montantRaw, "450");
    assert.equal(postes[0].libelle, "Loyer décembre");
    assert.equal(postes[1].montantRaw, "", "le second poste ne doit pas être affecté");
  });

  it("retirerPoste supprime uniquement la ligne visée", () => {
    let postes = ajouterPoste([], "LOYER_DU_PAR_LOCATAIRE", "id-1");
    postes = ajouterPoste(postes, "AUTRE_CREANCE_ACTIVITE", "id-2");
    postes = retirerPoste(postes, "id-1");
    assert.equal(postes.length, 1);
    assert.equal(postes[0].id, "id-2");
  });
});

describe("L — montant obligatoire et valide", () => {
  it("montant vide → invalide", () => {
    const poste: PosteIntakeRow = { id: "id-1", nature: "LOYER_DU_PAR_LOCATAIRE", montantRaw: "", libelle: "" };
    assert.equal(posteMontantValide(poste), false);
  });

  it("montant non numérique → invalide", () => {
    const poste: PosteIntakeRow = { id: "id-1", nature: "LOYER_DU_PAR_LOCATAIRE", montantRaw: "abc", libelle: "" };
    assert.equal(posteMontantValide(poste), false);
  });

  it("montant '0' explicite → valide (déclaration explicite de zéro, distincte d'un champ vide)", () => {
    const poste: PosteIntakeRow = { id: "id-1", nature: "LOYER_DU_PAR_LOCATAIRE", montantRaw: "0", libelle: "" };
    assert.equal(posteMontantValide(poste), true);
  });

  it("montant numérique → valide", () => {
    const poste: PosteIntakeRow = { id: "id-1", nature: "LOYER_DU_PAR_LOCATAIRE", montantRaw: "1234.56", libelle: "" };
    assert.equal(posteMontantValide(poste), true);
  });

  it("listeEstValide : une seule ligne invalide invalide toute la liste", () => {
    const postes: PosteIntakeRow[] = [
      { id: "id-1", nature: "LOYER_DU_PAR_LOCATAIRE", montantRaw: "100", libelle: "" },
      { id: "id-2", nature: "AUTRE_CREANCE_ACTIVITE", montantRaw: "", libelle: "" },
    ];
    assert.equal(listeEstValide(postes), false);
  });

  it("listeEstValide : liste vide est valide par vacuité", () => {
    assert.equal(listeEstValide([]), true);
  });
});

describe("M — aucune nature interdite accessible dans les menus", () => {
  const NATURES_INTERDITES = new Set([
    "NATURE_INCONNUE",
    "EMPRUNT",
    "DECOUVERT_BANCAIRE",
    "DECOUVERT",
    // Famille C, déjà couverte par P1-B1 — ne doit jamais réapparaître ici.
    "ACOMPTE_VERSE_A_FOURNISSEUR",
    "CHARGE_CONSTATEE_AVANCE",
    "LOYER_ENCAISSE_D_AVANCE",
    "DEPOT_GARANTIE_LOCATAIRE",
  ]);

  it("NATURES_A_RECEVOIR ne contient exactement que LOYER_DU_PAR_LOCATAIRE et AUTRE_CREANCE_ACTIVITE", () => {
    assert.deepEqual(
      NATURES_A_RECEVOIR.map((o) => o.nature),
      ["LOYER_DU_PAR_LOCATAIRE", "AUTRE_CREANCE_ACTIVITE"],
    );
    for (const option of NATURES_A_RECEVOIR) {
      assert.ok(!NATURES_INTERDITES.has(option.nature), `${option.nature} ne doit jamais être proposée`);
    }
  });

  it("NATURES_A_PAYER ne contient exactement que ACOMPTE_RECU_SUR_COMMANDE, FOURNISSEUR_NON_PAYE, DETTE_FISCALE_OU_SOCIALE", () => {
    assert.deepEqual(
      NATURES_A_PAYER.map((o) => o.nature),
      ["ACOMPTE_RECU_SUR_COMMANDE", "FOURNISSEUR_NON_PAYE", "DETTE_FISCALE_OU_SOCIALE"],
    );
    for (const option of NATURES_A_PAYER) {
      assert.ok(!NATURES_INTERDITES.has(option.nature), `${option.nature} ne doit jamais être proposée`);
    }
  });

  it("les deux listes sont disjointes (aucune nature partagée entre à recevoir et à payer)", () => {
    const recevoir = new Set(NATURES_A_RECEVOIR.map((o) => o.nature));
    for (const option of NATURES_A_PAYER) {
      assert.ok(!recevoir.has(option.nature), `${option.nature} ne doit pas apparaître dans les deux listes`);
    }
  });
});
