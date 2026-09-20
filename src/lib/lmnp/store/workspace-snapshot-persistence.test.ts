/**
 * P0 Lot 1 — real IndexedDB + saveWorkspace + hydrate/reconcile path
 * used by LmnpProvider. Reproduces local-newer-than-server after a failed save.
 *
 * Run: npx tsx --test src/lib/lmnp/store/workspace-snapshot-persistence.test.ts
 */
import "fake-indexeddb/auto";
(globalThis as unknown as { window: unknown }).window = globalThis;

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import type { PersistedWorkspace } from "./persistence";
import { getWorkspaceRecord, putWorkspaceRecord } from "./db";
import { serializeWorkspaceSnapshot, WORKSPACE_SNAPSHOT_SCHEMA_VERSION } from "./workspace-snapshot";
import type { WorkspaceSnapshotRecord } from "./workspace-snapshot-resolve";

/**
 * persistence.ts importe transitivement @/lib/supabase.ts au chargement.
 */
async function loadPersistence() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const [
    persistence,
    client,
  ] = await Promise.all([
    import("./persistence"),
    import("./workspace-snapshot-client"),
  ]);
  return { ...persistence, ...client };
}

let idCounter = 0;
function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function workspace(overrides: Partial<PersistedWorkspace> = {}): PersistedWorkspace {
  return {
    fiscalYear: {
      id: "fy-2025",
      year: 2025,
      status: "draft",
      regime: "reel",
      propertyIds: ["prop-1"],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-06-01T00:00:00.000Z",
      dossierId: "dossier-A",
      ...overrides.fiscalYear,
    },
    properties: [
      {
        id: "prop-1",
        label: "Studio Lot1",
        address: "1 rue des Tests",
        city: "Lyon-OLD",
        postalCode: "69002",
      },
    ],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: ["activite"], siret: "12345678901234" },
    ...overrides,
  };
}

function snapshotRecord(
  payload: unknown,
  revision: number,
  fiscalYear = 2025,
): WorkspaceSnapshotRecord {
  return {
    dossierId: "dossier-A",
    fiscalYear,
    schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    revision,
    payload,
    updatedAt: "2026-09-20T10:00:00.000Z",
  };
}

describe("persistence/provider — local newer than server after failed save", () => {
  const memory = new Map<string, WorkspaceSnapshotRecord>();
  let failNextUpsert = false;
  let modules: Awaited<ReturnType<typeof loadPersistence>>;

  beforeEach(async () => {
    memory.clear();
    failNextUpsert = false;
    modules = await loadPersistence();
    modules.__testResetWorkspaceSaveChain();
    modules.__resetWorkspaceSnapshotSyncForTests();
    modules.__setWorkspaceSnapshotStoreForTests({
      async listByDossier(dossierId) {
        return [...memory.values()].filter((row) => row.dossierId === dossierId);
      },
      async upsert(input) {
        if (failNextUpsert) throw new Error("simulated server save failure");
        const key = `${input.dossierId}:${input.fiscalYear}`;
        const prev = memory.get(key);
        const next: WorkspaceSnapshotRecord = {
          dossierId: input.dossierId,
          fiscalYear: input.fiscalYear,
          schemaVersion: input.schemaVersion,
          revision: (prev?.revision ?? 0) + 1,
          payload: input.payload,
          updatedAt: "2026-09-20T12:00:00.000Z",
        };
        memory.set(key, next);
        return { revision: next.revision };
      },
    });
    modules.setWorkspaceSnapshotSyncGate("ready", { dossierId: "dossier-A", fiscalYear: 2025 });
  });

  it("BLOCKER + 10. mutation → IDB ok → server fail → reload hydrate conserve le local", async () => {
    const userId = uid("user");
    const serverWs = workspace({
      properties: [
        { id: "prop-1", label: "Studio Lot1", address: "1 rue des Tests", city: "Lyon-OLD", postalCode: "69002" },
      ],
    });
    const localWs = workspace({
      properties: [
        {
          id: "prop-1",
          label: "Studio Lot1",
          address: "1 rue des Tests",
          city: "Lyon-NEWER-EDIT",
          postalCode: "69002",
        },
      ],
      declarationDraft: { completedSteps: ["activite"], siret: "12345678901234" },
    });
    const serialized = serializeWorkspaceSnapshot(serverWs);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    memory.set("dossier-A:2025", snapshotRecord(serialized.envelope, 1));

    await putWorkspaceRecord(userId, serverWs, { lastSyncedServerRevision: 1 });

    failNextUpsert = true;
    await modules.saveWorkspace(userId, localWs);

    const afterFail = await getWorkspaceRecord(userId);
    assert.equal((afterFail?.data as PersistedWorkspace).properties[0]?.city, "Lyon-NEWER-EDIT");
    assert.equal(afterFail?.lastSyncedServerRevision, 1);

    const hydrated = await modules.hydrateLmnpStore(userId);
    const decision = await modules.reconcileLocalWorkspaceWithSnapshots({
      userId,
      local: hydrated.workspace,
      lastSyncedServerRevision: hydrated.lastSyncedServerRevision,
      snapshots: [...memory.values()],
      fallbackYear: 2025,
    });

    assert.equal(decision.source, "local");
    if (decision.source !== "local") return;
    assert.equal(decision.uploadLocal, true);
    assert.equal(decision.workspace.properties[0]?.city, "Lyon-NEWER-EDIT");
    assert.equal(decision.workspace.declarationDraft?.siret, "12345678901234");
    const reloaded = await getWorkspaceRecord(userId);
    assert.equal((reloaded?.data as PersistedWorkspace).properties[0]?.city, "Lyon-NEWER-EDIT");
    assert.equal(reloaded?.lastSyncedServerRevision, 1);
  });

  it("8. save serveur réussi → metadata locale de sync mise à jour", async () => {
    const userId = uid("user");
    const serverWs = workspace();
    const serialized = serializeWorkspaceSnapshot(serverWs);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    memory.set("dossier-A:2025", snapshotRecord(serialized.envelope, 1));
    await putWorkspaceRecord(userId, serverWs, { lastSyncedServerRevision: 1 });

    const next = workspace({
      properties: [
        { id: "prop-1", label: "Studio Lot1", address: "1 rue des Tests", city: "Lyon-SAVED", postalCode: "69002" },
      ],
    });
    await modules.saveWorkspace(userId, next);

    const record = await getWorkspaceRecord(userId);
    assert.equal((record?.data as PersistedWorkspace).properties[0]?.city, "Lyon-SAVED");
    assert.equal(record?.lastSyncedServerRevision, 2);
    assert.equal(memory.get("dossier-A:2025")?.revision, 2);
  });

  it("9. save serveur échoué → metadata locale ne prétend PAS que le workspace est synchronisé", async () => {
    const userId = uid("user");
    const serverWs = workspace();
    const serialized = serializeWorkspaceSnapshot(serverWs);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    memory.set("dossier-A:2025", snapshotRecord(serialized.envelope, 1));
    await putWorkspaceRecord(userId, serverWs, { lastSyncedServerRevision: 1 });

    failNextUpsert = true;
    const dirty = workspace({
      properties: [
        { id: "prop-1", label: "Studio Lot1", address: "1 rue des Tests", city: "Lyon-NEWER-EDIT", postalCode: "69002" },
      ],
    });
    await modules.saveWorkspace(userId, dirty);

    const record = await getWorkspaceRecord(userId);
    assert.equal((record?.data as PersistedWorkspace).properties[0]?.city, "Lyon-NEWER-EDIT");
    assert.equal(record?.lastSyncedServerRevision, 1);
    assert.equal(memory.get("dossier-A:2025")?.revision, 1);
  });

  it("UNKNOWN gate : IndexedDB écrit, zéro upsert serveur", async () => {
    const userId = uid("user");
    modules.beginWorkspaceSnapshotHydration();
    await modules.saveWorkspace(
      userId,
      workspace({
        properties: [
          { id: "prop-1", label: "Studio Lot1", address: "1 rue des Tests", city: "Local-only", postalCode: "69002" },
        ],
      }),
    );
    const record = await getWorkspaceRecord(userId);
    assert.equal((record?.data as PersistedWorkspace).properties[0]?.city, "Local-only");
    assert.equal(record?.lastSyncedServerRevision, undefined);
    assert.equal(memory.size, 0);
  });

  it("first-upload N+1 confirmé → stamp local + saves suivants autorisés", async () => {
    const userId = uid("user");
    const ws2026 = (city: string) =>
      workspace({
        fiscalYear: { ...workspace().fiscalYear, year: 2026, id: "fy-2026" },
        properties: [
          { id: "prop-1", label: "Studio Lot1", address: "1 rue des Tests", city, postalCode: "69002" },
        ],
      });
    await modules.saveWorkspace(userId, ws2026("state-1"));
    assert.deepEqual(modules.getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2026 });
    const afterFirst = await getWorkspaceRecord(userId);
    assert.equal(afterFirst?.lastSyncedServerRevision, 1);

    await modules.saveWorkspace(userId, ws2026("state-2"));
    await modules.saveWorkspace(userId, ws2026("state-3"));
    const afterThird = await getWorkspaceRecord(userId);
    assert.equal((afterThird?.data as PersistedWorkspace).properties[0]?.city, "state-3");
    assert.equal(afterThird?.lastSyncedServerRevision, 3);
    assert.equal(memory.get("dossier-A:2026")?.revision, 3);
    assert.deepEqual(modules.getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2026 });
  });
});
