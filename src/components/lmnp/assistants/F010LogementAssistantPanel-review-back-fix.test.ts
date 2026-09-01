/**
 * Correctif — review_extraction sans bouton « Continuer » (Cycle 4E6A-A).
 * La progression est entièrement automatique via leaveReviewIfComplete ;
 * un bouton actif mais inerte est interdit. Tests 1→6.
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F010LogementAssistantPanel-review-back-fix.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { F010LogementAssistant } from "@/runtime";
import type { F010State } from "@/runtime";
import { computeF010ReviewComplete, computeF010ReviewVisibleEntries } from "./F010LogementAssistantPanel";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

const panelSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "F010LogementAssistantPanel.tsx"),
  "utf-8",
);

function collectBienState(overrides: Partial<F010State> = {}): F010State {
  return { step: "collect_bien", acquisitionSource: "acte", fieldSources: {}, ...overrides };
}

describe("0. vérification structurelle : aucun bouton Continuer sur review_extraction", () => {
  it("le bloc review_extraction ne rend plus de bouton Continuer", () => {
    const reviewBlock = panelSource.slice(
      panelSource.indexOf('step === "review_extraction"'),
      panelSource.indexOf('step === "collect_frais"'),
    );
    assert.doesNotMatch(reviewBlock, />Continuer</);
  });
});

describe("1. review fraîche → comportement actuel inchangé", () => {
  it("reviewComplete est faux tant que des champs restent pending — progression par confirmation", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    assert.equal(turn.state.step, "review_extraction");
    const visible = computeF010ReviewVisibleEntries(turn.state.review);
    assert.equal(computeF010ReviewComplete(visible), false);
  });
});

describe("2. review complète → passage normal inchangé", () => {
  it("le runtime quitte déjà review_extraction avant que reviewComplete puisse devenir vrai à l'écran", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "typeBien" });
    assert.notEqual(turn.state.step, "review_extraction");
  });
});

describe("3. review → GO_BACK → retour review → aucun bouton mort", () => {
  it("reviewComplete devient vrai sur la review revisitée — seul « Modifier le document » reste disponible", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "typeBien" });
    assert.equal(turn.state.step, "collect_bien");

    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.step, "review_extraction");
    const visible = computeF010ReviewVisibleEntries(back.state.review);
    assert.equal(computeF010ReviewComplete(visible), true);
    const reviewBlock = panelSource.slice(
      panelSource.indexOf('step === "review_extraction"'),
      panelSource.indexOf('step === "collect_frais"'),
    );
    assert.doesNotMatch(reviewBlock, />Continuer</);
  });
});

describe("4. review → GO_BACK → modifier document → comportement inchangé", () => {
  it("un second GO_BACK depuis la review revisitée revient sur collect_bien sans perte de données confirmées", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "typeBien" });
    let back = await assistant.handle(turn.state, { type: "go_back" });
    back = await assistant.handle(back.state, { type: "go_back" });
    assert.equal(back.state.step, "collect_bien");
    assert.equal(back.state.prixAcquisition, 280000);
    assert.equal(back.state.typeBien, "appartement");
    assert.equal(back.state.review?.documentId, "doc-1");
  });
});

describe("5. refresh de cette review → aucun bouton mort", () => {
  it("resume() sur l'état revisité produit le même reviewComplete=true", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "typeBien" });
    const back = await assistant.handle(turn.state, { type: "go_back" });

    const resumed = assistant.resume({
      step: back.state.step,
      review: back.state.review,
      confirmed: back.state.confirmed,
      fieldSources: back.state.fieldSources,
      prixAcquisition: back.state.prixAcquisition,
      typeBien: back.state.typeBien,
      updatedAt: "2026-08-27T10:00:00.000Z",
    });
    assert.equal(resumed.state.step, "review_extraction");
    const visible = computeF010ReviewVisibleEntries(resumed.state.review);
    assert.equal(computeF010ReviewComplete(visible), true);
  });
});

describe("6. aucune régression Cycle 0 → 4E4", () => {
  it("aucune donnée confirmée ni règle de fusion n'est altérée (purement JSX)", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "typeBien" });
    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.confirmed?.prixAcquisition, true);
    assert.equal(back.state.confirmed?.typeBien, true);
    assert.equal(back.state.fieldSources.prixAcquisition, "extracted");
  });
});
