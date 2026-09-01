/**
 * Cycle 4E5B1 — retrait du mécanisme legacy `pendingConflicts` du panel F010
 * (remplacé par `review_extraction`). Tests 1→6 (7→10 couverts par la suite
 * F010 complète, tsc, eslint et la régression, lancés séparément).
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F010LogementAssistantPanel-cycle4e5b1.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { F010LogementAssistant, toF010PersistedState } from "@/runtime";
import type { F010PersistedState, F010State } from "@/runtime";
import { computeF010ReviewVisibleEntries, isF010ReviewFieldConflict } from "./F010LogementAssistantPanel";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

const panelSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "F010LogementAssistantPanel.tsx"),
  "utf-8",
);

function collectBienState(overrides: Partial<F010State> = {}): F010State {
  return { step: "collect_bien", acquisitionSource: "acte", fieldSources: {}, ...overrides };
}

describe("Cycle 4E5B1 — 1. aucune référence runtime au vieux pendingConflicts dans le panel", () => {
  it("le mécanisme legacy (state, ref, handler, libellés, bloc JSX) a été entièrement retiré", () => {
    assert.doesNotMatch(panelSource, /useState[^\n]*pendingConflicts/);
    assert.doesNotMatch(panelSource, /pendingConflictsRef/);
    assert.doesNotMatch(panelSource, /resolveFieldConflict/);
    assert.doesNotMatch(panelSource, /F010_CONFLICT_FIELD_LABELS/);
    assert.doesNotMatch(panelSource, /setPendingConflicts/);
    // Seules des mentions documentaires en commentaire peuvent subsister — pas
    // de déclaration de state/type import.
    assert.doesNotMatch(panelSource, /type F010FieldConflict/);
  });
});

describe("Cycle 4E5B1 — 2. review_extraction conserve ses conflits modernes", () => {
  it("isF010ReviewFieldConflict et la review continuent de détecter un vrai conflit document, inchangés", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 250000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, {
      type: "analysis_success",
      documentId: "doc-2",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    const entry = turn.state.review!.fields.prixAcquisition;
    assert.equal(isF010ReviewFieldConflict(turn.state, "prixAcquisition", entry), true);
    const visible = computeF010ReviewVisibleEntries(turn.state.review);
    assert.ok(visible.some(([field]) => field === "prixAcquisition"));
  });
});

describe("Cycle 4E5B1 — 3. ancien declarationDraft contenant la clé supplémentaire reste lisible", () => {
  it("resume() ne plante pas sur un blob historique porteur d'un pendingConflicts non vide", async () => {
    const assistant = new F010LogementAssistant(ctx);
    // Simule un blob IndexedDB antérieur au Cycle 4C2 : une clé supplémentaire
    // que le code actuel ne lit plus jamais, construite via une variable
    // (pas un littéral direct) pour reproduire fidèlement un JSON déjà stocké.
    const legacyBlob: F010PersistedState = JSON.parse(
      JSON.stringify({
        step: "collect_frais",
        prixAcquisition: 280000,
        typeBien: "appartement",
        dateAcquisition: "2024-03-01",
        fieldSources: {},
        pendingConflicts: {
          prixAcquisition: { confirmedValue: "280000", newValue: "250000" },
        },
        updatedAt: "2020-01-01T00:00:00.000Z",
      }),
    );
    const turn = assistant.resume(legacyBlob);
    assert.equal(turn.state.step, "collect_frais");
    assert.equal(turn.state.prixAcquisition, 280000, "aucune donnée métier effacée");
    assert.equal(turn.state.typeBien, "appartement");
  });
});

describe("Cycle 4E5B1 — 4. session sans pendingConflicts fonctionne", () => {
  it("un resume() normal, sans jamais avoir connu ce champ, fonctionne à l'identique", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = assistant.resume({
      step: "collect_frais",
      prixAcquisition: 280000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
      fieldSources: {},
      updatedAt: "2026-08-27T10:00:00.000Z",
    });
    assert.equal(turn.state.step, "collect_frais");
    assert.equal(turn.state.prixAcquisition, 280000);
  });
});

describe("Cycle 4E5B1 — 5. session avec pendingConflicts historique ne crashe pas, quel que soit le step", () => {
  it("un blob legacy avec pendingConflicts non vide et step review_plan resume sans erreur", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const legacyBlob: F010PersistedState = JSON.parse(
      JSON.stringify({
        step: "review_plan",
        prixAcquisition: 280000,
        typeBien: "appartement",
        dateAcquisition: "2024-03-01",
        fraisNotaire: 21000,
        choixTraitementFrais: "integration",
        montantMobilier: 0,
        ratioTerrain: 0.15,
        fieldSources: {},
        pendingConflicts: { typeBien: { confirmedValue: "appartement", newValue: "maison" } },
        updatedAt: "2020-01-01T00:00:00.000Z",
      }),
    );
    const turn = assistant.resume(legacyBlob);
    assert.equal(turn.state.step, "review_plan");
    assert.ok(turn.state.result, "le plan continue d'être recalculé normalement");
  });
});

describe("Cycle 4E5B1 — 6. nouvelle session ne peut plus créer ce mécanisme", () => {
  it("toF010PersistedState ne sérialise jamais pendingConflicts", () => {
    const state = collectBienState({ prixAcquisition: 280000 });
    const persisted = toF010PersistedState(state, "2026-08-27T10:00:00.000Z", undefined, undefined);
    assert.equal("pendingConflicts" in persisted, false);
  });
});
