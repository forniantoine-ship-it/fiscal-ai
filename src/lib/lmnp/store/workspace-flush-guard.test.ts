/**
 * Cycle 24 — logout/relogin ne doit pas écraser un dossier généré.
 * Run: npx tsx --test src/lib/lmnp/store/workspace-flush-guard.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isRegressiveWorkspaceWrite,
  resolveFlushSnapshot,
  type JourneyWorkspaceSnapshot,
} from "./workspace-flush-guard";

function snapshot(
  overrides: JourneyWorkspaceSnapshot["fiscalYear"] = {},
): JourneyWorkspaceSnapshot {
  return {
    fiscalYear: {
      ...overrides,
    },
  };
}

describe("resolveFlushSnapshot", () => {
  it("un flush explicite l'emporte sur un debounce périmé du même user", () => {
    const pendingData = snapshot();
    const explicit = snapshot({
      paidAt: "2026-08-30T21:50:58.009Z",
      declarationGeneratedAt: "2026-08-30T21:50:58.009Z",
    });

    const resolved = resolveFlushSnapshot(
      { userId: "user-a", data: pendingData },
      "user-a",
      explicit,
    );

    assert.equal(resolved?.userId, "user-a");
    assert.equal(
      resolved?.data.fiscalYear.declarationGeneratedAt,
      explicit.fiscalYear.declarationGeneratedAt,
    );
    assert.equal(resolved?.data.fiscalYear.paidAt, explicit.fiscalYear.paidAt);
  });

  it("sans snapshot explicite, le debounce en attente est flushé", () => {
    const pendingData = snapshot({ paidAt: "2026-08-30T21:00:00.000Z" });
    const resolved = resolveFlushSnapshot({ userId: "user-a", data: pendingData }, "user-a");
    assert.equal(resolved?.data.fiscalYear.paidAt, "2026-08-30T21:00:00.000Z");
  });
});

describe("isRegressiveWorkspaceWrite", () => {
  it("refuse d'effacer paidAt / declarationGeneratedAt déjà persistés", () => {
    const existing = snapshot({
      paidAt: "2026-08-30T21:50:58.009Z",
      declarationGeneratedAt: "2026-08-30T21:50:58.009Z",
    });

    assert.equal(isRegressiveWorkspaceWrite(snapshot(), existing), true);
  });

  it("autorise un write qui conserve la génération", () => {
    const existing = snapshot({
      paidAt: "2026-08-30T21:50:58.009Z",
      declarationGeneratedAt: "2026-08-30T21:50:58.009Z",
    });
    const incoming = snapshot({
      paidAt: existing.fiscalYear.paidAt,
      declarationGeneratedAt: existing.fiscalYear.declarationGeneratedAt,
    });

    assert.equal(isRegressiveWorkspaceWrite(incoming, existing), false);
  });

  it("autorise le premier write (pas de snapshot disque)", () => {
    assert.equal(isRegressiveWorkspaceWrite(snapshot(), null), false);
  });
});
