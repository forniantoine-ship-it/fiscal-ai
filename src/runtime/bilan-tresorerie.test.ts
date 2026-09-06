/**
 * MICRO-JALON socle patrimonial P0 — modèle de trésorerie DEDIE/MIXTE/INCONNU.
 * Run: npx tsx --test src/runtime/bilan-tresorerie.test.ts
 * Scénarios R7 à R12 (contrat P0 §21).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveTresorerie } from "./capabilities/bilan/tresorerie";

describe("resolveTresorerie — mode DEDIE", () => {
  it("R7 — compte dédié, relevés cohérents (ouverture+flux = clôture) → TRESORERIE_COMPLETE", () => {
    const res = resolveTresorerie({ bankMode: "DEDIE", openingCash: 1000, closingCash: 1800, encaissementsConnus: 5000, decaissementsConnus: 4200 });
    assert.equal(res.etat, "TRESORERIE_COMPLETE");
    assert.equal(res.clotureRetenue, 1800);
    assert.equal(res.ecart, 0);
  });

  it("R8 — compte dédié, divergence non expliquée entre reconstruction et solde déclaré → TRESORERIE_DIVERGENTE, aucune valeur retenue", () => {
    const res = resolveTresorerie({ bankMode: "DEDIE", openingCash: 1000, closingCash: 2500, encaissementsConnus: 5000, decaissementsConnus: 4200 });
    assert.equal(res.etat, "TRESORERIE_DIVERGENTE");
    assert.equal(res.clotureRetenue, undefined, "aucune valeur ne doit être retenue en cas de divergence non résolue");
    assert.equal(res.ecart, round2Diff(1800, 2500), "écart = reconstitué − déclaré");
  });

  it("compte dédié, solde de clôture seul (sans flux) → TRESORERIE_DECLAREE, retenu tel quel", () => {
    const res = resolveTresorerie({ bankMode: "DEDIE", closingCash: 3200 });
    assert.equal(res.etat, "TRESORERIE_DECLAREE");
    assert.equal(res.clotureRetenue, 3200);
  });

  it("compte dédié sans aucun solde de clôture → TRESORERIE_INCONNUE", () => {
    const res = resolveTresorerie({ bankMode: "DEDIE" });
    assert.equal(res.etat, "TRESORERIE_INCONNUE");
    assert.equal(res.clotureRetenue, undefined);
  });
});

describe("resolveTresorerie — mode MIXTE", () => {
  it("R9 — compte mixte, trésorerie professionnelle déclarée positive → TRESORERIE_DECLAREE", () => {
    const res = resolveTresorerie({ bankMode: "MIXTE", declaredProfessionalCash: 450 });
    assert.equal(res.etat, "TRESORERIE_DECLAREE");
    assert.equal(res.clotureRetenue, 450);
  });

  it("R10 — compte mixte, absence de trésorerie professionnelle CONFIRMÉE (réponse explicite 0) → TRESORERIE_NULLE_DECLAREE, 084=086=0", () => {
    const res = resolveTresorerie({ bankMode: "MIXTE", declaredProfessionalCash: 0 });
    assert.equal(res.etat, "TRESORERIE_NULLE_DECLAREE");
    assert.equal(res.clotureRetenue, 0);
  });

  it("« pas de compte dédié » ne signifie jamais « 084 = 0 » : sans réponse explicite → TRESORERIE_INCONNUE, jamais 0 par défaut", () => {
    const res = resolveTresorerie({ bankMode: "MIXTE" });
    assert.equal(res.etat, "TRESORERIE_INCONNUE");
    assert.equal(res.clotureRetenue, undefined);
  });
});

describe("resolveTresorerie — mode INCONNU", () => {
  it("R11 — aucune information suffisante → TRESORERIE_INCONNUE, bloque la génération", () => {
    const res = resolveTresorerie({ bankMode: "INCONNU" });
    assert.equal(res.etat, "TRESORERIE_INCONNUE");
    assert.equal(res.clotureRetenue, undefined);
  });
});

describe("resolveTresorerie — découvert bancaire", () => {
  it("R12 — solde de clôture dédié négatif (découvert) → jamais placé en 084 négatif, isolé en decouvertBancaire, 084=0", () => {
    const res = resolveTresorerie({ bankMode: "DEDIE", closingCash: -350 });
    assert.equal(res.clotureRetenue, 0, "084 ne doit jamais recevoir une valeur négative");
    assert.equal(res.decouvertBancaire, 350);
    assert.notEqual(res.etat, "TRESORERIE_COMPLETE");
  });

  it("découvert déclaré en mode mixte (trésorerie professionnelle négative) → même traitement", () => {
    const res = resolveTresorerie({ bankMode: "MIXTE", declaredProfessionalCash: -120 });
    assert.equal(res.clotureRetenue, 0);
    assert.equal(res.decouvertBancaire, 120);
  });

  it("D1 — découvert sans dette reconnue : decouvertDettePassif reste undefined (destination passif inconnue)", () => {
    const res = resolveTresorerie({ bankMode: "DEDIE", closingCash: -350 });
    assert.equal(res.clotureRetenue, 0);
    assert.equal(res.decouvertBancaire, 350);
    assert.equal(res.decouvertDettePassif, undefined, "aucune dette reconnue explicitement, jamais portée au passif par défaut");
  });

  it("D2 — découvert avec dette reconnue correspondante : decouvertDettePassif = découvert", () => {
    const res = resolveTresorerie({ bankMode: "DEDIE", closingCash: -350, decouvertDetteReconnue: 350 });
    assert.equal(res.clotureRetenue, 0);
    assert.equal(res.decouvertBancaire, 350);
    assert.equal(res.decouvertDettePassif, 350);
  });

  it("D3 — découvert avec dette reconnue qui NE correspond PAS au découvert constaté : non porté au passif (écart non résolu)", () => {
    const res = resolveTresorerie({ bankMode: "DEDIE", closingCash: -350, decouvertDetteReconnue: 200 });
    assert.equal(res.decouvertBancaire, 350);
    assert.equal(res.decouvertDettePassif, undefined, "un montant de dette reconnu qui ne correspond pas au découvert n'est jamais forcé au passif");
  });

  it("D4 — cash positif : aucun découvert, decouvertDettePassif non pertinent (undefined)", () => {
    const res = resolveTresorerie({ bankMode: "DEDIE", closingCash: 500 });
    assert.equal(res.decouvertBancaire, undefined);
    assert.equal(res.decouvertDettePassif, undefined);
  });

  it("D5 — cash = 0 explicitement (mode mixte) : TRESORERIE_NULLE_DECLAREE, distinct de INCONNUE", () => {
    const res = resolveTresorerie({ bankMode: "MIXTE", declaredProfessionalCash: 0 });
    assert.equal(res.etat, "TRESORERIE_NULLE_DECLAREE");
    assert.equal(res.decouvertBancaire, undefined);
  });
});

function round2Diff(a: number, b: number): number {
  return Math.round((a - b + Number.EPSILON) * 100) / 100;
}
