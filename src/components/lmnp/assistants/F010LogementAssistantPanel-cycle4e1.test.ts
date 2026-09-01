/**
 * Cycle 4E1 (F010) — correctif de la désynchronisation formulaire local /
 * F010State après une sortie automatique de review_extraction. Runtime et
 * F010State inchangés : `shouldSyncF010LocalForms`/`computeF010LocalFormSync`
 * sont des fonctions pures, testées directement (convention du projet, pas
 * de RTL), combinées au runtime réel pour produire des F010State réalistes.
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F010LogementAssistantPanel-cycle4e1.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F010LogementAssistant } from "@/runtime";
import type { F010State } from "@/runtime";
import { computeF010LocalFormSync, shouldSyncF010LocalForms } from "./F010LogementAssistantPanel";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

function collectBienState(overrides: Partial<F010State> = {}): F010State {
  return { step: "collect_bien", acquisitionSource: "acte", fieldSources: {}, ...overrides };
}

describe("Cycle 4E1 — 1. review → collect_bien avec prix déjà connu", () => {
  it("le champ prix est correctement rempli à l'atterrissage", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000 },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    assert.equal(turn.state.step, "collect_bien"); // typeBien encore manquant → saut auto vers collect_bien
    assert.equal(shouldSyncF010LocalForms("review_extraction", turn.state.step), true);
    assert.equal(computeF010LocalFormSync(turn.state).prix, "280000");
  });
});

describe("Cycle 4E1 — 2. review → collect_bien avec date déjà connue", () => {
  it("le champ date est correctement rempli à l'atterrissage", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { dateAcquisition: "2023-05-12" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "dateAcquisition" });
    assert.equal(turn.state.step, "collect_bien");
    assert.equal(computeF010LocalFormSync(turn.state).dateAcq, "2023-05-12");
  });
});

describe("Cycle 4E1 — 3. review → collect_frais avec données déjà connues", () => {
  it("le formulaire collect_frais est correctement rempli à l'atterrissage", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(
      collectBienState({ prixAcquisition: 280000, typeBien: "appartement", dateAcquisition: "2024-03-01" }),
      { type: "analysis_success", documentId: "doc-1", proposal: { fraisNotaire: 19500 } },
    );
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "fraisNotaire" });
    assert.equal(turn.state.step, "collect_frais");
    assert.equal(shouldSyncF010LocalForms("review_extraction", turn.state.step), true);
    const values = computeF010LocalFormSync(turn.state);
    assert.equal(values.frais, "19500");
  });
});

describe("Cycle 4E1 — 4. review → collect_mobilier avec valeur 0", () => {
  it("la valeur 0 est conservée, jamais traitée comme absente", () => {
    const state = collectBienState({
      step: "collect_mobilier",
      prixAcquisition: 280000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
      montantMobilier: 0,
    });
    assert.equal(shouldSyncF010LocalForms("collect_frais", state.step), true);
    assert.equal(computeF010LocalFormSync(state).mobilier, "0");
  });
});

describe("Cycle 4E1 — 5. review → ventilation avec ratio déjà connu", () => {
  it("le ratio déjà connu est conservé", () => {
    const state = collectBienState({ step: "ventilation", ratioTerrain: 0.15 });
    assert.equal(shouldSyncF010LocalForms("collect_mobilier", state.step), true);
    assert.equal(computeF010LocalFormSync(state).ratio, "15");
  });
});

describe("Cycle 4E1 — 6. document partiel → seules les vraies données manquantes restent à saisir", () => {
  it("prixAcquisition (connu) est pré-rempli, typeBien (inconnu) reste vide", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000 }, // typeBien absent du document
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    assert.equal(turn.state.step, "collect_bien"); // saut auto : typeBien manquant
    const values = computeF010LocalFormSync(turn.state);
    assert.equal(values.prix, "280000", "déjà connu → pré-rempli");
    assert.equal(values.typeBien, undefined, "vraiment manquant → reste à saisir, jamais forcé");
  });
});

describe("Cycle 4E1 — 7. document + données manuelles existantes → aucune re-saisie inutile", () => {
  it("une valeur déjà confirmée manuellement reste pré-remplie après un atterrissage automatique", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const manualState = collectBienState({
      prixAcquisition: 280000,
      fieldSources: { prixAcquisition: "manual" },
      confirmed: { prixAcquisition: true },
    });
    let turn = await assistant.handle(manualState, {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { typeBien: "appartement" }, // le document complète un autre champ
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "typeBien" });
    assert.equal(turn.state.step, "collect_bien"); // dateAcquisition encore manquant
    const values = computeF010LocalFormSync(turn.state);
    assert.equal(values.prix, "280000", "la saisie manuelle n'est jamais redemandée");
    assert.equal(values.typeBien, "appartement", "la confirmation du document est bien reflétée");
  });
});

describe("Cycle 4E1 — 8. GO_BACK → comportement existant inchangé", () => {
  it("un GO_BACK vers un écran à formulaire déclenche toujours la resynchronisation", () => {
    assert.equal(shouldSyncF010LocalForms("review_plan", "ventilation"), true);
    assert.equal(shouldSyncF010LocalForms("collect_frais", "collect_bien"), true);
  });

  it("un GO_BACK vers un écran sans formulaire local ne déclenche rien (sans effet observable, comme avant)", () => {
    assert.equal(shouldSyncF010LocalForms("collect_bien", "acquisition_source"), false);
  });

  it("rester sur le même écran ne redéclenche jamais la resynchronisation", () => {
    assert.equal(shouldSyncF010LocalForms("collect_bien", "collect_bien"), false);
  });
});

describe("Cycle 4E1 — 9. refresh → comportement inchangé", () => {
  it("resume() puis computeF010LocalFormSync donne le même résultat qu'un calcul direct sur l'état d'avant refresh", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000 },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });

    const resumed = assistant.resume({
      step: turn.state.step,
      prixAcquisition: turn.state.prixAcquisition,
      fieldSources: turn.state.fieldSources,
      confirmed: turn.state.confirmed,
      review: turn.state.review,
      updatedAt: "2026-08-27T10:00:00.000Z",
    });
    assert.deepEqual(computeF010LocalFormSync(resumed.state), computeF010LocalFormSync(turn.state));
  });
});

describe("Cycle 4E1 — 10. aucun changement dans F010State ou dans les règles métier", () => {
  it("computeF010LocalFormSync et shouldSyncF010LocalForms sont purs, ne mutent jamais l'état reçu", () => {
    const state = collectBienState({ prixAcquisition: 280000, montantMobilier: 0, ratioTerrain: 0.15 });
    const before = JSON.parse(JSON.stringify(state));
    computeF010LocalFormSync(state);
    shouldSyncF010LocalForms("review_extraction", state.step);
    assert.deepEqual(state, before);
  });

  it("le calcul du plan (computePlan, moteur existant) reste identique — non affecté par ce correctif UI", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "manuel" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 21000,
      choixTraitementFrais: "integration",
    });
    turn = await assistant.handle(turn.state, { type: "skip_mobilier" });
    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.15 });
    assert.equal(turn.state.step, "review_plan");
    assert.equal(turn.state.result?.dotationAnnuelle !== undefined, true);
  });
});
