import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F012ChargesAssistant } from "./assistant";
import { toF012PersistedState } from "./types";
import type { F012Deps } from "./types";

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

describe("F-012 — Cycle 4B : sécurisation du micro-flux travaux", () => {
  it("A — description + montant → qualification → réparation : ajoutée à collected.travaux, pas d'amortissement", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Remplacement chauffe-eau",
      montant: 900,
    });
    assert.equal(turn.state.travauxSubStep, "qualification");
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "reparation_identique" });
    assert.equal(turn.state.travauxSubStep, undefined);
    assert.deepEqual(
      turn.state.collected.travaux.map((t) => ({ description: t.description, montant: t.montant, nature: t.natureIntervention })),
      [{ description: "Remplacement chauffe-eau", montant: 900, nature: "entretien" }],
    );
    assert.equal(turn.event, undefined);
  });

  it("B — description + montant → amélioration : COMPOSANT_NOUVEAU, jamais comptée comme charge", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Douche italienne",
      montant: 8000,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "amelioration" });
    assert.equal(turn.event, "COMPOSANT_NOUVEAU");
    assert.equal(turn.state.collected.travaux[0]?.natureIntervention, "amélioration");
  });

  it("C — split réparation/amélioration (facture mixte)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Rénovation salle de bain",
      montant: 12000,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "mixte" });
    assert.equal(turn.state.travauxSubStep, "split");
    turn = await assistant.handle(turn.state, { type: "submit_travaux_split", montantReparation: 4000 });
    assert.equal(turn.state.travauxSubStep, undefined);
    assert.equal(turn.state.collected.travaux[0]?.montantReparation, 4000);
  });

  it("D — split, montant entièrement réparation (immobilisation nulle) : toujours ajoutée, jamais perdue", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, { type: "submit_travaux_description", description: "Peinture", montant: 2000 });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "mixte" });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_split", montantReparation: 2000 });
    assert.equal(turn.state.collected.travaux.length, 1, "l'entrée reste bien présente même à immobilisation nulle");
    assert.equal(turn.state.collected.travaux[0]?.montantReparation, 2000);
  });

  it("E — split, montant entièrement amélioration (part réparation nulle) : toujours ajoutée", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, { type: "submit_travaux_description", description: "Extension", montant: 5000 });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "mixte" });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_split", montantReparation: 0 });
    assert.equal(turn.state.collected.travaux.length, 1);
    assert.equal(turn.state.collected.travaux[0]?.montantReparation, 0);
  });

  it("F — qualification « incertain » : toujours ajoutée à collected.travaux, jamais perdue (qualité de la règle KS hors scope)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, { type: "submit_travaux_description", description: "Cas ambigu", montant: 600 });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "incertain" });
    assert.equal(turn.state.collected.travaux.length, 1, "l'item n'est jamais perdu, quelle que soit la qualification retenue");
  });

  it("G1 — tentative de terminer pendant la qualification : la dépense décrite n'est jamais perdue", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Chauffe-eau",
      montant: 900,
    });
    const beforeFinish = turn.state;
    turn = await assistant.handle(turn.state, { type: "finish_travaux_category" });

    assert.equal(turn.completed, false);
    assert.equal(turn.state.travauxSubStep, "qualification", "reste sur la qualification, n'avance pas");
    assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "travaux");
    assert.deepEqual(turn.state.pendingTravaux, beforeFinish.pendingTravaux, "la dépense décrite est intégralement conservée");
    assert.equal(turn.state.collected.travaux.length, 0, "pas encore qualifiée, donc pas encore comptée — mais pas perdue non plus");
    const last = turn.messages.at(-1);
    assert.ok(last?.suggestions?.some((s) => s.id === "amelioration"), "la qualification est redemandée explicitement");
  });

  it("G2 — tentative de terminer pendant le split : la dépense en cours de scission n'est jamais perdue", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, { type: "submit_travaux_description", description: "Toiture", montant: 10000 });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "mixte" });
    const beforeFinish = turn.state;
    turn = await assistant.handle(turn.state, { type: "finish_travaux_category" });

    assert.equal(turn.completed, false);
    assert.equal(turn.state.travauxSubStep, "split");
    assert.deepEqual(turn.state.pendingTravaux, beforeFinish.pendingTravaux);
    assert.equal(turn.state.collected.travaux.length, 0);
    assert.ok(turn.messages.at(-1)?.content.includes("part remise en état"), "le split est redemandé explicitement");
  });

  it("G3 — terminer fonctionne normalement en dehors de toute qualification/split en attente (pas de sur-restriction)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const turn = await reachTravaux(assistant);
    // Aucune dépense décrite (travauxSubStep indéfini) — "Terminer" doit
    // continuer à fonctionner exactement comme avant ce cycle : avance à la
    // catégorie suivante de l'inventaire (ici "frais_bancaires", "travaux"
    // n'étant pas la dernière catégorie pour ce profil).
    const after = await assistant.handle(turn.state, { type: "finish_travaux_category" });
    assert.equal(after.state.step, "category_collect");
    assert.equal(after.state.categoryInventory[after.state.currentCategoryIndex], "frais_bancaires");
  });

  it("H — montant 0 : qualifiable normalement depuis le Correctif Cycle 4B1 (0 est une valeur présente)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, { type: "submit_travaux_description", description: "Petite réparation", montant: 0 });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "reparation_identique" });
    assert.equal(turn.state.collected.travaux.length, 1, "un montant de 0 n'est plus ignoré (Cycle 4B1)");
    assert.equal(turn.state.collected.travaux[0]?.montant, 0);
  });

  it("I — description vide au niveau runtime : ne casse rien, reste cohérent (le formulaire panel bloque déjà ce cas en amont, inchangé par ce cycle)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, { type: "submit_travaux_description", description: "", montant: 500 });
    assert.equal(turn.state.travauxSubStep, "qualification");
    assert.equal(turn.state.pendingTravaux?.description, "");
  });

  it("J — refresh pendant description : la reprise redemande la description, « Terminer » fonctionne toujours normalement après reprise", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(before);
    turn = await before.handle(turn.state, { type: "start_travaux" });
    assert.equal(turn.state.travauxSubStep, "description");
    const persisted = toF012PersistedState(turn.state, "2024-03-01T10:00:00.000Z");

    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.equal(resumed.state.travauxSubStep, "description");

    const finished = await after.handle(resumed.state, { type: "finish_travaux_category" });
    assert.equal(finished.state.step, "category_collect", "aucune sur-restriction : rien n'était en attente de qualification");
    assert.equal(finished.state.categoryInventory[finished.state.currentCategoryIndex], "frais_bancaires");
  });

  it("K — refresh pendant qualification : la reprise protège toujours la dépense contre « Terminer »", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(before);
    turn = await before.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Remplacement chaudière",
      montant: 1500,
    });
    const persisted = toF012PersistedState(turn.state, "2024-03-01T10:00:00.000Z");

    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.equal(resumed.state.travauxSubStep, "qualification");

    const finished = await after.handle(resumed.state, { type: "finish_travaux_category" });
    assert.equal(finished.state.travauxSubStep, "qualification", "toujours protégée après une reprise");
    assert.equal(finished.state.pendingTravaux?.description, "Remplacement chaudière");
    assert.equal(finished.state.collected.travaux.length, 0);
  });

  it("L — refresh pendant split : la reprise protège toujours la dépense contre « Terminer »", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(before);
    turn = await before.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Ravalement mixte",
      montant: 9000,
    });
    turn = await before.handle(turn.state, { type: "submit_travaux_qualification", choix: "mixte" });
    const persisted = toF012PersistedState(turn.state, "2024-03-01T10:00:00.000Z");

    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.equal(resumed.state.travauxSubStep, "split");

    const finished = await after.handle(resumed.state, { type: "finish_travaux_category" });
    assert.equal(finished.state.travauxSubStep, "split");
    assert.equal(finished.state.pendingTravaux?.description, "Ravalement mixte");
    assert.equal(finished.state.collected.travaux.length, 0);
  });
});
