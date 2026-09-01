import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F012ChargesAssistant } from "./assistant";

const ctx = {
  dossierId: "test",
  fiscalYear: 2024,
  route: "/assistants/charges",
};

describe("F-012 — Assistant Charges", () => {
  it("démarre sur le profilage", () => {
    const assistant = new F012ChargesAssistant(ctx);
    const start = assistant.start();
    assert.equal(start.state.step, "profilage");
    assert.match(start.messages[0]?.content ?? "", /syndic/i);
  });

  it("qualifie un travaux en amélioration", async () => {
    const assistant = new F012ChargesAssistant(ctx, { dateMiseEnService: "2023-01-01" });
    let state = assistant.start().state;

    let turn = await assistant.handle(state, {
      type: "submit_profilage",
      copropriete: false,
      agence: false,
      travaux: true,
      vacance: false,
      comptable: false,
    });
    state = turn.state;

    while (state.step === "category_collect" && state.categoryInventory[state.currentCategoryIndex] !== "travaux") {
      turn = await assistant.handle(state, { type: "skip_category" });
      state = turn.state;
    }

    turn = await assistant.handle(state, { type: "start_travaux" });
    state = turn.state;
    turn = await assistant.handle(state, {
      type: "submit_travaux_description",
      description: "Cuisine équipée haut de gamme",
      montant: 5000,
    });
    state = turn.state;
    turn = await assistant.handle(state, {
      type: "submit_travaux_qualification",
      choix: "amelioration",
    });

    assert.equal(turn.event, "COMPOSANT_NOUVEAU");
    assert.equal(turn.state.collected.travaux.length, 1);
  });
});
