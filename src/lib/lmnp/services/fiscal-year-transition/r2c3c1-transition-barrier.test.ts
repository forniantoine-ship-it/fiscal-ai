/**
 * R2C.3c1 — barrière multi-bien de la transition serveur : refus AVANT paiement/RPC, sur la foi du snapshot serveur
 * ET des payloads transmis. Mono / scoped mono : chemin historique (commit appelé).
 *
 * Run: npx tsx --test src/lib/lmnp/services/fiscal-year-transition/r2c3c1-transition-barrier.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TransitionCommitResult } from "./types";
import { createInMemoryFiscalYearTransitionStore } from "./in-memory-store";
import {
  createStoreBackedTransitionHandlerDeps,
  handleFiscalYearTransitionRequest,
  type TransitionHandlerDeps,
} from "./transition-handler";

const NOW = "2026-09-21T20:00:00.000Z";
const DOSSIER = "dossier-3c1";
const OWNER = "user-owner";
const prop = (id: string) => ({ id, label: id });
const workspace = (ids: string[], scoped: boolean) => ({
  fiscalYear: { id: "fy", year: 2025, propertyIds: ids },
  properties: ids.map(prop),
  documents: [], extractions: [], validationItems: [], ledgerEntries: [],
  declarationDraft: scoped ? { completedSteps: [], biens: Object.fromEntries(ids.map((id) => [id, { propertyId: id, completedSteps: [] }])) } : { completedSteps: [] },
});
const envelope = (ids: string[], scoped: boolean) => ({ schemaVersion: scoped ? 2 : 1, workspace: workspace(ids, scoped) });

function setup(sourceIds: string[], sourceScoped: boolean, requestPayload?: { closed: unknown; next: unknown }) {
  const store = createInMemoryFiscalYearTransitionStore({
    dossiers: [{ id: DOSSIER, userId: OWNER, activeFiscalYear: 2025 }],
    snapshots: [{
      dossierId: DOSSIER, fiscalYear: 2025, schemaVersion: sourceScoped ? 2 : 1, revision: 3,
      payload: envelope(sourceIds, sourceScoped), closedAt: null, successorFiscalYear: null, updatedAt: NOW,
    }],
  });
  const base = createStoreBackedTransitionHandlerDeps(store);
  const calls = { commit: 0, payment: 0 };
  const deps: TransitionHandlerDeps = {
    ...base,
    paymentStore: { getByDossierYear: async (...args) => { calls.payment += 1; return base.paymentStore.getByDossierYear(...args); } },
    commit: async () => {
      calls.commit += 1;
      return { status: "committed" } as unknown as TransitionCommitResult;
    },
  };
  const post = () =>
    handleFiscalYearTransitionRequest(
      new Request("http://localhost/api/lmnp/fiscal-year/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authToken: "tok-owner", dossierId: DOSSIER, fromYear: 2025, nextYear: 2026, expectedRevision: 3,
          closedNPayload: requestPayload?.closed ?? envelope(sourceIds, sourceScoped), closedNSchemaVersion: sourceScoped ? 2 : 1,
          nextPayload: requestPayload?.next ?? envelope(sourceIds, sourceScoped), nextSchemaVersion: sourceScoped ? 2 : 1, now: NOW,
        }),
      }),
      () => deps,
    );
  return { calls, post };
}

describe("R2C.3c1 — transition serveur : barrière multi-bien", () => {
  it("S10 — snapshot serveur multi → 409 multi_property_not_enabled, ni paiement lu ni RPC/commit appelé", async () => {
    const ctx = setup(["A", "B"], true);
    const res = await ctx.post();
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { code: string }).code, "multi_property_not_enabled");
    assert.deepEqual(ctx.calls, { commit: 0, payment: 0 });
  });

  it("le client ne peut pas déguiser un dossier multi en mono : payloads mono transmis, snapshot serveur multi → refus", async () => {
    const ctx = setup(["A", "B"], true, { closed: envelope(["A"], false), next: envelope(["A"], false) });
    assert.equal((await ctx.post()).status, 409);
    assert.equal(ctx.calls.commit, 0);
  });

  it("payload N+1 transmis multi alors que la source serveur est mono → refus (jamais un N+1 multi persisté)", async () => {
    const ctx = setup(["A"], false, { closed: envelope(["A"], false), next: envelope(["A", "B"], true) });
    assert.equal((await ctx.post()).status, 409);
    assert.equal(ctx.calls.commit, 0);
  });

  it("S8 — transition mono : chemin historique, commit appelé une fois", async () => {
    const ctx = setup(["A"], false);
    assert.equal((await ctx.post()).status, 200);
    assert.equal(ctx.calls.commit, 1);
  });

  it("S9 — transition scoped mono (un seul bien) : chemin historique, jamais bloquée comme multi", async () => {
    const ctx = setup(["A"], true);
    assert.equal((await ctx.post()).status, 200);
    assert.equal(ctx.calls.commit, 1);
  });

  it("l'ordre historique est préservé : non authentifié → 401, dossier d'autrui → 403 avant la barrière", async () => {
    const store = createInMemoryFiscalYearTransitionStore({ dossiers: [{ id: DOSSIER, userId: "someone", activeFiscalYear: 2025 }], snapshots: [] });
    const deps = createStoreBackedTransitionHandlerDeps(store);
    const body = { dossierId: DOSSIER, fromYear: 2025, nextYear: 2026, expectedRevision: 1, closedNPayload: envelope(["A", "B"], true), closedNSchemaVersion: 2, nextPayload: envelope(["A", "B"], true), nextSchemaVersion: 2 };
    const req = (b: unknown) => new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    assert.equal((await handleFiscalYearTransitionRequest(req(body), () => deps)).status, 401);
    assert.equal((await handleFiscalYearTransitionRequest(req({ ...body, authToken: "tok-owner" }), () => deps)).status, 403);
  });
});
