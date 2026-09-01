import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F012ChargesAssistant } from "./assistant";
import { toF012PersistedState } from "./types";
import type { F012Deps, F012State } from "./types";

const ctx = { dossierId: "test", fiscalYear: 2024, route: "/assistants/charges" };
const PROFIL_TRAVAUX = { copropriete: false, agence: false, travaux: true, vacance: false, comptable: false };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };

async function reachTravaux(assistant: F012ChargesAssistant) {
  let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_TRAVAUX });
  turn = await assistant.handle(turn.state, { type: "skip_category" }); // taxe_fonciere
  turn = await assistant.handle(turn.state, { type: "skip_category" }); // assurance_pno
  assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "travaux");
  return turn;
}

describe("F-012 — Cycle 4B1 : correction du montant 0 dans la qualification travaux", () => {
  it("A — montant 0 + réparation à l'identique : progression normale, ajoutée à collected.travaux", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Réparation gratuite sous garantie",
      montant: 0,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "reparation_identique" });
    assert.equal(turn.state.travauxSubStep, undefined, "la qualification a bien progressé, plus bloquée");
    assert.deepEqual(
      turn.state.collected.travaux.map((t) => ({ description: t.description, montant: t.montant, nature: t.natureIntervention })),
      [{ description: "Réparation gratuite sous garantie", montant: 0, nature: "entretien" }],
    );
    assert.equal(turn.event, undefined);
  });

  it("B — montant 0 + amélioration : progression normale, COMPOSANT_NOUVEAU émis normalement", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Amélioration prise en charge par un tiers",
      montant: 0,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "amelioration" });
    assert.equal(turn.state.travauxSubStep, undefined);
    assert.equal(turn.state.collected.travaux[0]?.natureIntervention, "amélioration");
    assert.equal(turn.event, "COMPOSANT_NOUVEAU");
  });

  it("C — montant 0 + split (facture mixte) : comportement cohérent, la part réparation à 0 est acceptée", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Dépense mixte à montant nul",
      montant: 0,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "mixte" });
    assert.equal(turn.state.travauxSubStep, "split", "le passage au split n'est plus bloqué par le montant 0");
    turn = await assistant.handle(turn.state, { type: "submit_travaux_split", montantReparation: 0 });
    assert.equal(turn.state.travauxSubStep, undefined);
    assert.equal(turn.state.collected.travaux.length, 1, "le split lui-même n'est plus bloqué par le montant 0");
    assert.equal(turn.state.collected.travaux[0]?.montantReparation, 0);
  });

  it("D — montant undefined : toujours refusé (seule l'absence réelle bloque, pas la valeur 0)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const turn = await reachTravaux(assistant);
    // pendingTravaux sans montant du tout (construction directe — ne peut pas
    // survenir via submit_travaux_description, qui fixe toujours `montant`) :
    // vérifie que le garde-fou ne se contente pas d'accepter "montant !== undefined"
    // par accident, il continue de refuser une absence réelle.
    const stateWithoutMontant: F012State = {
      ...turn.state,
      pendingTravaux: { id: "travaux-1", description: "Dépense incomplète" },
      travauxSubStep: "qualification",
    };
    const result = await assistant.handle(stateWithoutMontant, {
      type: "submit_travaux_qualification",
      choix: "reparation_identique",
    });
    assert.deepEqual(result.state, stateWithoutMontant, "aucune progression sans montant réellement défini");
    assert.equal(result.state.collected.travaux.length, 0);
  });

  it("E — montant positif : non-régression du cas nominal", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Remplacement chauffe-eau",
      montant: 900,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "reparation_identique" });
    assert.equal(turn.state.collected.travaux[0]?.montant, 900);
  });

  it("F — qualification « incertain » inchangée (montant positif comme montant 0)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, { type: "submit_travaux_description", description: "Cas ambigu", montant: 0 });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "incertain" });
    // Cycle UX-A — « je ne suis pas certain » n'est plus mappé vers entretien.
    // Le Cycle 4B1 ne garantit que : l'item n'est pas perdu (montant 0 accepté).
    assert.equal(turn.state.collected.travaux.length, 1);
    assert.notEqual(turn.state.collected.travaux[0]?.natureIntervention, "entretien");
  });

  it("G — persistance/reprise : un montant 0 en attente de qualification reste qualifiable après un refresh", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(before);
    turn = await before.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Montant nul repris après refresh",
      montant: 0,
    });
    const persisted = toF012PersistedState(turn.state, "2024-03-01T10:00:00.000Z");

    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.equal(resumed.state.pendingTravaux?.montant, 0);

    const qualified = await after.handle(resumed.state, { type: "submit_travaux_qualification", choix: "reparation_identique" });
    assert.equal(qualified.state.collected.travaux.length, 1, "toujours qualifiable après reprise, plus bloquée");
    assert.equal(qualified.state.collected.travaux[0]?.montant, 0);
  });
});
