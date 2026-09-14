import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F010LogementAssistant } from "./assistant";
import { toF010PersistedState } from "./types";
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

describe("F-010 — P0-3 : la Capacité refuse de confirmer un plan invalide, quel que soit l'appelant", () => {
  async function reachVentilation(ratioTerrain: number) {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "manuel" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      natureBien: "ancien",
      dateAcquisition: "2024-03-01",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
    });
    turn = await assistant.handle(turn.state, { type: "skip_mobilier" });
    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain });
    return { assistant, turn };
  }

  it("ratio terrain = 0 : review_plan affiche planValide=false et confirm est refusé (pas de transition vers complete)", async () => {
    const { assistant, turn } = await reachVentilation(0);
    assert.equal(turn.state.step, "review_plan");
    assert.equal(turn.state.result!.planValide, false);

    const confirmTurn = await assistant.handle(turn.state, { type: "confirm" });
    assert.equal(confirmTurn.completed, false);
    assert.equal(confirmTurn.state.step, "review_plan");
    assert.ok(!confirmTurn.messages.some((m) => /enregistré/i.test(m.content)));
  });

  it("appel direct de confirm sur un state.result invalide construit à la main : refusé également (garde côté Capacité, pas seulement côté flux)", async () => {
    const { assistant, turn } = await reachVentilation(0.15);
    const tampered: F010State = {
      ...turn.state,
      result: { ...turn.state.result!, planValide: false },
    };
    const confirmTurn = await assistant.handle(tampered, { type: "confirm" });
    assert.equal(confirmTurn.completed, false);
    assert.equal(confirmTurn.state.step, "review_plan");
  });

  it("plan nominal valide : confirm complète normalement (non-régression)", async () => {
    const { assistant, turn } = await reachVentilation(0.15);
    assert.equal(turn.state.result!.planValide, true);
    const confirmTurn = await assistant.handle(turn.state, { type: "confirm" });
    assert.equal(confirmTurn.completed, true);
    assert.equal(confirmTurn.state.step, "complete");
  });
});

describe("F-010 — P2-1 : une adresse déjà connue n'est jamais effacée par un resubmit de submit_bien", () => {
  async function reachCollectBienWithConfirmedAdresse(assistant: F010LogementAssistant) {
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "acte" });
    turn = await assistant.handle(turn.state, {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: {
        prixAcquisition: 280000,
        typeBien: "appartement",
        dateAcquisition: "2024-03-01",
        surface: 45,
        adresse: "12 rue des Lilas, 75011 Paris",
      },
    });
    for (const field of ["prixAcquisition", "typeBien", "dateAcquisition", "surface", "adresse"] as const) {
      turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field });
    }
    assert.equal(turn.state.adresse, "12 rue des Lilas, 75011 Paris");
    // Revenir jusqu'à collect_bien : review_extraction -> collect_bien (2 go_back
    // depuis collect_frais, où leaveReviewIfComplete a atterri une fois la review close).
    assert.equal(turn.state.step, "collect_frais");
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_bien");
    assert.equal(turn.state.adresse, "12 rue des Lilas, 75011 Paris");
    return turn;
  }

  it("adresse confirmée via document, puis resubmit de collect_bien sans adresse (formulaire manuel réel) : adresse conservée", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const atCollectBien = await reachCollectBienWithConfirmedAdresse(assistant);

    // Reproduit exactement le dispatch du formulaire manuel (panel.tsx) : jamais `adresse`.
    const resubmitted = await assistant.handle(atCollectBien.state, {
      type: "submit_bien",
      prixAcquisition: 285000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
      surface: 45,
      fieldSources: { prixAcquisition: "manual", typeBien: "manual", dateAcquisition: "manual", surface: "manual" },
    });

    assert.equal(resubmitted.state.adresse, "12 rue des Lilas, 75011 Paris");
    assert.equal(resubmitted.state.prixAcquisition, 285000, "le champ réellement resoumis change bien");
  });

  it("adresse corrigée (pas seulement confirmée) via document, puis même cycle : adresse corrigée conservée", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "acte" });
    turn = await assistant.handle(turn.state, {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: {
        prixAcquisition: 280000,
        typeBien: "appartement",
        dateAcquisition: "2024-03-01",
        surface: 45,
        adresse: "12 rue des Lilas, 75011 Paris",
      },
    });
    for (const field of ["prixAcquisition", "typeBien", "dateAcquisition", "surface"] as const) {
      turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field });
    }
    turn = await assistant.handle(turn.state, {
      type: "correct_extracted_field",
      field: "adresse",
      value: "3 avenue de la République, 75011 Paris",
    });
    assert.equal(turn.state.adresse, "3 avenue de la République, 75011 Paris");

    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_bien");

    const resubmitted = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
      surface: 45,
      fieldSources: { prixAcquisition: "manual", typeBien: "manual", dateAcquisition: "manual", surface: "manual" },
    });
    assert.equal(resubmitted.state.adresse, "3 avenue de la République, 75011 Paris");
  });

  it("survit à un cycle persistence/reload complet : adresse toujours présente après resume()", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const atCollectBien = await reachCollectBienWithConfirmedAdresse(assistant);
    const resubmitted = await assistant.handle(atCollectBien.state, {
      type: "submit_bien",
      prixAcquisition: 285000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
      surface: 45,
      fieldSources: { prixAcquisition: "manual", typeBien: "manual", dateAcquisition: "manual", surface: "manual" },
    });

    const persisted = toF010PersistedState(resubmitted.state, "2026-09-13T10:00:00.000Z");
    assert.equal(persisted.adresse, "12 rue des Lilas, 75011 Paris");

    const resumed = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" }).resume(persisted);
    assert.equal(resumed.state.adresse, "12 rue des Lilas, 75011 Paris");
  });

  it("submit_bien avec une adresse explicite écrase bien l'ancienne (jamais un blocage permanent)", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const atCollectBien = await reachCollectBienWithConfirmedAdresse(assistant);
    const resubmitted = await assistant.handle(atCollectBien.state, {
      type: "submit_bien",
      prixAcquisition: 285000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
      surface: 45,
      adresse: "9 boulevard Voltaire, 75011 Paris",
      fieldSources: { prixAcquisition: "manual", typeBien: "manual", dateAcquisition: "manual", surface: "manual" },
    });
    assert.equal(resubmitted.state.adresse, "9 boulevard Voltaire, 75011 Paris");
  });
});
