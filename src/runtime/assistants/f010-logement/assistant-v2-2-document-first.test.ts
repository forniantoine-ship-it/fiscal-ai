/**
 * F010 V2-2 — Document-first + écran unique : suppression de la question
 * bloquante "avez-vous votre acte ?" (`acquisition_source`) du parcours
 * normal. `select_nature("achat")` mène désormais directement à
 * `collect_bien`, qui porte à la fois l'upload (recommandé, jamais
 * obligatoire) et la saisie manuelle. Le type/step `acquisition_source`
 * n'est pas supprimé (compatibilité des anciens dossiers) — seulement
 * retiré du chemin actif et normalisé au `resume()`/`go_back`.
 *
 * Run: npx tsx --test src/runtime/assistants/f010-logement/assistant-v2-2-document-first.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F010LogementAssistant } from "./assistant";
import { toF010PersistedState } from "./types";
import type { F010PersistedState } from "./types";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

describe("F-010 V2-2 — CAS A : nouveau dossier achat ne passe jamais par acquisition_source", () => {
  it("select_nature('achat') mène directement à collect_bien", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    assert.equal(start.state.step, "orientation");
    const turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    assert.equal(turn.state.step, "collect_bien");
    assert.notEqual(turn.state.step, "acquisition_source" as string);
  });

  it("les natures hors Chemin A restent inchangées (coming_soon, non touché par V2-2)", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    const turn = await assistant.handle(start.state, { type: "select_nature", nature: "vefa" });
    assert.equal(turn.state.step, "coming_soon");
  });
});

describe("F-010 V2-2 — CAS B : collect_bien permet de progresser sans aucun document", () => {
  it("submit_bien directement depuis collect_bien (aucun upload, aucune étape intermédiaire) avance normalement", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    assert.equal(turn.state.step, "collect_bien");

    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 250_000,
      typeBien: "maison",
      dateAcquisition: "2024-02-01",
    });
    assert.equal(turn.state.step, "collect_frais");
    assert.equal(turn.state.prixAcquisition, 250_000);
  });
});

describe("F-010 V2-2 — CAS C : collect_bien + document fonctionne toujours (pipeline/review_extraction préservés)", () => {
  it("analysis_success depuis collect_bien (sans passer par une étape source) route vers review_extraction comme avant", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    assert.equal(turn.state.step, "collect_bien");

    turn = await assistant.handle(turn.state, {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: {
        prixAcquisition: 300_000,
        typeBien: "appartement",
        dateAcquisition: "2024-05-01",
        surface: 60,
        fraisNotaire: 21_000,
        adresse: "5 rue des Fleurs, 75012 Paris",
      },
    });
    assert.equal(turn.state.step, "review_extraction");
    assert.equal(turn.state.review?.fields.prixAcquisition.proposedValue, "300000");
  });
});

describe("F-010 V2-2 — CAS D : ancien F010PersistedState step='acquisition_source' → resume() vers collect_bien, données préservées", () => {
  it("un dossier légataire jamais avancé au-delà d'acquisition_source reprend directement sur collect_bien", () => {
    const persisted: F010PersistedState = {
      step: "acquisition_source",
      fieldSources: {},
      updatedAt: "2025-01-01T00:00:00.000Z",
      nature: "achat",
      acquisitionSource: "acte",
      history: ["orientation"],
    };
    const assistant = new F010LogementAssistant(ctx);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "collect_bien");
    // Rien n'est inventé ni perdu : les données déjà connues restent telles quelles.
    assert.equal(resumed.state.nature, "achat");
    assert.equal(resumed.state.acquisitionSource, "acte");
    assert.deepEqual(resumed.state.history, ["orientation"]);
  });

  it("un dossier légataire acquisition_source AVEC des réponses déjà saisies plus loin ne perd rien au resume", () => {
    // Cas réaliste : un ancien dossier a pu enregistrer des champs de collect_bien
    // avant d'être interrompu exactement sur acquisition_source (ordre d'écran
    // historique différent) — la normalisation ne doit jamais les effacer.
    const persisted: F010PersistedState = {
      step: "acquisition_source",
      fieldSources: { prixAcquisition: "manual" },
      updatedAt: "2025-01-01T00:00:00.000Z",
      nature: "achat",
      prixAcquisition: 180_000,
      history: ["orientation"],
    };
    const assistant = new F010LogementAssistant(ctx);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "collect_bien");
    assert.equal(resumed.state.prixAcquisition, 180_000);
  });
});

describe("F-010 V2-2 — CAS E : go_back ne ressuscite jamais acquisition_source, même si l'historique legacy le contient", () => {
  it("go_back depuis un step dont l'historique contient acquisition_source saute directement par-dessus vers orientation", async () => {
    const assistant = new F010LogementAssistant(ctx);
    // Historique légataire construit à la main : représente un dossier ancien
    // qui avait progressé au-delà d'acquisition_source AVANT ce chantier.
    const legacyState = {
      step: "collect_bien" as const,
      fieldSources: {},
      nature: "achat" as const,
      history: ["orientation" as const, "acquisition_source" as const],
    };
    const turn = await assistant.handle(legacyState, { type: "go_back" });
    assert.equal(turn.state.step, "orientation");
    assert.notEqual(turn.state.step, "acquisition_source" as string);
    assert.deepEqual(turn.state.history, []);
  });

  it("go_back depuis un step plus profond avec acquisition_source enfoui dans l'historique passe directement dessus", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const legacyState = {
      step: "collect_frais" as const,
      fieldSources: {},
      nature: "achat" as const,
      prixAcquisition: 200_000,
      history: ["orientation" as const, "acquisition_source" as const, "collect_bien" as const],
    };
    const turn = await assistant.handle(legacyState, { type: "go_back" });
    assert.equal(turn.state.step, "collect_bien", "le go_back normal (collect_bien juste avant) reste inchangé");
    assert.deepEqual(turn.state.history, ["orientation", "acquisition_source"]);

    // Un second go_back doit alors sauter acquisition_source.
    const secondBack = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(secondBack.state.step, "orientation");
    assert.deepEqual(secondBack.state.history, []);
  });
});

describe("F-010 V2-2 — CAS F : reload sur collect_bien", () => {
  it("resume() sur un F010PersistedState collect_bien restaure exactement l'étape et les données", () => {
    const persisted: F010PersistedState = {
      step: "collect_bien",
      fieldSources: { prixAcquisition: "manual" },
      updatedAt: "2026-01-01T00:00:00.000Z",
      nature: "achat",
      prixAcquisition: 220_000,
      typeBien: "appartement",
      history: ["orientation"],
    };
    const assistant = new F010LogementAssistant(ctx);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "collect_bien");
    assert.equal(resumed.state.prixAcquisition, 220_000);
    assert.equal(resumed.state.typeBien, "appartement");
  });
});

describe("F-010 V2-2 — CAS G : reload sur review_extraction", () => {
  it("resume() sur un F010PersistedState review_extraction restaure la review en cours à l'identique", () => {
    const persisted: F010PersistedState = {
      step: "review_extraction",
      fieldSources: {},
      updatedAt: "2026-01-01T00:00:00.000Z",
      nature: "achat",
      review: {
        documentId: "doc-1",
        fields: {
          prixAcquisition: { proposedValue: "300000", source: "extracted", status: "pending" },
          dateAcquisition: { proposedValue: "2024-05-01", source: "extracted", status: "pending" },
          typeBien: { proposedValue: "appartement", source: "extracted", status: "pending" },
          surface: { proposedValue: "60", source: "extracted", status: "pending" },
          fraisNotaire: { proposedValue: "21000", source: "extracted", status: "pending" },
          adresse: { proposedValue: undefined, source: "extracted", status: "unavailable" },
        },
      },
      history: ["orientation", "collect_bien"],
    };
    const assistant = new F010LogementAssistant(ctx);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "review_extraction");
    assert.equal(resumed.state.review?.fields.prixAcquisition.status, "pending");
    assert.equal(resumed.state.review?.documentId, "doc-1");
  });
});

describe("F-010 V2-2 — CAS D/reprise complète : un dossier bloqué en acquisition_source peut ensuite aller jusqu'au bout normalement", () => {
  it("resume(acquisition_source) -> collect_bien -> parcours normal complet inchangé", async () => {
    const persisted: F010PersistedState = {
      step: "acquisition_source",
      fieldSources: {},
      updatedAt: "2025-01-01T00:00:00.000Z",
      nature: "achat",
      history: ["orientation"],
    };
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    let turn = assistant.resume(persisted);
    assert.equal(turn.state.step, "collect_bien");

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
    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.15 });
    assert.equal(turn.state.step, "review_plan");
    assert.ok(turn.state.result);
    assert.equal(turn.state.result!.planValide, true);
  });
});

describe("F-010 V2-2 — persistence : aucun transcript, contrat F010PersistedState inchangé", () => {
  it("toF010PersistedState d'un dossier passé par le nouveau flow direct ne contient toujours aucun champ messages/result", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    const turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    const persisted = toF010PersistedState(turn.state, "2026-01-01T00:00:00.000Z");
    assert.equal("messages" in persisted, false);
    assert.equal("result" in persisted, false);
    assert.equal(persisted.step, "collect_bien");
  });
});
