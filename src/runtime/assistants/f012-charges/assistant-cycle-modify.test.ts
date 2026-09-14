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

async function skipToConfirm(assistant: F012ChargesAssistant, state: Parameters<F012ChargesAssistant["handle"]>[0]) {
  let turn = { state, messages: [], completed: false } as Awaited<ReturnType<F012ChargesAssistant["handle"]>>;
  // Avance jusqu'à la fin de l'inventaire des catégories en sautant chaque étape restante.
  while (turn.state.step === "category_collect") {
    turn = await assistant.handle(turn.state, { type: "skip_category" });
  }
  if (turn.state.step === "completeness") {
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
  }
  return turn;
}

describe("Chantier 2 (§8) — incertain ≥ seuil : résolution de la date manquante, sans impasse", () => {
  it("K — incertain ≥ seuil bloque confirm_all, resolve_travaux_date débloque, confirm_all réussit ensuite", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Rénovation ambiguë",
      montant: 9000,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "incertain" });
    // "incertain" ne demande jamais de date à la qualification elle-même
    // (JUG-008 inchangée) — l'item est collecté tel quel.
    assert.equal(turn.state.collected.travaux.length, 1);
    assert.equal(turn.state.collected.travaux[0]?.choix, "incertain");
    assert.equal(turn.state.collected.travaux[0]?.dateDebut, undefined);

    turn = await assistant.handle(turn.state, { type: "finish_travaux_category" });
    turn = await skipToConfirm(assistant, turn.state);
    assert.equal(turn.state.step, "aggregate_review");

    const blocked = await assistant.handle(turn.state, { type: "confirm_all" });
    // Jamais 0 charge / 0 immobilisation silencieux : bloqué, jamais complet.
    assert.equal(blocked.state.step, "aggregate_review");
    assert.equal(blocked.completed, false);
    assert.ok(
      blocked.state.result?.anomalies.some((a) => a.severity === "error" && a.field === "travaux-1"),
      "l'item incertain non résolu doit rester bloquant, jamais disparu",
    );

    // L'utilisateur peut fournir la donnée manquante — jamais une impasse.
    const resolved = await assistant.handle(blocked.state, {
      type: "resolve_travaux_date",
      travauxId: "travaux-1",
      dateDebut: "2024-05-01",
    });
    assert.equal(resolved.state.step, "aggregate_review");
    assert.equal(resolved.state.collected.travaux[0]?.dateDebut, "2024-05-01");
    assert.equal(
      resolved.state.result?.anomalies.some((a) => a.severity === "error"),
      false,
      "plus aucune anomalie bloquante une fois la date fournie",
    );
    // La qualification n'a jamais été rouverte (JUG-008 inchangée).
    assert.equal(resolved.state.collected.travaux[0]?.choix, "incertain");

    const done = await assistant.handle(resolved.state, { type: "confirm_all" });
    assert.equal(done.state.step, "complete");
    assert.equal(done.completed, true);
    // Montant ≥ seuil résolu par prudence (JUG-008) → immobilisation, jamais 0/0.
    assert.equal(done.state.result?.charges.composantsNouveaux.length, 1);
    assert.equal(done.state.result?.charges.composantsNouveaux[0]?.dateDebut, "2024-05-01");
  });

  it("incertain < seuil (charge, SAV-015) : jamais bloqué, aucune date demandée", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(assistant);
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Petite réparation ambiguë",
      montant: 300,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "incertain" });
    turn = await assistant.handle(turn.state, { type: "finish_travaux_category" });
    turn = await skipToConfirm(assistant, turn.state);

    const done = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(done.state.step, "complete");
    assert.equal(done.state.result?.charges.totalDeductible, 300);
    assert.equal(done.state.result?.charges.composantsNouveaux.length, 0);
  });
});

describe("Chantier 2 (§9 L/M/N) — persistance/reload autour de Modifier", () => {
  it("M — complete → reload (persist/resume) → Modifier (go_back) : fonctionne, données conservées", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(before);
    turn = await before.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Chauffe-eau",
      montant: 900,
    });
    turn = await before.handle(turn.state, { type: "submit_travaux_qualification", choix: "reparation_identique" });
    turn = await before.handle(turn.state, { type: "finish_travaux_category" });
    turn = await skipToConfirm(before, turn.state);
    const completed = await before.handle(turn.state, { type: "confirm_all" });
    assert.equal(completed.state.step, "complete");

    // Simule un reload : nouvelle instance d'assistant, état repris depuis
    // le seul F012PersistedState (miroir exact du panel après un refresh).
    const persisted = toF012PersistedState(completed.state, "2024-03-01T10:00:00.000Z");
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.equal(resumed.state.step, "complete");
    assert.equal(resumed.state.collected.travaux[0]?.description, "Chauffe-eau");

    const modifying = await after.handle(resumed.state, { type: "go_back" });
    assert.notEqual(modifying.state.step, "complete", "Modifier fonctionne après un reload");
    assert.equal(modifying.state.collected.travaux[0]?.description, "Chauffe-eau", "aucune donnée perdue");
  });

  it("L/N — modification abandonnée (go_back sans reconfirmer) puis reload : état cohérent, aucune corruption", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachTravaux(before);
    turn = await before.handle(turn.state, { type: "submit_travaux_description", description: "Toiture", montant: 5000 });
    turn = await before.handle(turn.state, { type: "submit_travaux_qualification", choix: "reparation_identique" });
    turn = await before.handle(turn.state, { type: "finish_travaux_category" });
    turn = await skipToConfirm(before, turn.state);
    const completed = await before.handle(turn.state, { type: "confirm_all" });

    // Ouvre l'édition (go_back) puis abandonne sans jamais reconfirmer.
    const editing = await before.handle(completed.state, { type: "go_back" });
    assert.notEqual(editing.state.step, "complete");

    // "Reload" à ce point précis (mi-édition, jamais reconfirmé) : le
    // round-trip persist/resume doit rester cohérent, sans planter ni
    // fabriquer une donnée — même contrat que persistSession() (appelé à
    // chaque tour, y compris pendant l'édition, côté panel).
    const persisted = toF012PersistedState(editing.state, "2024-03-01T10:00:00.000Z");
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.equal(resumed.state.step, editing.state.step, "l'état d'édition abandonné se reprend à l'identique");
    assert.equal(resumed.state.collected.travaux[0]?.description, "Toiture", "aucune corruption des données déjà collectées");
  });
});
