import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F013RevenusAssistant } from "./assistant";

const ctx = {
  dossierId: "test",
  fiscalYear: 2024,
  route: "/assistants/revenus",
};

describe("F-013 — Assistant Revenus (unit)", () => {
  it("collecte le loyer si absent des dépendances", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2023-01-01" });
    const state = assistant.start().state;

    const turn = await assistant.handle(state, {
      type: "submit_diagnostic",
      typeLocation: "longue_duree",
      continuiteBail: "un_locataire",
      modeCharges: "charges_comprises",
    });
    assert.equal(turn.state.step, "loyer_collect");
  });

  it("qualifie un écart de sous-déclaration", async () => {
    const assistant = new F013RevenusAssistant(ctx, {
      dateMiseEnService: "2023-01-01",
      loyerMensuel: 1000,
    });
    let state = assistant.start().state;

    let turn = await assistant.handle(state, {
      type: "submit_diagnostic",
      typeLocation: "longue_duree",
      continuiteBail: "un_locataire",
      modeCharges: "charges_comprises",
    });
    state = turn.state;

    turn = await assistant.handle(state, {
      type: "submit_declaration",
      montant: 8000,
    });
    assert.equal(turn.state.step, "qualify_ecart");
    assert.ok(turn.messages.some((m) => /manque/i.test(m.content)));
  });
});
