import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { composantsNouveauxChanged } from "./f012-amortissement-freshness";
import type { ComposantNouveau } from "@/runtime";

function composant(overrides: Partial<ComposantNouveau> = {}): ComposantNouveau {
  return {
    id: "travaux-1",
    label: "Extension",
    montant: 12000,
    dureeAnnees: 18,
    dotationAnnuelle: 667,
    nature: "amélioration",
    dateDebut: "2025-06-01",
    origin: "f012_travaux",
    ...overrides,
  };
}

describe("composantsNouveauxChanged — Chantier 2, F012 → F014 freshness", () => {
  it("aucun changement (rien avant, rien après) : pas de drift", () => {
    assert.equal(composantsNouveauxChanged(undefined, undefined), false);
    assert.equal(composantsNouveauxChanged([], []), false);
  });

  it("même composant, même valeurs : pas de drift (Modifier sans changement)", () => {
    assert.equal(composantsNouveauxChanged([composant()], [composant()]), false);
  });

  it("montant changé : drift détecté", () => {
    assert.equal(composantsNouveauxChanged([composant()], [composant({ montant: 15000 })]), true);
  });

  it("durée changée : drift détecté", () => {
    assert.equal(composantsNouveauxChanged([composant()], [composant({ dureeAnnees: 20 })]), true);
  });

  it("date propre changée : drift détecté", () => {
    assert.equal(composantsNouveauxChanged([composant()], [composant({ dateDebut: "2025-09-01" })]), true);
  });

  it("nouveau composant ajouté : drift détecté", () => {
    assert.equal(
      composantsNouveauxChanged([composant()], [composant(), composant({ id: "travaux-2" })]),
      true,
    );
  });

  it("composant supprimé : drift détecté", () => {
    assert.equal(composantsNouveauxChanged([composant(), composant({ id: "travaux-2" })], [composant()]), true);
  });

  it("label/nature/origin seuls changés (métadonnées, jamais consommées par F-014) : pas de drift", () => {
    assert.equal(
      composantsNouveauxChanged(
        [composant()],
        [composant({ label: "Extension véranda", nature: "construction" })],
      ),
      false,
    );
  });

  it("ordre différent, même contenu : pas de drift (comparaison indépendante de l'ordre)", () => {
    const a = composant({ id: "travaux-1" });
    const b = composant({ id: "travaux-2", montant: 5000 });
    assert.equal(composantsNouveauxChanged([a, b], [b, a]), false);
  });
});
