import "fake-indexeddb/auto";
(globalThis as unknown as { window: unknown }).window = globalThis;

import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PersistedWorkspace } from "./persistence";
import { getWorkspaceRecord, putWorkspaceRecord } from "./db";
import { serializeWorkspaceSnapshot, WORKSPACE_SNAPSHOT_SCHEMA_VERSION } from "./workspace-snapshot";
import type { WorkspaceSnapshotRecord } from "./workspace-snapshot-resolve";

async function modules() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  return { ...await import("./persistence"), ...await import("./workspace-snapshot-client") };
}

const BASE: PersistedWorkspace = {
  fiscalYear: {
    id: "year-id", dossierId: "dossier-id", year: 2025, status: "draft", regime: "reel",
    propertyIds: ["property-id"], createdAt: "2025-01-01", updatedAt: "2025-01-01",
  },
  properties: [{ id: "property-id", label: "", address: "", city: "", postalCode: "" }],
  documents: [], extractions: [], validationItems: [], ledgerEntries: [],
  declarationDraft: { completedSteps: [], exploitantFirstName: "Before" },
};

let id = 0;
describe("V3 confirmed correction save", () => {
  let api: Awaited<ReturnType<typeof modules>>;
  let server: WorkspaceSnapshotRecord;
  let failCas = false;
  let holdCas: Promise<void> | null = null;
  let casEntered: (() => void) | null = null;

  beforeEach(async () => {
    api = await modules();
    api.__testResetWorkspaceSaveChain();
    failCas = false;
    holdCas = null;
    casEntered = null;
    const serialized = serializeWorkspaceSnapshot(BASE);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) throw new Error("fixture invalid");
    server = {
      dossierId: "dossier-id", fiscalYear: 2025,
      revision: 1, schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
      payload: serialized.envelope, updatedAt: "2025-01-01",
    };
    api.__setWorkspaceSnapshotStoreForTests({
      async listByDossier() { return [server]; },
      async getMeta() { return { revision: server.revision, closedAt: null, schemaVersion: server.schemaVersion }; },
      async upsert(input) {
        server = { ...server, payload: input.payload, revision: server.revision + 1 };
        return { revision: server.revision };
      },
      async casUpdate(input) {
        casEntered?.();
        if (holdCas) await holdCas;
        if (failCas) throw new Error("server unavailable");
        if (input.expectedRevision !== server.revision) return { status: "conflict" as const };
        server = { ...server, payload: input.payload, revision: server.revision + 1 };
        return { status: "ok" as const, revision: server.revision };
      },
    });
    api.setWorkspaceSnapshotSyncGate("ready", { dossierId: "dossier-id", fiscalYear: 2025 });
  });

  it("IndexedDB and Supabase success returns the confirmed server revision", async () => {
    const userId = `v3-confirm-${++id}`;
    await putWorkspaceRecord(userId, BASE, { lastSyncedServerRevision: 1 });
    const edited = { ...BASE, declarationDraft: { completedSteps: [], exploitantFirstName: "After" } };
    const result = await api.flushWorkspaceSaveConfirmed(userId, () => edited);
    assert.deepEqual(result, { status: "confirmed", revision: 2 });
    assert.equal((await getWorkspaceRecord(userId))?.lastSyncedServerRevision, 2);
    assert.equal((await getWorkspaceRecord(userId))?.data.declarationDraft?.exploitantFirstName, "After");
  });

  it("IndexedDB success and Supabase failure retains the local edit but refuses confirmation", async () => {
    const userId = `v3-fail-${++id}`;
    await putWorkspaceRecord(userId, BASE, { lastSyncedServerRevision: 1 });
    failCas = true;
    const edited = { ...BASE, declarationDraft: { completedSteps: [], exploitantFirstName: "Local only" } };
    const result = await api.flushWorkspaceSaveConfirmed(userId, () => edited);
    assert.deepEqual(result, { status: "failed", reason: "server_unavailable" });
    const local = await getWorkspaceRecord(userId);
    assert.equal(local?.data.declarationDraft?.exploitantFirstName, "Local only");
    assert.equal(local?.lastSyncedServerRevision, 1);
    assert.equal(server.revision, 1);
  });

  it("does not confirm a revision superseded by a newer queued autosave", async () => {
    const userId = `v3-race-${++id}`;
    await putWorkspaceRecord(userId, BASE, { lastSyncedServerRevision: 1 });
    let release!: () => void;
    holdCas = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { casEntered = resolve; });
    const older = { ...BASE, declarationDraft: { completedSteps: [], exploitantFirstName: "Older" } };
    const newer = { ...BASE, declarationDraft: { completedSteps: [], exploitantFirstName: "Newer" } };
    const confirmation = api.flushWorkspaceSaveConfirmed(userId, () => older);
    await entered;
    const autosave = api.saveWorkspace(userId, newer);
    release();
    assert.deepEqual(await confirmation, { status: "failed", reason: "superseded" });
    await autosave;
  });

  it("does not confirm an older state while a newer edit is still in the debounce window", async () => {
    const userId = `v3-pending-${++id}`;
    await putWorkspaceRecord(userId, BASE, { lastSyncedServerRevision: 1 });
    let release!: () => void;
    holdCas = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { casEntered = resolve; });
    const older = { ...BASE, declarationDraft: { completedSteps: [], exploitantFirstName: "Older" } };
    const newer = { ...BASE, declarationDraft: { completedSteps: [], exploitantFirstName: "Newer" } };
    let current = older;
    const confirmation = api.flushWorkspaceSaveConfirmed(userId, () => current);
    await entered;
    current = newer;
    release();
    assert.deepEqual(await confirmation, { status: "failed", reason: "superseded" });
  });

  it("returns an explicit failure when the correction scope changes before serialization", async () => {
    const userId = `v3-scope-${++id}`;
    await putWorkspaceRecord(userId, BASE, { lastSyncedServerRevision: 1 });
    const result = await api.flushWorkspaceSaveConfirmed(userId, () => { throw new Error("scope_mismatch"); });
    assert.deepEqual(result, { status: "failed", reason: "scope_mismatch" });
    assert.equal(server.revision, 1);
  });
});
