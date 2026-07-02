import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F011FinancementAssistant } from "./assistant";

const ctx = {
  dossierId: "test",
  fiscalYear: 2022,
  route: "/assistants/financement",
};

describe("F-011 — Assistant Financement", () => {
  it("termine immédiatement en skip si pas d'emprunt", async () => {
    const assistant = new F011FinancementAssistant(ctx);
    const start = assistant.start();
    const turn = await assistant.handle(start.state, { type: "set_presence_emprunt", presence: false });
    assert.equal(turn.completed, true);
    assert.equal(turn.event, "FINANCEMENT_SKIP");
    assert.equal(turn.state.result?.skipped, true);
  });

  it("configure un prêt unique puis termine", async () => {
    const assistant = new F011FinancementAssistant(ctx, {
      dateMiseEnService: "2022-06-01",
    });
    let state = assistant.start().state;
    let turn = await assistant.handle(state, { type: "set_presence_emprunt", presence: true });
    state = turn.state;
    turn = await assistant.handle(state, { type: "set_nombre_prets", count: 1 });
    state = turn.state;
    turn = await assistant.handle(state, {
      type: "submit_loan",
      typePret: "amortissable",
      capitalInitial: 200000,
      tauxNominal: 0.0185,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-15",
    });
    state = turn.state;
    turn = await assistant.handle(state, { type: "confirm_loan" });
    state = turn.state;
    assert.equal(turn.state.step, "aggregate_review");
    turn = await assistant.handle(state, { type: "confirm_all" });
    assert.equal(turn.completed, true);
    assert.equal(turn.event, "FINANCEMENT_TERMINE");
    assert.ok(turn.state.result?.charges.totalChargesFinancementExercice);
  });
});
