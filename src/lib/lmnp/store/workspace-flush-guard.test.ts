/**
 * Cycle 24 — logout/relogin ne doit pas écraser un dossier généré.
 * Run: npx tsx --test src/lib/lmnp/store/workspace-flush-guard.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isRegressiveWorkspaceWrite,
  isStaleFiscalYearIdentityWrite,
  resolveFlushSnapshot,
  type IdentityWorkspaceSnapshot,
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

// ---------------------------------------------------------------------------
// P0 FINAL GATE (workspace debounce vs clôture N → N+1) — §8 du gate :
// faux positifs du guard.
// ---------------------------------------------------------------------------
describe("isStaleFiscalYearIdentityWrite — §8 faux positifs du P0 FINAL GATE", () => {
  function identity(id: string, previousFiscalYearId?: string | null): IdentityWorkspaceSnapshot {
    return { fiscalYear: { id, previousFiscalYearId } };
  }

  it("existing = N+1, incoming = N → REFUSÉ (cas P0 exact)", () => {
    const nPlus1 = identity("fy-N+1", "fy-N");
    const n = identity("fy-N");
    assert.equal(isStaleFiscalYearIdentityWrite(n, nPlus1), true);
  });

  it("existing = N, incoming = N (sauvegarde ordinaire du même exercice) → ACCEPTÉ", () => {
    const n = identity("fy-N", "fy-N-1");
    assert.equal(isStaleFiscalYearIdentityWrite(n, n), false);
  });

  it("existing = N, incoming = N+1 (écriture de la transition elle-même) → ACCEPTÉ", () => {
    const n = identity("fy-N", "fy-N-1");
    const nPlus1 = identity("fy-N+1", "fy-N");
    assert.equal(isStaleFiscalYearIdentityWrite(nPlus1, n), false);
  });

  it("existing = exercice historique X, incoming = nouvel exercice sans lien (CREATE_NEW_DECLARATION) → ACCEPTÉ", () => {
    const x = identity("fy-X", undefined);
    const freshDeclaration = identity("fy-fresh", undefined);
    assert.equal(isStaleFiscalYearIdentityWrite(freshDeclaration, x), false);
  });

  it("aucun snapshot disque → toujours accepté (premier write)", () => {
    assert.equal(isStaleFiscalYearIdentityWrite(identity("fy-N"), null), false);
  });
});
