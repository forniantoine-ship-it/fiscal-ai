import "fake-indexeddb/auto";
(globalThis as unknown as { window: unknown }).window = globalThis;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { LmnpDossier } from "@/lib/lmnp/dossier/supabase-dossier";
import { readExplicitDossierId } from "@/lib/lmnp/dossier/explicit-dossier-id";
import { loadRealWorkspace } from "@/lab/v2-dossier/real-workspace";
import { WORKSPACE_SNAPSHOT_SCHEMA_VERSION } from "./workspace-snapshot";
import {
  getScopedWorkspaceRecord, getWorkspaceRecord, peekScopedWorkspaceRecord,
  putScopedWorkspaceRecord, putWorkspaceRecord, stampScopedWorkspaceSyncedRevision,
  workspaceKeyForScope,
} from "./db";
import type { PersistedWorkspace } from "./persistence";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MISSING = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "multi-user";

function dossier(id: string, user_id = USER): LmnpDossier {
  return { id, user_id, status: "draft", city: null, lmnp_type: "réel", created_at: "2026-01-01", active_fiscal_year: 2025 };
}

function workspace(id: string, marker = id): PersistedWorkspace {
  return {
    fiscalYear: { id: `fy-${id}`, dossierId: id, year: 2025, status: "draft", regime: "reel", propertyIds: [], createdAt: "2025-01-01", updatedAt: "2025-01-01" },
    properties: [], documents: [], extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: { completedSteps: [], exploitantFirstName: marker },
  };
}

function readers() {
  let activeReads = 0;
  const dossiers = new Map([[A, dossier(A)], [B, dossier(B)]]);
  return {
    get activeReads() { return activeReads; },
    fetchDossier: async () => { activeReads++; return { status: "ok" as const, dossier: dossier(B) }; },
    fetchExactDossier: async (userId: string, id: string) => {
      const row = dossiers.get(id);
      return row?.user_id === userId ? { status: "ok" as const, dossier: row } : { status: "not_found" as const };
    },
    listSnapshots: async (id: string) => ({ status: "ok" as const, snapshots: [{
      dossierId: id, fiscalYear: 2025, schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
      revision: 1, updatedAt: "2026-01-01", payload: { schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION, workspace: workspace(id) },
    }] }),
    loadLocal: async () => ({ workspace: null }),
    fallbackYear: 2025,
  };
}

test("URL explicite A/B sélectionne exactement le dossier owned, jamais le plus récent", async () => {
  const io = readers();
  for (const id of [A, B]) {
    const result = await loadRealWorkspace(USER, io, id);
    assert.equal(result.status, "ready");
    if (result.status === "ready") assert.equal(result.dossierId, id);
  }
  assert.equal(io.activeReads, 0);
  assert.deepEqual(await loadRealWorkspace(USER, io, MISSING), { status: "no_dossier" });
  assert.deepEqual(await loadRealWorkspace(USER, io, "malformed"), { status: "no_dossier" });
  assert.equal(io.activeReads, 0);
  assert.equal((await loadRealWorkspace(USER, io)).status, "ready");
  assert.equal(io.activeReads, 1);
});

test("ownership et exercice discordant échouent avant tout workspace", async () => {
  const io = readers();
  io.fetchExactDossier = async () => ({ status: "ok" as const, dossier: dossier(B, "other-user") });
  assert.deepEqual(await loadRealWorkspace(USER, io, A), { status: "error" });
  const ambiguous = readers();
  ambiguous.listSnapshots = async (id: string) => ({ status: "ok" as const, snapshots: [2025, 2026].map(fiscalYear => ({
    dossierId: id, fiscalYear, schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    revision: 1, updatedAt: "2026-01-01", payload: { schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION, workspace: workspace(id) },
  })) });
  ambiguous.fetchExactDossier = async (_userId: string, id: string) => ({ status: "ok" as const, dossier: { ...dossier(id), active_fiscal_year: null } });
  assert.deepEqual(await loadRealWorkspace(USER, ambiguous, A), { status: "year_unavailable", reason: "ambiguous" });
});

test("URL valide ou invalide reste l'autorité, indépendamment de sessionStorage", () => {
  const params = new URLSearchParams(`dossierId=${A}`);
  assert.equal(readExplicitDossierId(params), A);
  assert.equal(readExplicitDossierId(new URLSearchParams(`dossierId=${A.toUpperCase()}`)), A);
  params.set("dossierId", B);
  assert.equal(readExplicitDossierId(params), B);
  assert.equal(readExplicitDossierId(new URLSearchParams()), undefined);
  assert.equal(readExplicitDossierId(new URLSearchParams("dossierId=invalid")), null);
  assert.equal(readExplicitDossierId(new URLSearchParams(`dossierId=${A}&dossierId=${B}`)), null);
});

test("deux onglets A/2025 et B/2025 gardent payloads et révisions séparés", async () => {
  const userId = `tab-user-${Date.now()}`;
  const scopeA = { userId, dossierId: A, fiscalYear: 2025 };
  const scopeB = { userId, dossierId: B, fiscalYear: 2025 };
  assert.notEqual(workspaceKeyForScope(scopeA), workspaceKeyForScope(scopeB));
  await putScopedWorkspaceRecord(scopeA, workspace(A, "WA"), { lastSyncedServerRevision: 1 });
  await putScopedWorkspaceRecord(scopeB, workspace(B, "WB"), { lastSyncedServerRevision: 7 });
  await putScopedWorkspaceRecord(scopeA, workspace(A, "WA modified"));
  await putScopedWorkspaceRecord(scopeB, workspace(B, "WB modified"));
  await stampScopedWorkspaceSyncedRevision(scopeA, 2);
  await stampScopedWorkspaceSyncedRevision(scopeB, 8);
  const a = await getScopedWorkspaceRecord(scopeA);
  const b = await getScopedWorkspaceRecord(scopeB);
  assert.equal((a?.data as PersistedWorkspace).declarationDraft?.exploitantFirstName, "WA modified");
  assert.equal((b?.data as PersistedWorkspace).declarationDraft?.exploitantFirstName, "WB modified");
  assert.equal(a?.lastSyncedServerRevision, 2);
  assert.equal(b?.lastSyncedServerRevision, 8);
  assert.equal(await getWorkspaceRecord(userId), undefined);
});

test("cache legacy prouvé est copié sans suppression ; cache ambigu est refusé", async () => {
  const certainUser = `certain-${Date.now()}`;
  await putWorkspaceRecord(certainUser, workspace(A, "legacy"), { lastSyncedServerRevision: 3 });
  const scope = { userId: certainUser, dossierId: A, fiscalYear: 2025 };
  assert.equal((await peekScopedWorkspaceRecord(scope))?.lastSyncedServerRevision, 3);
  assert.equal((await getScopedWorkspaceRecord(scope))?.lastSyncedServerRevision, 3);
  assert.ok(await getWorkspaceRecord(certainUser));
  assert.equal(await getScopedWorkspaceRecord({ ...scope, dossierId: B }), undefined);

  const ambiguousUser = `ambiguous-${Date.now()}`;
  const noIdentity = workspace(A);
  noIdentity.fiscalYear.dossierId = undefined;
  await putWorkspaceRecord(ambiguousUser, noIdentity);
  assert.equal(await getScopedWorkspaceRecord({ userId: ambiguousUser, dossierId: A, fiscalYear: 2025 }), undefined);
  assert.ok(await getWorkspaceRecord(ambiguousUser));
});

test("un fiscalYearId local discordant avec le snapshot exact bloque l'hydratation", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { reconcileLocalWorkspaceWithSnapshots } = await import("./persistence");
  const local = workspace(A);
  local.fiscalYear.id = "wrong-year-id";
  const decision = await reconcileLocalWorkspaceWithSnapshots({
    userId: `year-mismatch-${Date.now()}`,
    expectedDossierId: A,
    local,
    lastSyncedServerRevision: 1,
    snapshots: [{
      dossierId: A, fiscalYear: 2025, schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
      revision: 1, updatedAt: "2026-01-01",
      payload: { schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION, workspace: workspace(A) },
    }],
    fallbackYear: 2025,
    activeFiscalYear: 2025,
  });
  assert.deepEqual(decision, { source: "blocked", workspace: null, blockWrites: true, reason: "invalid_snapshot" });
});

test("gardes statiques : le chemin explicite n'utilise ni latest, ni ensure, ni clé user seule", () => {
  const gate = readFileSync(new URL("../../../components/lmnp/app-shell/ExplicitDossierScopeGate.tsx", import.meta.url), "utf8");
  const exact = readFileSync(new URL("../dossier/supabase-dossier.ts", import.meta.url), "utf8");
  const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  assert.doesNotMatch(gate, /ensureActiveDossier|fetchActiveDossierForUser|getCurrentDossierId/);
  assert.match(exact, /\.eq\("id", normalizedId\)[\s\S]*?\.eq\("user_id", userId\)/);
  assert.match(db, /user:\$\{scope\.userId\}:dossier:\$\{scope\.dossierId\}:year:\$\{scope\.fiscalYear\}/);
});
