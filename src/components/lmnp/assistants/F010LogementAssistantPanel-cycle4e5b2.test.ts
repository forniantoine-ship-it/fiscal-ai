/**
 * Cycle 4E5B2 — nettoyage final du mécanisme legacy `pendingConflicts`
 * (types, merge, sérialisation). Le conflit moderne `review_extraction` reste
 * inchangé.
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F010LogementAssistantPanel-cycle4e5b2.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { F010LogementAssistant, toF010PersistedState } from "@/runtime";
import type { F010PersistedState } from "@/runtime";
import * as f010DocumentPrefill from "@/lib/lmnp/services/f010/f010-document-prefill";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

const typesSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../runtime/assistants/f010-logement/types.ts"),
  "utf-8",
);

describe("Cycle 4E5B2 — 1. symboles legacy retirés des types et librairies", () => {
  it("F010FieldConflict n'existe plus dans types.ts", () => {
    assert.doesNotMatch(typesSource, /export type F010FieldConflict/);
    assert.doesNotMatch(typesSource, /pendingConflicts/);
  });

  it("mergeF010DocumentPrefill et resolveF010DocumentField ne sont plus exportés", () => {
    assert.equal("mergeF010DocumentPrefill" in f010DocumentPrefill, false);
    assert.equal("resolveF010DocumentField" in f010DocumentPrefill, false);
  });
});

describe("Cycle 4E5B2 — 2. compatibilité blobs IndexedDB historiques", () => {
  it("resume() ignore pendingConflicts présent dans un blob legacy", () => {
    const assistant = new F010LogementAssistant(ctx);
    const legacyBlob = JSON.parse(
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
    ) as F010PersistedState;
    const turn = assistant.resume(legacyBlob);
    assert.equal(turn.state.step, "collect_frais");
    assert.equal(turn.state.prixAcquisition, 280000);
  });
});

describe("Cycle 4E5B2 — 3. nouvelle sérialisation sans clé legacy", () => {
  it("toF010PersistedState ne produit jamais pendingConflicts", () => {
    const persisted = toF010PersistedState(
      { step: "collect_bien", fieldSources: {} },
      "2026-08-27T10:00:00.000Z",
    );
    assert.equal("pendingConflicts" in persisted, false);
  });
});
