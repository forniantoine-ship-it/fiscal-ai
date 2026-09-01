import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F010LogementAssistant } from "./assistant";
import type { F010State } from "./types";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

describe("F-010 — Assistant Logement (Chemin A)", () => {
  it("parcourt le flux achat standard et produit un plan valide", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });

    const startTurn = assistant.start();
    assert.equal(startTurn.state.step, "orientation");

    let turn = await assistant.handle(startTurn.state, { type: "select_nature", nature: "achat" });
    assert.equal(turn.state.step, "acquisition_source");

    turn = await assistant.handle(turn.state, { type: "select_source", source: "manuel" });
    assert.equal(turn.state.step, "collect_bien");

    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      natureBien: "ancien",
      dateAcquisition: "2024-03-01",
      fieldSources: { prixAcquisition: "manual", typeBien: "manual", dateAcquisition: "manual" },
    });
    assert.equal(turn.state.step, "collect_frais");

    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
    });
    assert.equal(turn.state.step, "collect_mobilier");

    turn = await assistant.handle(turn.state, { type: "skip_mobilier" });
    assert.equal(turn.state.step, "ventilation");

    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.15 });
    assert.equal(turn.state.step, "review_plan");
    assert.ok(turn.state.result);
    assert.equal(turn.state.result!.prixRevient, 299500);
    assert.equal(turn.state.result!.baseAmortissableBati, 254575);
    assert.equal(turn.state.result!.planValide, true);
    assert.ok(turn.state.result!.explanation.length > 0);
    assert.ok(!/composant|VNC/i.test(turn.state.result!.explanation));

    turn = await assistant.handle(turn.state, { type: "confirm" });
    assert.equal(turn.completed, true);
    assert.equal(turn.state.step, "complete");
  });

  it("n'expose jamais de jargon (composants / VNC) dans les messages", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const collected: string[] = [];
    const start = assistant.start();
    collected.push(...start.messages.map((m) => m.content));

    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    collected.push(...turn.messages.map((m) => m.content));
    turn = await assistant.handle(turn.state, { type: "select_source", source: "manuel" });
    collected.push(...turn.messages.map((m) => m.content));
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      natureBien: "ancien",
      dateAcquisition: "2024-03-01",
    });
    collected.push(...turn.messages.map((m) => m.content));
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
    });
    collected.push(...turn.messages.map((m) => m.content));
    turn = await assistant.handle(turn.state, { type: "skip_mobilier" });
    collected.push(...turn.messages.map((m) => m.content));
    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.15 });
    collected.push(...turn.messages.map((m) => m.content));

    for (const content of collected) {
      assert.ok(!/composant|VNC/i.test(content), `Jargon détecté : ${content}`);
    }
  });

  it("oriente les natures hors Chemin A vers 'bientôt disponible'", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    const turn = await assistant.handle(start.state, { type: "select_nature", nature: "heritage_donation" });
    assert.equal(turn.state.step, "coming_soon");
    assert.equal(turn.completed, false);
  });

  it("trace la provenance des Fields", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "acte" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      natureBien: "ancien",
      dateAcquisition: "2024-03-01",
      fieldSources: { prixAcquisition: "extracted", typeBien: "extracted", dateAcquisition: "manual" },
    });
    const state: F010State = turn.state;
    assert.equal(state.fieldSources.prixAcquisition, "extracted");
    assert.equal(state.fieldSources.typeBien, "extracted");
  });

  it("provenance par champ (Cycle 3) : jamais un flag global — un champ peut être extrait pendant qu'un autre reste manuel", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "acte" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      natureBien: "ancien",
      dateAcquisition: "2024-03-01",
      fieldSources: { prixAcquisition: "extracted", dateAcquisition: "manual" },
    });
    assert.equal(turn.state.fieldSources.prixAcquisition, "extracted");
    assert.equal(turn.state.fieldSources.dateAcquisition, "manual");
    // typeBien omis du fieldSources fourni → retombe sur "manual", jamais sur la valeur d'un autre champ.
    assert.equal(turn.state.fieldSources.typeBien, "manual");
  });
});
