/**
 * P0 Lot 2 — anti-wipe guard: UNKNOWN/BLOCKED never upsert; READY is scoped
 * to the hydrated (dossier_id, fiscal_year) pair.
 * Run: npx tsx --test src/lib/lmnp/store/workspace-snapshot-anti-wipe.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import type { PersistedWorkspace } from "./persistence";
import {
  parseWorkspaceSnapshot,
  serializeWorkspaceSnapshot,
  WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
} from "./workspace-snapshot";
import { resolveWorkspaceHydration } from "./workspace-snapshot-resolve";
import type { WorkspaceSnapshotRecord } from "./workspace-snapshot-resolve";
import {
  __resetWorkspaceSnapshotSyncForTests,
  __setWorkspaceSnapshotStoreForTests,
  beginWorkspaceSnapshotHydration,
  completeWorkspaceSnapshotHydration,
  getWorkspaceSnapshotReadyScope,
  getWorkspaceSnapshotSyncGate,
  saveWorkspaceSnapshotToServer,
  setWorkspaceSnapshotSyncGate,
} from "./workspace-snapshot-client";

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
        city: "Lyon-P0-Lot1",
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

function record(
  partial: Partial<WorkspaceSnapshotRecord> & { payload: unknown; fiscalYear: number },
): WorkspaceSnapshotRecord {
  return {
    dossierId: "dossier-A",
    schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    revision: 1,
    updatedAt: "2026-09-20T10:00:00.000Z",
    ...partial,
  };
}

describe("Lot 2 anti-wipe", () => {
  const memory = new Map<string, WorkspaceSnapshotRecord>();
  let upserts: Array<{ dossierId: string; fiscalYear: number; city?: string }> = [];
  let listError = false;
  let upsertError = false;
  let invalidRevision = false;

  beforeEach(() => {
    memory.clear();
    upserts = [];
    listError = false;
    upsertError = false;
    invalidRevision = false;
    __resetWorkspaceSnapshotSyncForTests();
    __setWorkspaceSnapshotStoreForTests({
      async listByDossier(dossierId) {
        if (listError) throw new Error("simulated list failure");
        return [...memory.values()].filter((row) => row.dossierId === dossierId);
      },
      async upsert(input) {
        if (upsertError) throw new Error("simulated upsert failure");
        if (invalidRevision) return { revision: 0 };
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
        const parsed = parseWorkspaceSnapshot(input.payload);
        upserts.push({
          dossierId: input.dossierId,
          fiscalYear: input.fiscalYear,
          city: parsed.ok ? parsed.envelope.workspace.properties[0]?.city : undefined,
        });
        return { revision: next.revision };
      },
    });
  });

  it("A. server rich + local default → zéro upsert avant hydrate", async () => {
    const rich = serializeWorkspaceSnapshot(workspace());
    assert.equal(rich.ok, true);
    if (!rich.ok) return;
    memory.set("dossier-A:2025", record({ fiscalYear: 2025, payload: rich.envelope }));
    beginWorkspaceSnapshotHydration();
    const localDefault = workspace({
      properties: [{ id: "prop-1", label: "Mon bien locatif", address: "", city: "", postalCode: "" }],
      documents: [],
      declarationDraft: { completedSteps: [] },
    });
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: localDefault,
    });
    assert.equal(result.status, "skipped");
    assert.equal(upserts.length, 0);
    assert.equal(memory.get("dossier-A:2025")?.revision, 1);
  });

  it("B. delayed server fetch → zéro upsert pendant loading", async () => {
    beginWorkspaceSnapshotHydration();
    assert.equal(getWorkspaceSnapshotSyncGate(), "unknown");
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: workspace(),
    });
    assert.equal(result.status, "skipped");
    assert.equal(upserts.length, 0);
  });

  it("C. server fetch error → zéro upsert (reste UNKNOWN)", async () => {
    beginWorkspaceSnapshotHydration();
    assert.equal(getWorkspaceSnapshotSyncGate(), "unknown");
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: workspace({
        properties: [{ id: "prop-1", label: "Mon bien locatif", address: "", city: "", postalCode: "" }],
      }),
    });
    assert.equal(result.status, "skipped");
    assert.equal(upserts.length, 0);
  });

  it("D. future schema → zéro upsert", async () => {
    const decision = resolveWorkspaceHydration({
      local: workspace(),
      snapshots: [
        record({
          fiscalYear: 2025,
          schemaVersion: 2,
          payload: { schemaVersion: 2, workspace: workspace() },
        }),
      ],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "blocked");
    completeWorkspaceSnapshotHydration({
      blockWrites: true,
      dossierId: "dossier-A",
      fiscalYear: 2025,
    });
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: workspace(),
    });
    assert.equal(result.status, "skipped");
    assert.equal(upserts.length, 0);
  });

  it("E. corrupt existing snapshot → fail closed, zéro upsert, ligne conservée", async () => {
    const corrupt = { schemaVersion: 1, workspace: { broken: true } };
    memory.set("dossier-A:2025", record({ fiscalYear: 2025, payload: corrupt }));
    const decision = resolveWorkspaceHydration({
      local: null,
      snapshots: [record({ fiscalYear: 2025, payload: corrupt })],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "blocked");
    if (decision.source !== "blocked") return;
    assert.equal(decision.reason, "invalid_snapshot");
    completeWorkspaceSnapshotHydration({
      blockWrites: true,
      dossierId: "dossier-A",
      fiscalYear: 2025,
    });
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: workspace({
        properties: [{ id: "prop-1", label: "Mon bien locatif", address: "", city: "", postalCode: "" }],
      }),
    });
    assert.equal(result.status, "skipped");
    assert.equal(upserts.length, 0);
    assert.equal(memory.get("dossier-A:2025")?.payload, corrupt);
  });

  it("F. dossier A → B : aucun cross-save", async () => {
    completeWorkspaceSnapshotHydration({
      blockWrites: false,
      dossierId: "dossier-A",
      fiscalYear: 2025,
    });
    const fromA = workspace();
    const fromB = workspace({
      fiscalYear: { ...workspace().fiscalYear, dossierId: "dossier-B" },
      properties: [{ id: "prop-1", label: "B", address: "", city: "Marseille-B", postalCode: "" }],
    });
    const skipped = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-B",
      workspace: fromB,
    });
    assert.equal(skipped.status, "skipped");
    const ok = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: fromA,
    });
    assert.equal(ok.status, "ok");
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0]?.dossierId, "dossier-A");
  });

  it("G. exercice 2025 → 2026 : aucun état 2025 écrit sur 2026", async () => {
    const ws2026 = serializeWorkspaceSnapshot(
      workspace({
        fiscalYear: { ...workspace().fiscalYear, year: 2026, id: "fy-2026" },
        properties: [{ id: "prop-1", label: "2026", address: "", city: "Nantes-2026", postalCode: "" }],
      }),
    );
    assert.equal(ws2026.ok, true);
    if (!ws2026.ok) return;
    memory.set("dossier-A:2026", record({ fiscalYear: 2026, payload: ws2026.envelope, revision: 3 }));
    completeWorkspaceSnapshotHydration({
      blockWrites: false,
      dossierId: "dossier-A",
      fiscalYear: 2025,
    });
    const delayed2025AsIf2026 = workspace({
      fiscalYear: { ...workspace().fiscalYear, year: 2026, id: "fy-2026" },
      properties: [{ id: "prop-1", label: "stale-2025", address: "", city: "Lyon-STALE-2025", postalCode: "" }],
    });
    const skipped = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: delayed2025AsIf2026,
    });
    assert.equal(skipped.status, "skipped");
    assert.equal(upserts.length, 0);
    const parsed = parseWorkspaceSnapshot(memory.get("dossier-A:2026")?.payload);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.envelope.workspace.properties[0]?.city, "Nantes-2026");
  });

  it("G2. N+1 first upload (pas de ligne 2026) reste autorisé", async () => {
    completeWorkspaceSnapshotHydration({
      blockWrites: false,
      dossierId: "dossier-A",
      fiscalYear: 2025,
    });
    const nextYear = workspace({
      fiscalYear: { ...workspace().fiscalYear, year: 2026, id: "fy-2026" },
      properties: [{ id: "prop-1", label: "2026", address: "", city: "Nantes-2026", postalCode: "" }],
    });
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: nextYear,
    });
    assert.equal(result.status, "ok");
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0]?.fiscalYear, 2026);
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2026 });
  });

  it("H. logout/login user B → aucun save du workspace A sous B", async () => {
    completeWorkspaceSnapshotHydration({
      blockWrites: false,
      dossierId: "dossier-A",
      fiscalYear: 2025,
    });
    beginWorkspaceSnapshotHydration();
    const duringSwitch = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: workspace(),
    });
    assert.equal(duringSwitch.status, "skipped");
    completeWorkspaceSnapshotHydration({
      blockWrites: false,
      dossierId: "dossier-B",
      fiscalYear: 2025,
    });
    const afterB = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: workspace(),
    });
    assert.equal(afterB.status, "skipped");
    assert.equal(upserts.length, 0);
  });

  it("I. delayed save d'un ancien workspace → cible originale ou skip sûr", async () => {
    completeWorkspaceSnapshotHydration({
      blockWrites: false,
      dossierId: "dossier-A",
      fiscalYear: 2025,
    });
    completeWorkspaceSnapshotHydration({
      blockWrites: false,
      dossierId: "dossier-B",
      fiscalYear: 2025,
    });
    const delayedA = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: workspace(),
    });
    assert.equal(delayedA.status, "skipped");
    assert.equal(upserts.length, 0);
  });

  it("J. après hydrate READY, autosave normal fonctionne", async () => {
    completeWorkspaceSnapshotHydration({
      blockWrites: false,
      dossierId: "dossier-A",
      fiscalYear: 2025,
    });
    assert.equal(getWorkspaceSnapshotSyncGate(), "ready");
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2025 });
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: workspace(),
    });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.revision, 1);
    assert.equal(upserts[0]?.city, "Lyon-P0-Lot1");
  });

  it("K. local dirty recovery Lot 1 continue de fonctionner", async () => {
    const serverWs = workspace({
      properties: [{ id: "prop-1", label: "Studio Lot1", address: "", city: "Lyon-OLD", postalCode: "" }],
    });
    const localWs = workspace({
      properties: [{ id: "prop-1", label: "Studio Lot1", address: "", city: "Lyon-NEWER-EDIT", postalCode: "" }],
    });
    const serialized = serializeWorkspaceSnapshot(serverWs);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    const decision = resolveWorkspaceHydration({
      local: localWs,
      lastSyncedServerRevision: 1,
      snapshots: [record({ fiscalYear: 2025, revision: 1, payload: serialized.envelope })],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "local");
    if (decision.source !== "local") return;
    assert.equal(decision.uploadLocal, true);
    completeWorkspaceSnapshotHydration({
      blockWrites: false,
      dossierId: "dossier-A",
      fiscalYear: 2025,
    });
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: decision.workspace,
    });
    assert.equal(result.status, "ok");
    assert.equal(upserts[0]?.city, "Lyon-NEWER-EDIT");
  });

  it("READY sans scope (dossier, année) est refusé — reste UNKNOWN", async () => {
    setWorkspaceSnapshotSyncGate("ready");
    assert.equal(getWorkspaceSnapshotSyncGate(), "unknown");
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: workspace(),
    });
    assert.equal(result.status, "skipped");
    assert.equal(upserts.length, 0);
  });
});

function year2026(city: string): PersistedWorkspace {
  return workspace({
    fiscalYear: { ...workspace().fiscalYear, year: 2026, id: "fy-2026" },
    properties: [{ id: "prop-1", label: "2026", address: "", city, postalCode: "" }],
  });
}

describe("Lot 2 blocker — second save after other-year first upload", () => {
  const memory = new Map<string, WorkspaceSnapshotRecord>();
  let upserts: Array<{ fiscalYear: number; city?: string }> = [];
  let listError = false;
  let upsertError = false;
  let invalidRevision = false;

  beforeEach(() => {
    memory.clear();
    upserts = [];
    listError = false;
    upsertError = false;
    invalidRevision = false;
    __resetWorkspaceSnapshotSyncForTests();
    __setWorkspaceSnapshotStoreForTests({
      async listByDossier(dossierId) {
        if (listError) throw new Error("simulated list failure");
        return [...memory.values()].filter((row) => row.dossierId === dossierId);
      },
      async upsert(input) {
        if (upsertError) throw new Error("simulated upsert failure");
        if (invalidRevision) return { revision: 0 };
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
        const parsed = parseWorkspaceSnapshot(input.payload);
        upserts.push({
          fiscalYear: input.fiscalYear,
          city: parsed.ok ? parsed.envelope.workspace.properties[0]?.city : undefined,
        });
        return { revision: next.revision };
      },
    });
    completeWorkspaceSnapshotHydration({
      blockWrites: false,
      dossierId: "dossier-A",
      fiscalYear: 2025,
    });
  });

  it("BLOCKER: 3 saves A/2026 après first-upload — serveur final = state #3, gate = A/2026", async () => {
    const first = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: year2026("state-1"),
    });
    assert.equal(first.status, "ok");
    assert.equal(upserts.length, 1);
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2026 });

    const second = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: year2026("state-2"),
    });
    assert.equal(second.status, "ok");
    assert.equal(upserts.length, 2);

    const third = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: year2026("state-3"),
    });
    assert.equal(third.status, "ok");
    assert.equal(upserts.length, 3);
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2026 });

    const parsed = parseWorkspaceSnapshot(memory.get("dossier-A:2026")?.payload);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.envelope.workspace.properties[0]?.city, "state-3");
    assert.equal(memory.get("dossier-A:2026")?.revision, 3);
  });

  it("1. first-upload N+1 SUCCESS → gate devient N+1", async () => {
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: year2026("Nantes-2026"),
    });
    assert.equal(result.status, "ok");
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2026 });
  });

  it("2-3. second et third save N+1 autorisés", async () => {
    await saveWorkspaceSnapshotToServer({ dossierId: "dossier-A", workspace: year2026("s1") });
    const second = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: year2026("s2"),
    });
    const third = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: year2026("s3"),
    });
    assert.equal(second.status, "ok");
    assert.equal(third.status, "ok");
    assert.equal(upserts.length, 3);
  });

  it("4. listing N+1 ERROR → aucun upsert, gate reste N", async () => {
    listError = true;
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: year2026("should-not-write"),
    });
    assert.equal(result.status, "skipped");
    assert.equal(upserts.length, 0);
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2025 });
  });

  it("5. N+1 EXISTE déjà → aucun overwrite, gate reste N", async () => {
    const existing = serializeWorkspaceSnapshot(year2026("already-on-server"));
    assert.equal(existing.ok, true);
    if (!existing.ok) return;
    memory.set("dossier-A:2026", record({ fiscalYear: 2026, payload: existing.envelope, revision: 4 }));
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: year2026("local-newer"),
    });
    assert.equal(result.status, "skipped");
    assert.equal(upserts.length, 0);
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2025 });
    const parsed = parseWorkspaceSnapshot(memory.get("dossier-A:2026")?.payload);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.envelope.workspace.properties[0]?.city, "already-on-server");
  });

  it("6. N+1 CORROMPU → aucun overwrite, gate reste N", async () => {
    const corrupt = { schemaVersion: 1, workspace: { broken: true } };
    memory.set("dossier-A:2026", record({ fiscalYear: 2026, payload: corrupt }));
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: year2026("default-wipe"),
    });
    assert.equal(result.status, "skipped");
    assert.equal(upserts.length, 0);
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2025 });
    assert.equal(memory.get("dossier-A:2026")?.payload, corrupt);
  });

  it("7. N+1 FUTURE SCHEMA → aucun overwrite, gate reste N", async () => {
    memory.set(
      "dossier-A:2026",
      record({
        fiscalYear: 2026,
        schemaVersion: 2,
        payload: { schemaVersion: 2, workspace: year2026("future") },
      }),
    );
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: year2026("overwrite-v2"),
    });
    assert.equal(result.status, "skipped");
    assert.equal(upserts.length, 0);
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2025 });
    assert.equal(memory.get("dossier-A:2026")?.schemaVersion, 2);
  });

  it("8. first-upload N+1 UPSERT FAIL → gate reste N", async () => {
    upsertError = true;
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: year2026("fail"),
    });
    assert.equal(result.status, "error");
    assert.equal(upserts.length, 0);
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2025 });
  });

  it("9. réponse upsert invalide → gate reste N", async () => {
    invalidRevision = true;
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: year2026("invalid-rev"),
    });
    assert.equal(result.status, "error");
    assert.equal(memory.has("dossier-A:2026"), false);
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2025 });
  });

  it("10. autre dossier B → aucune transition vers B", async () => {
    const fromB = workspace({
      fiscalYear: { ...workspace().fiscalYear, year: 2026, dossierId: "dossier-B", id: "fy-2026" },
    });
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-B",
      workspace: fromB,
    });
    assert.equal(result.status, "skipped");
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2025 });
  });

  it("11. après transition N+1, ancien save N ne corrompt pas N+1 ni le scope", async () => {
    const n2025 = serializeWorkspaceSnapshot(workspace());
    assert.equal(n2025.ok, true);
    if (!n2025.ok) return;
    memory.set("dossier-A:2025", record({ fiscalYear: 2025, payload: n2025.envelope, revision: 2 }));
    await saveWorkspaceSnapshotToServer({ dossierId: "dossier-A", workspace: year2026("keep-me") });
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2026 });
    const staleN = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: workspace({
        properties: [{ id: "prop-1", label: "stale", address: "", city: "STALE-2025", postalCode: "" }],
      }),
    });
    assert.equal(staleN.status, "skipped");
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2026 });
    const parsed = parseWorkspaceSnapshot(memory.get("dossier-A:2026")?.payload);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.envelope.workspace.properties[0]?.city, "keep-me");
    const parsedN = parseWorkspaceSnapshot(memory.get("dossier-A:2025")?.payload);
    assert.equal(parsedN.ok, true);
    if (!parsedN.ok) return;
    assert.notEqual(parsedN.envelope.workspace.properties[0]?.city, "STALE-2025");
  });

  it("12. dirty recovery Lot 1 toujours vert", async () => {
    const serverWs = workspace({
      properties: [{ id: "prop-1", label: "Studio Lot1", address: "", city: "Lyon-OLD", postalCode: "" }],
    });
    const localWs = workspace({
      properties: [{ id: "prop-1", label: "Studio Lot1", address: "", city: "Lyon-NEWER-EDIT", postalCode: "" }],
    });
    const serialized = serializeWorkspaceSnapshot(serverWs);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    const decision = resolveWorkspaceHydration({
      local: localWs,
      lastSyncedServerRevision: 1,
      snapshots: [record({ fiscalYear: 2025, revision: 1, payload: serialized.envelope })],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "local");
    if (decision.source !== "local") return;
    assert.equal(decision.uploadLocal, true);
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: decision.workspace,
    });
    assert.equal(result.status, "ok");
    assert.equal(upserts[0]?.city, "Lyon-NEWER-EDIT");
    assert.deepEqual(getWorkspaceSnapshotReadyScope(), { dossierId: "dossier-A", fiscalYear: 2025 });
  });
});
