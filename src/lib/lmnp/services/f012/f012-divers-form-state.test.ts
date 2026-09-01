import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveDiversSubmitAction } from "./f012-divers-form-state";

describe("resolveDiversSubmitAction — Cycle 4A", () => {
  it("A — description + montant valides → submit_divers", () => {
    const action = resolveDiversSubmitAction({ description: "Frais de déplacement", montant: "120" });
    assert.deepEqual(action, { type: "submit_divers", description: "Frais de déplacement", montant: 120 });
  });

  it("A bis — virgule décimale acceptée, comme les autres champs Montant du panel", () => {
    const action = resolveDiversSubmitAction({ description: "Abonnement logiciel", montant: "49,90" });
    assert.equal(action?.type === "submit_divers" && action.montant, 49.9);
  });

  it("A ter — la description est nettoyée des espaces superflus", () => {
    const action = resolveDiversSubmitAction({ description: "  Frais bancaires divers  ", montant: "10" });
    assert.equal(action?.type === "submit_divers" && action.description, "Frais bancaires divers");
  });

  it("B — montant 0 : toujours soumis, cohérent avec la règle existante (submit_divers l'auto-saute côté runtime)", () => {
    const action = resolveDiversSubmitAction({ description: "Test", montant: "0" });
    assert.deepEqual(action, { type: "submit_divers", description: "Test", montant: 0 });
  });

  it("C — description vide (ou uniquement des espaces) : aucune action, rien à soumettre", () => {
    assert.equal(resolveDiversSubmitAction({ description: "", montant: "100" }), null);
    assert.equal(resolveDiversSubmitAction({ description: "   ", montant: "100" }), null);
  });

  it("D — montant non numérique : aucune action (même règle que les autres champs Montant du panel)", () => {
    assert.equal(resolveDiversSubmitAction({ description: "Frais divers", montant: "abc" }), null);
    assert.equal(resolveDiversSubmitAction({ description: "Frais divers", montant: "12€" }), null);
  });

  it("D bis — montant vide : traité comme 0, même convention que les champs Montant des autres catégories du panel", () => {
    // `parseAmount("")` vaut 0 dans tout le panel (ex. taxe_fonciere, honoraires_gestion) — la
    // saisie divers suit la même règle, pas une règle inventée pour cette seule catégorie.
    const action = resolveDiversSubmitAction({ description: "Frais divers", montant: "" });
    assert.deepEqual(action, { type: "submit_divers", description: "Frais divers", montant: 0 });
  });
});
