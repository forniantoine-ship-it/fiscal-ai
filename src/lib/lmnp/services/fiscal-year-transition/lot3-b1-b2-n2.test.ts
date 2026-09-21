/**
 * Lot 3 blocker fixes — B1 (N+1 gate adoption), B2 (CAS flush), N2 (active year).
 * Run: NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key \
 *   npx tsx --test src/lib/lmnp/services/fiscal-year-transition/lot3-b1-b2-n2.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { commitFiscalYearTransition } from "./commit-transition";
import { createInMemoryFiscalYearTransitionStore } from "./in-memory-store";
import {
  runServerFiscalYearTransition,
  __testResetServerFiscalYearTransitionGuard,
} from "@/lib/lmnp/store/server-fiscal-year-transition";
import {
  __resetWorkspaceSnapshotSyncForTests,
  __setWorkspaceSnapshotStoreForTests,
  getWorkspaceSnapshotReadyScope,
  saveWorkspaceSnapshotToServer,
  saveWorkspaceSnapshotToServerForTransition,
  setWorkspaceSnapshotSyncGate,
  type WorkspaceSnapshotStore,
} from "@/lib/lmnp/store/workspace-snapshot-client";
import { serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import { resolveWorkspaceHydration } from "@/lib/lmnp/store/workspace-snapshot-resolve";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { DeclarationDraft, FiscalYear } from "@/lib/lmnp/types/domain";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import type { TransitionCommitResult } from "./types";

const NOW = "2026-09-21T12:00:00.000Z";
const DOSSIER = "dossier-b1";

function baseFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-n",
    year: 2025,
    status: "ready_to_close",
    regime: "reel",
    propertyIds: ["prop-1"],
    dossierId: DOSSIER,
    declarationGeneratedAt: NOW,
    priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW },
    closures: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: NOW,
    ...overrides,
  };
}

function closableDraft(): DeclarationDraft {
  const draft = {
    completedSteps: [],
    inpiConfirmedAt: NOW,
    logementConfirmedAt: NOW,
    logementAmortissement: {
      computedAt: NOW,
      prixRevient: 200000,
      valeurTerrain: 40000,
      valeurBati: 160000,
      baseAmortissableBati: 160000,
      montantMobilier: 0,
      dotationAnnuelle: 5333,
      dureeMoyenneAnnees: 30,
      plan: { lignes: [], totalAnnuelExercice: 0, totalBrut: 0 },
    },
    creditDeclaredNoneAt: NOW,
    revenusConfirmedAt: NOW,
    chargesConfirmedAt: NOW,
    amortissementConfirmedAt: NOW,
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    exploitantEmail: "marie.dupont@example.com",
    exploitantTelephone: "0601020304",
    personalAddress: "10 rue des Lilas",
    personalCity: "Lyon",
    personalPostalCode: "69001",
    dateMiseEnService: "2020-01-01",
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
  } as DeclarationDraft;
  const generation = runDeclarationGeneration(draft, 2025);
  assert.equal(generation.status, "generated");
  if (generation.status !== "generated") throw new Error("unreachable");
  return { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;
}

function workspaceN(overrides: Partial<PersistedWorkspace> = {}): PersistedWorkspace {
  return {
    fiscalYear: baseFiscalYear(),
    properties: [{ id: "prop-1", label: "Bien", address: "1 rue X", city: "Lyon", postalCode: "69000" }],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: closableDraft(),
    ...overrides,
  };
}

function envelope(ws: PersistedWorkspace): unknown {
  const s = serializeWorkspaceSnapshot(ws);
  assert.equal(s.ok, true);
  if (!s.ok) throw new Error("unreachable");
  return s.envelope;
}

type Row = {
  fiscalYear: number;
  revision: number;
  payload: unknown;
  schemaVersion: number;
  closedAt: string | null;
};

function createCasStore(seed: Row[]): WorkspaceSnapshotStore & { rows: Map<number, Row> } {
  const rows = new Map(seed.map((r) => [r.fiscalYear, { ...r }]));
  return {
    rows,
    async listByDossier() {
      return [...rows.values()].map((r) => ({
        dossierId: DOSSIER,
        fiscalYear: r.fiscalYear,
        schemaVersion: r.schemaVersion,
        revision: r.revision,
        payload: r.payload,
        updatedAt: NOW,
        closedAt: r.closedAt,
        successorFiscalYear: null,
      }));
    },
    async upsert(input) {
      const existing = rows.get(input.fiscalYear);
      const revision = (existing?.revision ?? 0) + 1;
      rows.set(input.fiscalYear, {
        fiscalYear: input.fiscalYear,
        revision,
        payload: input.payload,
        schemaVersion: input.schemaVersion,
        closedAt: existing?.closedAt ?? null,
      });
      return { revision };
    },
    async casUpdate(input) {
      const existing = rows.get(input.fiscalYear);
      if (!existing || existing.closedAt != null || existing.revision !== input.expectedRevision) {
        return { status: "conflict" };
      }
      const revision = existing.revision + 1;
      rows.set(input.fiscalYear, {
        ...existing,
        revision,
        payload: input.payload,
        schemaVersion: input.schemaVersion,
      });
      return { status: "ok", revision };
    },
    async getMeta(_dossierId, fiscalYear) {
      const row = rows.get(fiscalYear);
      if (!row) return null;
      return { revision: row.revision, closedAt: row.closedAt, schemaVersion: row.schemaVersion };
    },
  };
}

beforeEach(() => {
  __testResetServerFiscalYearTransitionGuard();
  __resetWorkspaceSnapshotSyncForTests();
});

describe("B1 — adopt N+1 sync gate after confirmed transition", () => {
  it("after commit: first N+1 autosave updates server (revision > 1), cold B sees edit", async () => {
    const nWs = workspaceN();
    const nPayload = envelope(nWs);
    const store = createCasStore([
      { fiscalYear: 2025, revision: 3, payload: nPayload, schemaVersion: 1, closedAt: null },
    ]);
    __setWorkspaceSnapshotStoreForTests(store);
    setWorkspaceSnapshotSyncGate("ready", { dossierId: DOSSIER, fiscalYear: 2025 });

    let nextWs: PersistedWorkspace | null = null;
    await runServerFiscalYearTransition({
      dossierId: DOSSIER,
      userId: "user-1",
      workspace: nWs,
      now: NOW,
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      getAuthToken: async () => "tok",
      mirrorLocalAfterCommit: async () => {},
      commitOnServer: async (input) => {
        // Simulate server: close N, insert N+1 at revision 1
        store.rows.set(2025, {
          fiscalYear: 2025,
          revision: 4,
          payload: input.closedNPayload,
          schemaVersion: 1,
          closedAt: NOW,
        });
        store.rows.set(2026, {
          fiscalYear: 2026,
          revision: 1,
          payload: input.nextPayload,
          schemaVersion: 1,
          closedAt: null,
        });
        return {
          status: "committed",
          fromYear: 2025,
          nextYear: 2026,
          closedRevision: 4,
          nextRevision: 1,
          closedAt: NOW,
          activeFiscalYear: 2026,
          nextPayload: input.nextPayload,
          nextSchemaVersion: 1,
        } satisfies TransitionCommitResult;
      },
      dispatchNextWorkspace: (ws) => {
        nextWs = ws;
      },
      onError: (e) => {
        assert.equal(e, null, e ?? undefined);
      },
    });

    assert.ok(nextWs);
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: DOSSIER, fiscalYear: 2026 });

    const edited: PersistedWorkspace = {
      ...nextWs!,
      declarationDraft: {
        ...(nextWs!.declarationDraft ?? { completedSteps: [] }),
        exploitantFirstName: "EditedAfterTransition",
      },
    };
    const save = await saveWorkspaceSnapshotToServer({ dossierId: DOSSIER, workspace: edited });
    assert.equal(save.status, "ok");
    if (save.status !== "ok") throw new Error("unreachable");
    assert.ok(save.revision > 1, "N+1 revision must increment after first autosave");
    const row = store.rows.get(2026);
    assert.ok(row);
    assert.equal(row!.revision, save.revision);
    assert.match(JSON.stringify(row!.payload), /EditedAfterTransition/);

    // Browser B cold restore sees the edit via active year hydrate.
    const decision = resolveWorkspaceHydration({
      local: null,
      snapshots: [
        {
          dossierId: DOSSIER,
          fiscalYear: 2026,
          schemaVersion: 1,
          revision: row!.revision,
          payload: row!.payload,
          updatedAt: NOW,
          closedAt: null,
        },
      ],
      fallbackYear: 2025,
      activeFiscalYear: 2026,
    });
    assert.equal(decision.source, "server");
    if (decision.source === "server") {
      assert.equal(decision.workspace.declarationDraft?.exploitantFirstName, "EditedAfterTransition");
    }
  });

  it("transition failure / revision_conflict → gate stays on N", async () => {
    setWorkspaceSnapshotSyncGate("ready", { dossierId: DOSSIER, fiscalYear: 2025 });
    await runServerFiscalYearTransition({
      dossierId: DOSSIER,
      userId: "user-1",
      workspace: workspaceN(),
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      getAuthToken: async () => "tok",
      commitOnServer: async () => {
        const err = new Error("conflict") as Error & { code: string };
        err.code = "revision_conflict";
        throw err;
      },
      dispatchNextWorkspace: () => {
        assert.fail("must not dispatch");
      },
      onError: () => {},
    });
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: DOSSIER, fiscalYear: 2025 });
  });
});

describe("B2 — CAS flush before closure", () => {
  it("1. known 10 / server 10 → CAS ok revision 11", async () => {
    const ws = workspaceN();
    const store = createCasStore([
      { fiscalYear: 2025, revision: 10, payload: envelope(ws), schemaVersion: 1, closedAt: null },
    ]);
    __setWorkspaceSnapshotStoreForTests(store);
    const result = await saveWorkspaceSnapshotToServerForTransition({
      dossierId: DOSSIER,
      workspace: ws,
      knownRevision: 10,
    });
    assert.equal(result.status, "ok");
    if (result.status === "ok") assert.equal(result.revision, 11);
    assert.equal(store.rows.get(2025)?.revision, 11);
  });

  it("2. known 10 / server 11 → conflict, payload unchanged, no close", async () => {
    const ws = workspaceN();
    const serverPayload = envelope(ws);
    const staleLocal = {
      ...ws,
      declarationDraft: { ...ws.declarationDraft!, exploitantFirstName: "StaleB" },
    };
    const store = createCasStore([
      { fiscalYear: 2025, revision: 11, payload: serverPayload, schemaVersion: 1, closedAt: null },
    ]);
    __setWorkspaceSnapshotStoreForTests(store);
    const result = await saveWorkspaceSnapshotToServerForTransition({
      dossierId: DOSSIER,
      workspace: staleLocal,
      knownRevision: 10,
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.equal(result.reason, "revision_conflict");
    assert.equal(store.rows.get(2025)?.revision, 11);
    assert.equal(store.rows.get(2025)?.payload, serverPayload);
    assert.equal(store.rows.get(2025)?.closedAt, null);
    assert.equal(store.rows.has(2026), false);
  });

  it("3. race after check → casUpdate 0 rows → conflict", async () => {
    const ws = workspaceN();
    const store = createCasStore([
      { fiscalYear: 2025, revision: 10, payload: envelope(ws), schemaVersion: 1, closedAt: null },
    ]);
    // Simulate race: between getMeta and casUpdate another writer wins.
    const originalCas = store.casUpdate!.bind(store);
    store.casUpdate = async (input) => {
      store.rows.set(2025, {
        fiscalYear: 2025,
        revision: 11,
        payload: { winner: "A" },
        schemaVersion: 1,
        closedAt: null,
      });
      return originalCas(input);
    };
    __setWorkspaceSnapshotStoreForTests(store);
    const result = await saveWorkspaceSnapshotToServerForTransition({
      dossierId: DOSSIER,
      workspace: ws,
      knownRevision: 10,
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.equal(result.reason, "revision_conflict");
    assert.deepEqual(store.rows.get(2025)?.payload, { winner: "A" });
  });

  it("4. unknown revision + server row exists → fail-closed (no adopt)", async () => {
    const ws = workspaceN();
    const store = createCasStore([
      { fiscalYear: 2025, revision: 7, payload: envelope(ws), schemaVersion: 1, closedAt: null },
    ]);
    __setWorkspaceSnapshotStoreForTests(store);
    const result = await saveWorkspaceSnapshotToServerForTransition({
      dossierId: DOSSIER,
      workspace: ws,
      knownRevision: null,
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.equal(result.reason, "unknown_revision");
    assert.equal(store.rows.get(2025)?.revision, 7);
  });

  it("5. closed N → already_closed, no CAS overwrite (idempotent path)", async () => {
    const ws = workspaceN({ fiscalYear: baseFiscalYear({ status: "closed" }) });
    const store = createCasStore([
      {
        fiscalYear: 2025,
        revision: 5,
        payload: envelope(ws),
        schemaVersion: 1,
        closedAt: NOW,
      },
    ]);
    __setWorkspaceSnapshotStoreForTests(store);
    const result = await saveWorkspaceSnapshotToServerForTransition({
      dossierId: DOSSIER,
      workspace: ws,
      knownRevision: 5,
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.equal(result.reason, "already_closed");
    assert.equal(store.rows.get(2025)?.revision, 5);
  });

  it("first server save: absent snapshot + no knownRevision → insert ok", async () => {
    const ws = workspaceN();
    const store = createCasStore([]);
    __setWorkspaceSnapshotStoreForTests(store);
    const result = await saveWorkspaceSnapshotToServerForTransition({
      dossierId: DOSSIER,
      workspace: ws,
      knownRevision: null,
    });
    assert.equal(result.status, "ok");
    if (result.status === "ok") assert.equal(result.revision, 1);
  });
});

describe("N2 — active_fiscal_year never regresses on stale retry", () => {
  it("N→N+1→N+2 then retry N→N+1 keeps active N+2, no reseed", async () => {
    const store = createInMemoryFiscalYearTransitionStore({
      dossiers: [{ id: DOSSIER, userId: "user-owner", activeFiscalYear: null }],
      snapshots: [],
    });
    const nPayload = { n: true };
    const n1Payload = { n1: "original" };
    const n2Payload = { n2: true };

    store.snapshots.set(`${DOSSIER}:2025`, {
      dossierId: DOSSIER,
      fiscalYear: 2025,
      schemaVersion: 1,
      revision: 2,
      payload: nPayload,
      closedAt: null,
      successorFiscalYear: null,
      updatedAt: NOW,
    });

    const t1 = await commitFiscalYearTransition(store, {
      dossierId: DOSSIER,
      userId: "user-owner",
      fromYear: 2025,
      expectedRevision: 2,
      closedNPayload: nPayload,
      closedNSchemaVersion: 1,
      nextYear: 2026,
      nextPayload: n1Payload,
      nextSchemaVersion: 1,
      now: NOW,
    });
    assert.equal(t1.activeFiscalYear, 2026);

    // Advance N+1 → N+2
    const n1 = store.snapshots.get(`${DOSSIER}:2026`)!;
    n1.revision = 3;
    store.snapshots.set(`${DOSSIER}:2026`, n1);
    const t2 = await commitFiscalYearTransition(store, {
      dossierId: DOSSIER,
      userId: "user-owner",
      fromYear: 2026,
      expectedRevision: 3,
      closedNPayload: n1Payload,
      closedNSchemaVersion: 1,
      nextYear: 2027,
      nextPayload: n2Payload,
      nextSchemaVersion: 1,
      now: "2027-01-01T00:00:00.000Z",
    });
    assert.equal(t2.activeFiscalYear, 2027);
    assert.equal(store.dossiers.get(DOSSIER)?.activeFiscalYear, 2027);

    // Stale retry of N→N+1 (idempotent)
    const retry = await commitFiscalYearTransition(store, {
      dossierId: DOSSIER,
      userId: "user-owner",
      fromYear: 2025,
      expectedRevision: 99,
      closedNPayload: { evil: true },
      closedNSchemaVersion: 1,
      nextYear: 2026,
      nextPayload: { reseed: true },
      nextSchemaVersion: 1,
      now: NOW,
    });
    assert.equal(retry.status, "idempotent");
    assert.equal(retry.activeFiscalYear, 2027, "must not regress to N+1");
    assert.equal(store.dossiers.get(DOSSIER)?.activeFiscalYear, 2027);
    assert.deepEqual(store.snapshots.get(`${DOSSIER}:2026`)?.payload, n1Payload, "no reseed");
    assert.equal(store.snapshots.get(`${DOSSIER}:2025`)?.successorFiscalYear, 2026);
  });
});
