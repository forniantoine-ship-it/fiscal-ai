import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F012ChargesAssistant } from "./assistant";
import { toF012PersistedState } from "./types";
import type { F012Deps } from "./types";

const ctx = { dossierId: "test", fiscalYear: 2024, route: "/assistants/charges" };
const PROFIL_SIMPLE = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };

async function reachDivers(assistant: F012ChargesAssistant) {
  let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
  turn = await assistant.handle(turn.state, { type: "skip_category" }); // taxe_fonciere
  turn = await assistant.handle(turn.state, { type: "skip_category" }); // assurance_pno
  turn = await assistant.handle(turn.state, { type: "skip_category" }); // frais_bancaires
  assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "divers");
  return turn;
}

describe("F-012 — Cycle 4A : correction du dead-end « Charges diverses »", () => {
  it("A — description + montant → submit_divers ajoute bien la charge à collected.divers", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const reached = await reachDivers(assistant);
    const turn = await assistant.handle(reached.state, {
      type: "submit_divers",
      description: "Frais de déplacement",
      montant: 80,
    });
    assert.deepEqual(
      turn.state.collected.divers.map((d) => ({ description: d.description, montant: d.montant })),
      [{ description: "Frais de déplacement", montant: 80 }],
    );
    // La catégorie "divers" est la dernière de l'inventaire — une soumission
    // valide y met fin normalement, comme pour toute autre catégorie.
    assert.equal(turn.state.step, "completeness");
  });

  it("E — skip_category : aucune charge ajoutée, comportement de skip existant conservé", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const reached = await reachDivers(assistant);
    const turn = await assistant.handle(reached.state, { type: "skip_category" });
    assert.deepEqual(turn.state.collected.divers, []);
    assert.equal(turn.state.step, "completeness");
  });

  it("F — plusieurs charges diverses déjà collectées : une nouvelle soumission s'ajoute, ne mélange ni n'écrase les précédentes", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const reached = await reachDivers(assistant);
    // Un item déjà présent (ex. reçu d'une session précédente) — vérifie que
    // l'ajout d'un second item ne touche jamais au premier (`afterCategoryInput`
    // append, jamais remplacement). Le runtime actuel ne permet de soumettre
    // qu'un seul item par visite de la catégorie "divers" (limite déjà
    // documentée, hors scope de ce cycle) — ce test isole donc la logique
    // d'ajout elle-même, indépendamment de ce parcours.
    const stateWithExistingItem = {
      ...reached.state,
      collected: {
        ...reached.state.collected,
        divers: [{ id: "divers-1", description: "Premier poste", montant: 42 }],
      },
    };
    const turn = await assistant.handle(stateWithExistingItem, {
      type: "submit_divers",
      description: "Second poste",
      montant: 58,
    });
    assert.deepEqual(
      turn.state.collected.divers.map((d) => ({ description: d.description, montant: d.montant })),
      [
        { description: "Premier poste", montant: 42 },
        { description: "Second poste", montant: 58 },
      ],
    );
  });

  it("G — persistance/reprise : une charge diverse ajoutée (y compris taguée doublon F-011) survit à un refresh", async () => {
    const withF011: F012Deps = {
      ...DEPS,
      financementCharges: { totalAssurance: 300, totalCapitalRembourse: 0 },
    };
    const before = new F012ChargesAssistant(ctx, withF011);
    const reached = await reachDivers(before);
    const submitted = await before.handle(reached.state, {
      type: "submit_divers",
      description: "Assurance emprunteur",
      montant: 300,
    });
    const persisted = toF012PersistedState(submitted.state, "2024-03-01T10:00:00.000Z");

    const after = new F012ChargesAssistant(ctx, withF011);
    const resumed = after.resume(persisted);
    assert.deepEqual(
      resumed.state.collected.divers.map((d) => ({ description: d.description, montant: d.montant, financementOverlap: d.financementOverlap })),
      [{ description: "Assurance emprunteur", montant: 300, financementOverlap: "assurance_emprunteur" }],
      "l'item saisi ET son marquage anti-doublon (Cycle 3) survivent tous deux à la reprise",
    );
  });
});
