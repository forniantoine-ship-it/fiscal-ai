/**
 * Lot 3 F1/F2 — post-commit local adoption + revision year scoping.
 * Run: NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key \
 *   npx tsx --test src/lib/lmnp/services/fiscal-year-transition/lot3-f1-f2.test.ts
 */
import "fake-indexeddb/auto";
(globalThis as unknown as { window: unknown }).window = globalThis;
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  runServerFiscalYearTransition,
  __testResetServerFiscalYearTransitionGuard,
  POST_COMMIT_LOCAL_ADOPTION_FAILED_MESSAGE,
} from "@/lib/lmnp/store/server-fiscal-year-transition";
import {
  __resetWorkspaceSnapshotSyncForTests,
  __setWorkspaceSnapshotStoreForTests,
  getWorkspaceSnapshotReadyScope,
  getWorkspaceSnapshotSyncGate,
  saveWorkspaceSnapshotToServer,
  setWorkspaceSnapshotSyncGate,
  type WorkspaceSnapshotStore,
} from "@/lib/lmnp/store/workspace-snapshot-client";
import { flushWorkspaceSaveForTransition } from "@/lib/lmnp/store/persistence";
import {
  getWorkspaceRecord,
  putWorkspaceRecord,
  deleteWorkspaceRecord,
  workspaceKeyForUser,
} from "@/lib/lmnp/store/db";
import { serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import { resolveWorkspaceHydration } from "@/lib/lmnp/store/workspace-snapshot-resolve";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { DeclarationDraft, FiscalYear } from "@/lib/lmnp/types/domain";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import type { TransitionCommitResult } from "./types";

const NOW = "2026-09-21T14:00:00.000Z";
const DOSSIER = "dossier-f1";
const USER = "user-f1";

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

function workspaceNPlus1(from: PersistedWorkspace): PersistedWorkspace {
  return {
    ...from,
    fiscalYear: {
      ...from.fiscalYear,
      id: "fy-n1",
      year: 2026,
      status: "draft",
      previousFiscalYearId: from.fiscalYear.id,
      closures: [],
      declarationGeneratedAt: undefined,
      stocksOuverture: {
        sourceClosureId: "closure-1",
        stocks: { deficits: [], amortissementsReportes: 0 },
      },
    },
    documents: [],
    declarationDraft: { completedSteps: [], exploitantFirstName: "Marie" },
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
      if (existing?.closedAt) throw new Error("lmnp_snapshot_closed");
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
    async getMeta(_d, fiscalYear) {
      const row = rows.get(fiscalYear);
      if (!row) return null;
      return { revision: row.revision, closedAt: row.closedAt, schemaVersion: row.schemaVersion };
    },
  };
}

beforeEach(async () => {
  __testResetServerFiscalYearTransitionGuard();
  __resetWorkspaceSnapshotSyncForTests();
  await deleteWorkspaceRecord(workspaceKeyForUser(USER));
});

describe("F1 — post-commit local adoption critical", () => {
  it("matrix A: commit fails → gate stays N, no dispatch", async () => {
    setWorkspaceSnapshotSyncGate("ready", { dossierId: DOSSIER, fiscalYear: 2025 });
    let dispatched = false;
    await runServerFiscalYearTransition({
      dossierId: DOSSIER,
      userId: USER,
      workspace: workspaceN(),
      flushForTransition: async () => ({ status: "ok", revision: 4 }),
      getAuthToken: async () => "tok",
      commitOnServer: async () => {
        throw new Error("network");
      },
      dispatchNextWorkspace: () => {
        dispatched = true;
      },
      onError: () => {},
    });
    assert.equal(dispatched, false);
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: DOSSIER, fiscalYear: 2025 });
  });

  it("matrix B: commit + mirror OK → IDB N+1 rev=1, gate N+1, dispatch, autosave durable", async () => {
    const n = workspaceN();
    await putWorkspaceRecord(USER, n, { lastSyncedServerRevision: 4 });
    const store = createCasStore([
      { fiscalYear: 2025, revision: 4, payload: envelope(n), schemaVersion: 1, closedAt: null },
    ]);
    __setWorkspaceSnapshotStoreForTests(store);
    setWorkspaceSnapshotSyncGate("ready", { dossierId: DOSSIER, fiscalYear: 2025 });

    let dispatched: PersistedWorkspace | null = null;
    await runServerFiscalYearTransition({
      dossierId: DOSSIER,
      userId: USER,
      workspace: n,
      flushForTransition: async () => ({ status: "ok", revision: 4 }),
      getAuthToken: async () => "tok",
      commitOnServer: async (input) => {
        store.rows.set(2025, {
          fiscalYear: 2025,
          revision: 5,
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
          closedRevision: 5,
          nextRevision: 1,
          closedAt: NOW,
          activeFiscalYear: 2026,
          nextPayload: input.nextPayload,
          nextSchemaVersion: 1,
        } satisfies TransitionCommitResult;
      },
      dispatchNextWorkspace: (ws) => {
        dispatched = ws;
      },
      onError: (e) => assert.equal(e, null),
    });

    assert.equal(dispatched?.fiscalYear.year, 2026);
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: DOSSIER, fiscalYear: 2026 });
    const idb = await getWorkspaceRecord(USER);
    assert.equal((idb?.data as PersistedWorkspace).fiscalYear.year, 2026);
    assert.equal(idb?.lastSyncedServerRevision, 1);

    const edited = {
      ...dispatched!,
      declarationDraft: {
        ...(dispatched!.declarationDraft ?? { completedSteps: [] }),
        exploitantFirstName: "DurableEdit",
      },
    };
    const save = await saveWorkspaceSnapshotToServer({ dossierId: DOSSIER, workspace: edited });
    assert.equal(save.status, "ok");
    if (save.status === "ok") assert.ok(save.revision > 1);
    assert.match(JSON.stringify(store.rows.get(2026)?.payload), /DurableEdit/);
  });

  it("matrix C / F1 exact: mirror fails → no editable N+1; after recovery edits durable", async () => {
    const n = workspaceN();
    await putWorkspaceRecord(USER, n, { lastSyncedServerRevision: 4 });
    setWorkspaceSnapshotSyncGate("ready", { dossierId: DOSSIER, fiscalYear: 2025 });

    const n1FromServer = workspaceNPlus1(n);
    const n1Payload = envelope(n1FromServer);
    const store = createCasStore([
      { fiscalYear: 2025, revision: 5, payload: envelope(n), schemaVersion: 1, closedAt: NOW },
      { fiscalYear: 2026, revision: 1, payload: n1Payload, schemaVersion: 1, closedAt: null },
    ]);
    __setWorkspaceSnapshotStoreForTests(store);

    let dispatched = false;
    let error: string | null = null;
    let failSafeCalled = false;
    let commitCalls = 0;

    await runServerFiscalYearTransition({
      dossierId: DOSSIER,
      userId: USER,
      workspace: n,
      flushForTransition: async () => ({ status: "ok", revision: 4 }),
      getAuthToken: async () => "tok",
      commitOnServer: async (input) => {
        commitCalls += 1;
        return {
          status: "committed",
          fromYear: 2025,
          nextYear: 2026,
          closedRevision: 5,
          nextRevision: 1,
          closedAt: NOW,
          activeFiscalYear: 2026,
          nextPayload: input.nextPayload,
          nextSchemaVersion: 1,
        };
      },
      mirrorLocalAfterCommit: async () => {
        throw new Error("IndexedDB put failed");
      },
      dispatchNextWorkspace: () => {
        dispatched = true;
      },
      onError: (m) => {
        error = m;
      },
      onPostCommitLocalAdoptionFailed: () => {
        failSafeCalled = true;
      },
    });

    assert.equal(commitCalls, 1);
    assert.equal(dispatched, false);
    assert.equal(error, POST_COMMIT_LOCAL_ADOPTION_FAILED_MESSAGE);
    assert.equal(failSafeCalled, true);
    assert.equal(getWorkspaceSnapshotSyncGate(), "blocked");
    const stuck = await getWorkspaceRecord(USER);
    assert.equal((stuck?.data as PersistedWorkspace).fiscalYear.year, 2025);
    assert.equal(stuck?.lastSyncedServerRevision, 4);
    assert.equal(store.rows.get(2026)?.revision, 1);
    assert.equal(store.rows.get(2025)?.closedAt, NOW);

    // Recovery / reload
    await putWorkspaceRecord(USER, n1FromServer, { lastSyncedServerRevision: 1 });
    setWorkspaceSnapshotSyncGate("ready", { dossierId: DOSSIER, fiscalYear: 2026 });
    const recovered = await getWorkspaceRecord(USER);
    assert.equal((recovered?.data as PersistedWorkspace).fiscalYear.year, 2026);
    assert.equal(recovered?.lastSyncedServerRevision, 1);

    const edited = {
      ...n1FromServer,
      declarationDraft: {
        ...n1FromServer.declarationDraft!,
        exploitantFirstName: "AfterRecovery",
      },
    };
    const save = await saveWorkspaceSnapshotToServer({ dossierId: DOSSIER, workspace: edited });
    assert.equal(save.status, "ok");
    if (save.status === "ok") assert.ok(save.revision > 1);

    const cold = resolveWorkspaceHydration({
      local: null,
      snapshots: [
        {
          dossierId: DOSSIER,
          fiscalYear: 2026,
          schemaVersion: 1,
          revision: store.rows.get(2026)!.revision,
          payload: store.rows.get(2026)!.payload,
          updatedAt: NOW,
          closedAt: null,
        },
      ],
      fallbackYear: 2025,
      activeFiscalYear: 2026,
    });
    assert.equal(cold.source, "server");
    if (cold.source === "server") {
      assert.equal(cold.workspace.declarationDraft?.exploitantFirstName, "AfterRecovery");
    }
  });
});

describe("F2 — revision scoped to workspace year", () => {
  it("IDB N rev 4 + flush N+1 + server N+1 rev 4 → scope_mismatch, no CAS", async () => {
    const n = workspaceN();
    const n1 = workspaceNPlus1(n);
    const serverPayload = envelope(n1);
    await putWorkspaceRecord(USER, n, { lastSyncedServerRevision: 4 });

    const store = createCasStore([
      { fiscalYear: 2026, revision: 4, payload: serverPayload, schemaVersion: 1, closedAt: null },
    ]);
    __setWorkspaceSnapshotStoreForTests(store);

    const result = await flushWorkspaceSaveForTransition(USER, n1);
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.reason, "scope_mismatch");
    }
    assert.equal(store.rows.get(2026)?.revision, 4);
    assert.equal(store.rows.get(2026)?.payload, serverPayload);

    const idb = await getWorkspaceRecord(USER);
    assert.equal((idb?.data as PersistedWorkspace).fiscalYear.year, 2025);
    assert.equal(idb?.lastSyncedServerRevision, 4);
  });

  it("IDB N+1 rev 4 + flush N+1 + server 4 → CAS 4→5 OK", async () => {
    const n = workspaceN();
    const n1 = workspaceNPlus1(n);
    await putWorkspaceRecord(USER, n1, { lastSyncedServerRevision: 4 });
    const store = createCasStore([
      { fiscalYear: 2026, revision: 4, payload: envelope(n1), schemaVersion: 1, closedAt: null },
    ]);
    __setWorkspaceSnapshotStoreForTests(store);

    const edited = {
      ...n1,
      declarationDraft: { ...n1.declarationDraft!, exploitantFirstName: "CasOk" },
    };
    const result = await flushWorkspaceSaveForTransition(USER, edited);
    assert.equal(result.status, "ok");
    if (result.status === "ok") assert.equal(result.revision, 5);
    assert.equal(store.rows.get(2026)?.revision, 5);
    assert.match(JSON.stringify(store.rows.get(2026)?.payload), /CasOk/);
  });
});
