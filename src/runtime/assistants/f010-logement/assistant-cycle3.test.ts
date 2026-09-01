/**
 * Cycle 3 (F010) — GO_BACK, confirmation, dead-end, recalcul, abandon/reprise.
 * Run: npx tsx --test src/runtime/assistants/f010-logement/assistant-cycle3.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F010LogementAssistant } from "./assistant";
import type { F010State } from "./types";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

async function walkToReviewPlan(assistant: F010LogementAssistant): Promise<F010State> {
  const start = assistant.start();
  let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
  turn = await assistant.handle(turn.state, { type: "select_source", source: "acte" });
  turn = await assistant.handle(turn.state, {
    type: "submit_bien",
    prixAcquisition: 280000,
    typeBien: "appartement",
    natureBien: "ancien",
    dateAcquisition: "2024-03-01",
    fieldSources: { prixAcquisition: "extracted", typeBien: "extracted", dateAcquisition: "extracted" },
  });
  turn = await assistant.handle(turn.state, {
    type: "submit_frais",
    fraisNotaire: 19500,
    choixTraitementFrais: "integration",
  });
  turn = await assistant.handle(turn.state, { type: "skip_mobilier" });
  turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.15 });
  return turn.state;
}

describe("Cycle 3 — GO_BACK", () => {
  it("orientation : aucun GO_BACK possible (pile vide, reste sur place)", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    const turn = await assistant.handle(start.state, { type: "go_back" });
    assert.equal(turn.state.step, "orientation");
  });

  it("coming_soon → orientation", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "vefa" });
    assert.equal(turn.state.step, "coming_soon");
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "orientation");
  });

  it("acquisition_source → orientation", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    assert.equal(turn.state.step, "acquisition_source");
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "orientation");
  });

  it("collect_bien → acquisition_source", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "acte" });
    assert.equal(turn.state.step, "collect_bien");
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "acquisition_source");
  });

  it("collect_frais → collect_bien, données du bien conservées (pas de snapshot nécessaire)", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "acte" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      natureBien: "ancien",
      dateAcquisition: "2024-03-01",
    });
    assert.equal(turn.state.step, "collect_frais");
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_bien");
    // Un simple historique de steps suffit : rien n'a été effacé en avançant.
    assert.equal(turn.state.prixAcquisition, 280000);
    assert.equal(turn.state.typeBien, "appartement");
  });

  it("collect_mobilier → collect_frais", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "acte" });
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
    assert.equal(turn.state.step, "collect_mobilier");
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_frais");
    assert.equal(turn.state.fraisNotaire, 19500);
  });

  it("ventilation → collect_mobilier", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "acte" });
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
    assert.equal(turn.state.step, "ventilation");
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_mobilier");
  });

  it("review_plan → ventilation", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const reviewState = await walkToReviewPlan(assistant);
    assert.equal(reviewState.step, "review_plan");
    const turn = await assistant.handle(reviewState, { type: "go_back" });
    assert.equal(turn.state.step, "ventilation");
  });

  it("complete → review_plan (via l'historique réel, confirm() pousse aussi sur la pile)", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const reviewState = await walkToReviewPlan(assistant);
    const completeTurn = await assistant.handle(reviewState, { type: "confirm" });
    assert.equal(completeTurn.state.step, "complete");
    const backTurn = await assistant.handle(completeTurn.state, { type: "go_back" });
    assert.equal(backTurn.state.step, "review_plan");
    // Le plan est toujours là — go_back ne l'efface pas.
    assert.ok(backTurn.state.result);
  });

  it("complete avec pile vide (session reprise directement en COMPLETE) → review_plan quand même", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const state: F010State = { step: "complete", fieldSources: {} }; // pas d'historique
    const turn = await assistant.handle(state, { type: "go_back" });
    assert.equal(turn.state.step, "review_plan");
  });

  it("pile vide sur une étape autre que complete → no-op, reste sur place", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const state: F010State = { step: "collect_frais", fieldSources: {} }; // historique jamais construit
    const turn = await assistant.handle(state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_frais");
  });

  it("refresh avec historique : resume() restaure la pile, GO_BACK continue de fonctionner correctement", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "acte" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      natureBien: "ancien",
      dateAcquisition: "2024-03-01",
    });
    assert.equal(turn.state.step, "collect_frais");
    assert.deepEqual(turn.state.history, ["orientation", "acquisition_source", "collect_bien"]);

    // Simule un refresh : reprise depuis un F010PersistedState reconstruit à la main.
    const resumed = assistant.resume({
      step: turn.state.step,
      prixAcquisition: turn.state.prixAcquisition,
      typeBien: turn.state.typeBien,
      natureBien: turn.state.natureBien,
      dateAcquisition: turn.state.dateAcquisition,
      fieldSources: turn.state.fieldSources,
      history: turn.state.history,
      confirmed: turn.state.confirmed,
      updatedAt: "2026-08-27T10:00:00.000Z",
    });
    assert.equal(resumed.state.step, "collect_frais");

    const backTurn = await assistant.handle(resumed.state, { type: "go_back" });
    assert.equal(backTurn.state.step, "collect_bien");
    assert.deepEqual(backTurn.state.history, ["orientation", "acquisition_source"]);
  });
});

describe("Cycle 3 — CONFIRMATION", () => {
  it("chaque submit_* confirme les champs qu'il soumet", async () => {
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
    });
    assert.equal(turn.state.confirmed?.prixAcquisition, true);
    assert.equal(turn.state.confirmed?.typeBien, true);
    assert.equal(turn.state.confirmed?.dateAcquisition, true);
    assert.equal(turn.state.confirmed?.fraisNotaire, undefined);

    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
    });
    assert.equal(turn.state.confirmed?.fraisNotaire, true);
    assert.equal(turn.state.confirmed?.choixTraitementFrais, true);
    // Conservation des confirmations précédentes.
    assert.equal(turn.state.confirmed?.prixAcquisition, true);

    turn = await assistant.handle(turn.state, { type: "skip_mobilier" });
    assert.equal(turn.state.confirmed?.montantMobilier, true);
    assert.equal(turn.state.confirmed?.prixAcquisition, true);
    assert.equal(turn.state.confirmed?.fraisNotaire, true);

    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.15 });
    assert.equal(turn.state.confirmed?.ratioTerrain, true);
    assert.equal(turn.state.confirmed?.montantMobilier, true);
    assert.equal(turn.state.confirmed?.prixAcquisition, true);
  });

  it("submit_mobilier (montant réel) confirme aussi montantMobilier", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "acte" });
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
    turn = await assistant.handle(turn.state, { type: "submit_mobilier", montantMobilier: 8000, mode: "lot" });
    assert.equal(turn.state.confirmed?.montantMobilier, true);
    assert.equal(turn.state.montantMobilier, 8000);
  });
});

describe("Cycle 3 — DEAD-END submit_ventilation", () => {
  it("champs manquants (prixAcquisition/typeBien) → message précis + redirection vers collect_bien, jamais un message sans destination", async () => {
    const assistant = new F010LogementAssistant(ctx);
    // État construit à la main pour simuler une incohérence défensive — aucune
    // saisie manquante n'est atteignable via le flux normal aujourd'hui.
    const staged: F010State = {
      step: "ventilation",
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
      fieldSources: {},
    };
    const turn = await assistant.handle(staged, { type: "submit_ventilation", ratioTerrain: 0.15 });
    assert.equal(turn.state.step, "collect_bien");
    const lastMessage = turn.messages[turn.messages.length - 1]!.content;
    assert.ok(lastMessage.includes("prix d'achat"));
    assert.ok(lastMessage.includes("type de bien"));
    assert.ok(!/reprenons depuis le début/i.test(lastMessage), "l'ancien message générique sans destination ne doit plus apparaître");
  });

  it("champs manquants (fraisNotaire) → redirection vers collect_frais", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const staged: F010State = {
      step: "ventilation",
      prixAcquisition: 280000,
      typeBien: "appartement",
      fieldSources: {},
    };
    const turn = await assistant.handle(staged, { type: "submit_ventilation", ratioTerrain: 0.15 });
    assert.equal(turn.state.step, "collect_frais");
    const lastMessage = turn.messages[turn.messages.length - 1]!.content;
    assert.ok(lastMessage.includes("frais de notaire"));
  });

  it("tous les champs réunis → calcul normal, aucune redirection", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const reviewState = await walkToReviewPlan(assistant);
    assert.equal(reviewState.step, "review_plan");
    assert.ok(reviewState.result);
  });
});

describe("Cycle 3 — RECALCUL", () => {
  it("modifier le prix (via GO_BACK + resoumission) produit un plan différent, jamais périmé", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const reviewA = await walkToReviewPlan(assistant);
    const prixRevientA = reviewA.result!.prixRevient;

    // GO_BACK jusqu'à collect_bien (3 sauts : review_plan → ventilation → collect_mobilier → collect_frais → collect_bien).
    let turn = await assistant.handle(reviewA, { type: "go_back" }); // ventilation
    turn = await assistant.handle(turn.state, { type: "go_back" }); // collect_mobilier
    turn = await assistant.handle(turn.state, { type: "go_back" }); // collect_frais
    turn = await assistant.handle(turn.state, { type: "go_back" }); // collect_bien
    assert.equal(turn.state.step, "collect_bien");

    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 350000, // prix modifié
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
    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.15 });

    assert.equal(turn.state.step, "review_plan");
    assert.notEqual(turn.state.result!.prixRevient, prixRevientA);
    assert.equal(turn.state.result!.prixRevient, 369500);
  });

  it("modifier uniquement le type de bien recalcule le plan mais laisse prixRevient/valeurTerrain/valeurBati inchangés (table de dépendances)", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const reviewA = await walkToReviewPlan(assistant);

    let turn = await assistant.handle(reviewA, { type: "go_back" }); // ventilation
    turn = await assistant.handle(turn.state, { type: "go_back" }); // collect_mobilier
    turn = await assistant.handle(turn.state, { type: "go_back" }); // collect_frais
    turn = await assistant.handle(turn.state, { type: "go_back" }); // collect_bien

    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "maison", // type modifié, prix identique
      natureBien: "ancien",
      dateAcquisition: "2024-03-01",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
    });
    turn = await assistant.handle(turn.state, { type: "skip_mobilier" });
    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.15 });

    assert.equal(turn.state.result!.prixRevient, reviewA.result!.prixRevient);
    assert.equal(turn.state.result!.valeurTerrain, reviewA.result!.valeurTerrain);
    assert.equal(turn.state.result!.valeurBati, reviewA.result!.valeurBati);
    // La décomposition (durée/dotation) dépend du type — le plan lui-même diffère.
    assert.notDeepEqual(turn.state.result!.plan, reviewA.result!.plan);
  });
});

describe("Cycle 3 — ABANDON puis reprise", () => {
  it("modifier (GO_BACK) → quitter (snapshot F010PersistedState) → revenir (resume) → reprise exacte", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const reviewA = await walkToReviewPlan(assistant);
    const backTurn = await assistant.handle(reviewA, { type: "go_back" });
    assert.equal(backTurn.state.step, "ventilation");

    // "Quitter" = snapshot exact de ce que le panel persisterait (result exclu, cf. Cycle 2).
    const snapshot = {
      step: backTurn.state.step,
      prixAcquisition: backTurn.state.prixAcquisition,
      typeBien: backTurn.state.typeBien,
      natureBien: backTurn.state.natureBien,
      dateAcquisition: backTurn.state.dateAcquisition,
      fraisNotaire: backTurn.state.fraisNotaire,
      choixTraitementFrais: backTurn.state.choixTraitementFrais,
      mobilierInclus: backTurn.state.mobilierInclus,
      montantMobilier: backTurn.state.montantMobilier,
      mobilierMode: backTurn.state.mobilierMode,
      ratioTerrain: backTurn.state.ratioTerrain,
      fieldSources: backTurn.state.fieldSources,
      history: backTurn.state.history,
      confirmed: backTurn.state.confirmed,
      updatedAt: "2026-08-27T10:00:00.000Z",
    };

    // "Revenir" = nouvelle instance d'assistant (nouvel onglet), resume() depuis le snapshot.
    const freshAssistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const resumedTurn = freshAssistant.resume(snapshot);
    assert.equal(resumedTurn.state.step, "ventilation");
    assert.equal(resumedTurn.state.prixAcquisition, 280000);
    assert.equal(resumedTurn.state.confirmed?.prixAcquisition, true);

    // La reprise doit permettre de continuer normalement jusqu'à COMPLETE.
    const finalTurn = await freshAssistant.handle(resumedTurn.state, {
      type: "submit_ventilation",
      ratioTerrain: 0.15,
    });
    assert.equal(finalTurn.state.step, "review_plan");
    assert.ok(finalTurn.state.result);
  });
});
