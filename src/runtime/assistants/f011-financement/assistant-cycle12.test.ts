import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F011FinancementAssistant } from "./assistant";
import type { F011Deps, F011PersistedState, F011State } from "./types";
import { toF011PersistedState } from "./types";

/**
 * F011-2 — « Modifier mes réponses » depuis `complete`. Avant ce correctif,
 * le panel ne proposait aucun moyen de revenir sur un prêt confirmé une fois
 * F011 terminé : `complete`/`skipped` étaient explicitement exclus du
 * `GO_BACK` visible, et `resolveF011ResumeDecision` reconstruisait un état
 * synthétique (`loans: []`, sans `history`) au lieu de reprendre le vrai
 * `F011PersistedState` — un `GO_BACK` après reload n'aurait donc rien eu à
 * restaurer même si le bouton avait existé.
 *
 * Ces tests couvrent le runtime (`F011FinancementAssistant`), pas le panel
 * React (pas d'infrastructure de test DOM dans ce projet — voir
 * `f011-loan-form-state.test.ts`) : `GO_BACK` depuis `complete` est l'action
 * que le bouton « Modifier mes réponses » déclenche telle quelle.
 */

const ctx = { dossierId: "test", fiscalYear: 2022, route: "/assistants/financement" };
const DEPS_OK: F011Deps = { dateMiseEnService: "2021-01-01" };
const TS = "2024-07-01T09:00:00.000Z";

async function completeSingleLoan(assistant: F011FinancementAssistant): Promise<F011State> {
  let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
  turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 1 });
  turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "manual" });
  turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
  turn = await assistant.handle(turn.state, {
    type: "submit_loan_terms",
    capitalInitial: 150000,
    tauxNominal: 0.018,
    dureeMois: 240,
    datePremiereMensualite: "2022-03-01",
  });
  turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
  turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
  turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
  turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
  turn = await assistant.handle(turn.state, { type: "confirm_loan" });
  assert.equal(turn.state.step, "aggregate_review");
  turn = await assistant.handle(turn.state, { type: "confirm_all" });
  assert.equal(turn.state.step, "complete");
  assert.equal(turn.completed, true);
  return turn.state;
}

describe("F-011 — Cycle 12 : Modifier mes réponses depuis `complete`", () => {
  it("D — GO_BACK depuis `complete` restaure les prêts réellement confirmés (aggregate_review)", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const completed = await completeSingleLoan(assistant);
    assert.equal(completed.loans.length, 1);

    const back = await assistant.handle(completed, { type: "go_back" });
    assert.equal(back.state.step, "aggregate_review", "retombe sur l'écran de revue, pas un dossier vide");
    assert.equal(back.state.loans.length, 1);
    assert.equal(back.state.loans[0]!.capitalInitial, 150000);
  });

  it("E — aucune donnée financière n'est perdue entre `complete` et la revue rouverte", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const completed = await completeSingleLoan(assistant);
    const back = await assistant.handle(completed, { type: "go_back" });
    const loan = back.state.loans[0]!;
    assert.equal(loan.capitalInitial, 150000);
    assert.equal(loan.tauxNominal, 0.018);
    assert.equal(loan.dureeMois, 240);
    assert.equal(loan.datePremiereMensualite, "2022-03-01");
  });

  it("F — modifier un prêt (edit_loan) puis re-valider recalcule avant la nouvelle confirmation", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const completed = await completeSingleLoan(assistant);
    const originalInterest = completed.result?.charges.totalInteretsEmprunt;
    assert.ok(originalInterest !== undefined);

    const back = await assistant.handle(completed, { type: "go_back" });
    const pretId = back.state.loans[0]!.pretId;
    let turn = await assistant.handle(back.state, { type: "edit_loan", pretId });
    assert.equal(turn.state.step, "loan_type");
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 300000,
      tauxNominal: 0.018,
      dureeMois: 240,
      datePremiereMensualite: "2022-03-01",
    });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "aggregate_review");
    assert.notEqual(
      turn.state.result?.charges.totalInteretsEmprunt,
      originalInterest,
      "le montant recalculé doit refléter le capital corrigé (300000 au lieu de 150000), jamais le résultat mis en cache",
    );

    const reconfirmed = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(reconfirmed.state.step, "complete");
    assert.equal(reconfirmed.state.loans[0]!.capitalInitial, 300000);
  });

  it("G — reload (toF011PersistedState → resume) puis Modifier restaure les mêmes données", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const completed = await completeSingleLoan(assistant);

    const persisted: F011PersistedState = toF011PersistedState(completed, TS);
    assert.equal(persisted.step, "complete");
    assert.equal(persisted.loans.length, 1, "les vrais prêts sont bien sérialisés, jamais un tableau vide");
    assert.ok(persisted.history && persisted.history.length > 0, "l'historique de la revue survit à la sérialisation");

    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "complete");
    assert.equal(resumed.state.loans.length, 1);

    const back = await assistant.handle(resumed.state, { type: "go_back" });
    assert.equal(back.state.step, "aggregate_review");
    assert.equal(back.state.loans[0]!.capitalInitial, 150000);
    assert.equal(back.state.loans[0]!.tauxNominal, 0.018);
    assert.equal(back.state.loans[0]!.dureeMois, 240);
    assert.equal(back.state.loans[0]!.datePremiereMensualite, "2022-03-01");
  });

  it("H — dossier sans crédit (`skipped`) : comportement de GO_BACK inchangé par ce correctif (pas de nouveau raccourci depuis `complete` qui déborderait sur `skipped`)", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: false });
    assert.equal(turn.state.step, "skipped");
    assert.equal(turn.state.result?.skipped, true);

    // Comportement déjà existant (non modifié par F011-2, qui ne touche que
    // `complete`) : GO_BACK ramène à l'étape quittée, ici `presence_emprunt`.
    // Le panel, lui, n'affiche jamais « Modifier mes réponses » pour `skipped`
    // (réservé à `step === "complete"` — voir F011FinancementAssistantPanel).
    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.step, "presence_emprunt");
  });
});
