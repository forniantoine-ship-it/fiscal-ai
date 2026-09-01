/**
 * Cycle 22 — un F-009 confirmé démarre réellement le parcours dashboard.
 * Run: npx tsx --test src/lib/lmnp/engine/document-journey-started.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isDocumentJourneyStarted } from "./document-journey-progress";
import type { PersistedWorkspace } from "../store/persistence";

function emptyWorkspace(draft: PersistedWorkspace["declarationDraft"]): PersistedWorkspace {
  return {
    fiscalYear: {
      id: "fy-1",
      year: 2026,
      status: "draft",
      regime: "reel",
      propertyIds: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    properties: [],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: draft,
  };
}

describe("Cycle 22 — isDocumentJourneyStarted", () => {
  it("dossier vide → non commencé", () => {
    assert.equal(isDocumentJourneyStarted(emptyWorkspace({ completedSteps: [] })), false);
  });

  it("inpiConfirmedAt seul (F-009 confirmé sans document) → commencé", () => {
    assert.equal(
      isDocumentJourneyStarted(
        emptyWorkspace({ completedSteps: [], inpiConfirmedAt: "2026-08-30T00:00:00.000Z" }),
      ),
      true,
    );
  });
});
