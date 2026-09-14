/**
 * F010 V2-3 — Minimum Questions + User Decisions.
 *
 * Corrige la redondance démontrée du chemin séquentiel manuel
 * (`submit_bien` → `submit_frais` → `submit_mobilier`/`skip_mobilier` →
 * `submit_ventilation`) : avant ce chantier, chaque handler avançait
 * inconditionnellement à l'écran suivant fixe, même quand les champs de cet
 * écran étaient déjà connus (ex. retour arrière puis re-soumission d'un champ
 * antérieur, mobilier/ratio déjà répondus restant inchangés). `advanceToNextStep`
 * (assistant.ts) généralise désormais, pour ce chemin, le même mécanisme
 * "champ manquant réel → écran suivant" déjà utilisé par `leaveReviewIfComplete`
 * pour le chemin documentaire (`nextMissingF010Field`/`F010_MISSING_FIELD_ORDER`,
 * 7 champs).
 *
 * Tests A→J (spécification du chantier).
 * Run: npx tsx --test src/runtime/assistants/f010-logement/assistant-v2-3-minimum-questions.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F010LogementAssistant } from "./assistant";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

function lastMessage(messages: { role: string; content: string }[]) {
  return messages[messages.length - 1]!;
}

async function reachReviewPlan(assistant: F010LogementAssistant) {
  let turn = assistant.start();
  turn = await assistant.handle(turn.state, { type: "select_nature", nature: "achat" });
  turn = await assistant.handle(turn.state, {
    type: "submit_bien",
    prixAcquisition: 200_000,
    typeBien: "appartement",
    dateAcquisition: "2024-03-01",
  });
  turn = await assistant.handle(turn.state, {
    type: "submit_frais",
    fraisNotaire: 15_000,
    choixTraitementFrais: "integration",
  });
  turn = await assistant.handle(turn.state, {
    type: "submit_mobilier",
    montantMobilier: 5_000,
    mode: "lot",
  });
  turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.2 });
  return turn;
}

describe("F-010 V2-3 — A : frais déjà connu (montant) → pas de redemande après re-soumission d'un champ antérieur", () => {
  it("go_back jusqu'à collect_bien puis re-soumission de submit_bien laisse fraisNotaire/choixTraitementFrais inchangés, sans redemande", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    let turn = await reachReviewPlan(assistant);
    assert.equal(turn.state.step, "review_plan");

    // review_plan -> ventilation -> collect_mobilier -> collect_frais -> collect_bien
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_bien");
    assert.equal(turn.state.fraisNotaire, 15_000, "frais toujours connu, non effacé par les go_back");

    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 210_000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
    });

    // Le montant des frais est déjà connu et n'a pas changé : jamais redemandé.
    assert.notEqual(turn.state.step, "collect_frais");
    assert.equal(turn.state.fraisNotaire, 15_000);
  });
});

describe("F-010 V2-3 — B : traitement des frais → toujours une décision explicite, jamais déduite silencieusement", () => {
  it("submit_frais exige explicitement choixTraitementFrais à chaque soumission — aucune valeur par défaut implicite", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 200_000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 15_000,
      choixTraitementFrais: "deduction",
    });
    assert.equal(turn.state.choixTraitementFrais, "deduction");
    assert.equal(turn.state.fieldSources?.choixTraitementFrais, "judgment", "la décision reste tracée comme un jugement utilisateur, jamais 'manual'/'extracted'");
  });

  it("le montant des frais reste corrigible avant que la décision de traitement ne soit reconfirmée (go_back + re-soumission)", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    let turn = await reachReviewPlan(assistant);
    // review_plan -> ventilation -> collect_mobilier -> collect_frais
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_frais");

    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 18_000,
      choixTraitementFrais: "deduction",
    });
    assert.equal(turn.state.fraisNotaire, 18_000);
    assert.equal(turn.state.choixTraitementFrais, "deduction");
  });
});

describe("F-010 V2-3 — C : mobilier déjà connu → pas de redemande inutile", () => {
  it("go_back jusqu'à collect_frais puis re-soumission de submit_frais saute directement collect_mobilier (montantMobilier déjà connu et inchangé)", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    let turn = await reachReviewPlan(assistant);
    assert.equal(turn.state.step, "review_plan");
    assert.equal(turn.state.montantMobilier, 5_000);
    assert.equal(turn.state.ratioTerrain, 0.2);

    // review_plan -> ventilation -> collect_mobilier -> collect_frais
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_frais");

    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 18_000,
      choixTraitementFrais: "integration",
    });

    // BUG V2-3 corrigé : mobilier/ratio déjà connus → on atterrit directement
    // sur review_plan (recalculé avec les nouveaux frais), jamais sur
    // collect_mobilier ni ventilation.
    assert.equal(turn.state.step, "review_plan");
    assert.equal(turn.state.montantMobilier, 5_000, "mobilier inchangé, jamais réinitialisé");
    assert.equal(turn.state.ratioTerrain, 0.2, "ratio terrain inchangé, jamais réinitialisé");
    assert.ok(turn.state.result, "le plan est recalculé avec les nouveaux frais");
  });
});

describe("F-010 V2-3 — D : mobilier absent → flux correct (question posée une seule fois, utile)", () => {
  it("submit_frais mène normalement à collect_mobilier quand rien n'est encore connu", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 200_000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 15_000,
      choixTraitementFrais: "integration",
    });
    assert.equal(turn.state.step, "collect_mobilier");
    assert.equal(
      lastMessage(turn.messages).content,
      "Le prix inclut-il du mobilier (cuisine équipée, meubles) ? Si oui, indiquez son montant estimé ; sinon, passez cette étape.",
    );
  });

  it("skip_mobilier fixe montantMobilier=0/mobilierInclus=false puis avance normalement (aucune redemande ultérieure du mobilier)", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 200_000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 15_000,
      choixTraitementFrais: "integration",
    });
    turn = await assistant.handle(turn.state, { type: "skip_mobilier" });
    assert.equal(turn.state.mobilierInclus, false);
    assert.equal(turn.state.montantMobilier, 0);
    assert.equal(turn.state.step, "ventilation");
  });
});

describe("F-010 V2-3 — E : ratio terrain déjà connu → pas de question de suggestion inutile", () => {
  it("go_back jusqu'à collect_mobilier puis re-soumission de submit_mobilier saute directement ventilation (ratioTerrain déjà connu et inchangé)", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    let turn = await reachReviewPlan(assistant);
    assert.equal(turn.state.ratioTerrain, 0.2);

    // review_plan -> ventilation -> collect_mobilier
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_mobilier");

    turn = await assistant.handle(turn.state, {
      type: "submit_mobilier",
      montantMobilier: 6_000,
      mode: "lot",
    });

    // BUG V2-3 corrigé : ratioTerrain déjà connu → atterrit directement sur
    // review_plan (recalculé avec le nouveau mobilier), jamais sur ventilation.
    assert.equal(turn.state.step, "review_plan");
    assert.equal(turn.state.ratioTerrain, 0.2, "ratio inchangé, jamais réinitialisé ni redemandé");
    assert.equal(turn.state.montantMobilier, 6_000);
    assert.ok(turn.state.result);
  });
});

describe("F-010 V2-3 — F : ratio terrain absent → suggestion/correction toujours disponible", () => {
  it("submit_mobilier mène normalement à ventilation quand ratioTerrain n'est pas encore connu, avec le prompt contextualisé selon typeBien", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 200_000,
      typeBien: "maison",
      dateAcquisition: "2024-03-01",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 15_000,
      choixTraitementFrais: "integration",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_mobilier",
      montantMobilier: 5_000,
      mode: "lot",
    });
    assert.equal(turn.state.step, "ventilation");
    assert.ok(lastMessage(turn.messages).content.includes("maison"));
  });

  it("submit_ventilation permet toujours de corriger ratioTerrain (une décision utilisateur explicite, jamais figée)", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    let turn = await reachReviewPlan(assistant);
    assert.equal(turn.state.ratioTerrain, 0.2);

    turn = await assistant.handle(turn.state, { type: "go_back" }); // -> ventilation
    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.35 });
    assert.equal(turn.state.ratioTerrain, 0.35, "l'utilisateur peut toujours corriger la part de terrain");
    assert.equal(turn.state.step, "review_plan");
  });
});

describe("F-010 V2-3 — G : champ optionnel manquant (surface) → ne bloque jamais le calcul du plan", () => {
  it("un dossier sans surface atteint review_plan normalement (surface hors F010_MISSING_FIELD_ORDER, non requise par le moteur)", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const turn = await reachReviewPlan(assistant);
    assert.equal(turn.state.surface, undefined);
    assert.equal(turn.state.step, "review_plan");
    assert.ok(turn.state.result);
  });
});

describe("F-010 V2-3 — H : correction utilisateur jamais écrasée par le mécanisme de saut", () => {
  it("une correction de fraisNotaire (re-soumission) est bien celle utilisée pour le calcul, pas une valeur périmée", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    let turn = await reachReviewPlan(assistant);
    const prixRevientAvant = turn.state.result!.prixRevient;

    // review_plan -> ventilation -> collect_mobilier -> collect_frais
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 30_000,
      choixTraitementFrais: "integration",
    });

    assert.equal(turn.state.step, "review_plan");
    assert.equal(turn.state.fraisNotaire, 30_000);
    assert.notEqual(turn.state.result!.prixRevient, prixRevientAvant, "le plan est bien recalculé avec la correction, pas l'ancienne valeur");
  });
});

describe("F-010 V2-3 — I : reload mid-flow → reprise cohérente, aucune redemande de ce qui est déjà connu", () => {
  it("resume() sur un F010PersistedState collect_frais avec mobilier/ratio déjà connus (dossier avancé puis revenu en arrière avant snapshot) permet de resoumettre submit_frais sans redemande", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    let turn = await reachReviewPlan(assistant);
    // review_plan -> ventilation -> collect_mobilier -> collect_frais
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_frais");

    const resumed = assistant.resume({
      step: turn.state.step,
      nature: turn.state.nature,
      prixAcquisition: turn.state.prixAcquisition,
      typeBien: turn.state.typeBien,
      dateAcquisition: turn.state.dateAcquisition,
      montantMobilier: turn.state.montantMobilier,
      mobilierInclus: turn.state.mobilierInclus,
      mobilierMode: turn.state.mobilierMode,
      ratioTerrain: turn.state.ratioTerrain,
      fieldSources: turn.state.fieldSources ?? {},
      confirmed: turn.state.confirmed,
      history: turn.state.history,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(resumed.state.step, "collect_frais");

    const after = await assistant.handle(resumed.state, {
      type: "submit_frais",
      fraisNotaire: 21_000,
      choixTraitementFrais: "integration",
    });
    assert.equal(after.state.step, "review_plan", "mobilier/ratio déjà connus au reload : aucune redemande après reprise");
    assert.equal(after.state.montantMobilier, 5_000);
    assert.equal(after.state.ratioTerrain, 0.2);
  });
});

describe("F-010 V2-3 — J : dateMiseEnService absent → comportement de blocage inchangé", () => {
  it("un dossier complet sans dateMiseEnService atterrit sur blocked_missing_date, jamais un plan inventé", async () => {
    const assistant = new F010LogementAssistant(ctx); // pas de dateMiseEnService
    const turn = await reachReviewPlan(assistant);
    assert.equal(turn.state.step, "blocked_missing_date");
    assert.equal(turn.state.result, undefined);
  });

  it("resume() sur blocked_missing_date reste bloqué tant que dateMiseEnService manque toujours, sans perdre les données déjà saisies", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await reachReviewPlan(assistant);
    assert.equal(turn.state.step, "blocked_missing_date");

    const resumed = assistant.resume({
      step: "blocked_missing_date",
      nature: turn.state.nature,
      prixAcquisition: turn.state.prixAcquisition,
      typeBien: turn.state.typeBien,
      dateAcquisition: turn.state.dateAcquisition,
      fraisNotaire: turn.state.fraisNotaire,
      choixTraitementFrais: turn.state.choixTraitementFrais,
      montantMobilier: turn.state.montantMobilier,
      mobilierInclus: turn.state.mobilierInclus,
      ratioTerrain: turn.state.ratioTerrain,
      fieldSources: turn.state.fieldSources ?? {},
      history: turn.state.history,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(resumed.state.step, "blocked_missing_date");
    assert.equal(resumed.state.prixAcquisition, 200_000, "aucune donnée F010 déjà saisie n'est perdue");
  });
});
