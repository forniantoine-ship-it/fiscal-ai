import assert from "node:assert/strict";
import test from "node:test";
import type { LmnpDossier } from "@/lib/lmnp/dossier/supabase-dossier";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { WORKSPACE_SNAPSHOT_SCHEMA_VERSION } from "@/lib/lmnp/store/workspace-snapshot";
import type { WorkspaceSnapshotRecord } from "@/lib/lmnp/store/workspace-snapshot-resolve";
import { resolveV3Activity, resolveV3Amortization, resolveV3Charges, resolveV3Declaration, resolveV3Financing, resolveV3Property, resolveV3Revenue } from "./read-model";
import { loadRealWorkspace } from "./real-workspace";

const dossier: LmnpDossier = {
  id: "dossier-test", user_id: "user-test", status: "draft", city: null,
  lmnp_type: "réel", created_at: "2026-01-01", active_fiscal_year: 2026,
};

function workspace(): PersistedWorkspace {
  return {
    fiscalYear: { id: "year-2026", dossierId: dossier.id, year: 2026, status: "draft", regime: "reel", propertyIds: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    properties: [], documents: [], extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
  };
}

function snapshot(ws = workspace()): WorkspaceSnapshotRecord {
  return {
    dossierId: dossier.id, fiscalYear: 2026, schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    revision: 1, updatedAt: "2026-03-01", payload: { schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION, workspace: ws },
  };
}

function services(overrides: {
  dossier?: LmnpDossier | null;
  dossierError?: boolean;
  snapshots?: WorkspaceSnapshotRecord[];
  snapshotError?: boolean;
  local?: PersistedWorkspace | null;
  lastSyncedServerRevision?: number;
} = {}) {
  let reads = 0;
  return {
    get reads() { return reads; },
    fetchDossier: async () => {
      reads += 1;
      return overrides.dossierError ? { status: "error" as const }
        : (overrides.dossier === null ? { status: "not_found" as const }
          : { status: "ok" as const, dossier: overrides.dossier ?? dossier });
    },
    listSnapshots: async () => {
      reads += 1;
      return overrides.snapshotError ? { status: "error" as const }
        : { status: "ok" as const, snapshots: overrides.snapshots ?? [snapshot()] };
    },
    loadLocal: async () => {
      reads += 1;
      return { workspace: overrides.local ?? null, lastSyncedServerRevision: overrides.lastSyncedServerRevision };
    },
    fallbackYear: 2026,
  };
}

test("R8 — le dossier et l'exercice actifs produisent uniquement une source real", async () => {
  const io = services();
  const result = await loadRealWorkspace(dossier.user_id, io);
  assert.equal(result.status, "ready");
  assert.equal(io.reads, 3);
  if (result.status === "ready") {
    assert.equal(result.dossierId, dossier.id);
    assert.equal(result.fiscalYear, 2026);
    assert.equal(result.source, "server");
    assert.equal(result.workspace.fiscalYear.year, 2026);
  }
});

test("R12.1A — un brouillon local récent n'autorise la correction que si le snapshot serveur prouve le même périmètre", async () => {
  const server = workspace();
  server.fiscalYear.propertyIds = ["property-1"];
  server.properties = [{ id: "property-1", label: "Bien 1", address: "", city: "", postalCode: "" }];
  const local = structuredClone(server);
  local.declarationDraft = { completedSteps: ["identite"] };
  const confirmed = await loadRealWorkspace(dossier.user_id, services({
    snapshots: [snapshot(server)], local, lastSyncedServerRevision: 1,
  }));
  assert.equal(confirmed.status, "ready");
  if (confirmed.status === "ready") {
    assert.equal(confirmed.source, "local");
    assert.equal(confirmed.serverScopeVerified, true);
  }

  const foreign = structuredClone(server);
  foreign.fiscalYear.propertyIds = ["property-2"];
  foreign.properties = [{ ...server.properties[0], id: "property-2" }];
  const discordant = await loadRealWorkspace(dossier.user_id, services({
    snapshots: [snapshot(server)], local: foreign, lastSyncedServerRevision: 1,
  }));
  assert.equal(discordant.status, "ready");
  if (discordant.status === "ready") assert.equal(discordant.serverScopeVerified, false);
});

test("R10 — les preuves legacy restent bornées aux snapshots du même dossier et à leur exercice déclaré", async () => {
  const current = workspace();
  current.documents = [{
    id: "document-2026", fiscalYearId: current.fiscalYear.id, fileName: "piece.pdf",
    mimeType: "application/pdf", sizeBytes: 1, category: "autre", documentType: "unknown",
    status: "uploaded", uploadedAt: "2026-03-01",
  }];
  const foreign = workspace();
  foreign.fiscalYear.year = 2025;
  foreign.documents = [{ ...current.documents[0], id: "foreign-document" }];
  const result = await loadRealWorkspace(dossier.user_id, services({
    snapshots: [snapshot(current), { ...snapshot(foreign), fiscalYear: 2025 }],
  }));
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.userId, dossier.user_id);
    assert.deepEqual(result.legacyDocumentYears, [{ fiscalYear: 2026, documentIds: ["document-2026"] }, { fiscalYear: 2025, documentIds: ["foreign-document"] }]);
  }
});

test("R8 — sans compte ou dossier, aucune lecture de snapshot ni source demo", async () => {
  const io = services({ dossier: null });
  assert.deepEqual(await loadRealWorkspace(null, io), { status: "no_dossier" });
  assert.equal(io.reads, 0);
  assert.deepEqual(await loadRealWorkspace(dossier.user_id, io), { status: "no_dossier" });
  assert.equal(io.reads, 1);
});

test("R8 — erreurs du dossier et des snapshots fermées", async () => {
  assert.deepEqual(await loadRealWorkspace(dossier.user_id, services({ dossierError: true })), { status: "error" });
  assert.deepEqual(await loadRealWorkspace(dossier.user_id, services({ snapshotError: true })), { status: "error" });
});

test("R8 — exercice manquant, mauvais exercice, archive et payload incohérent refusés", async () => {
  const noYear = { ...dossier, active_fiscal_year: null };
  assert.deepEqual(await loadRealWorkspace(dossier.user_id, services({ dossier: noYear, snapshots: [] })), { status: "year_unavailable", reason: "not_selected" });
  assert.deepEqual(await loadRealWorkspace(dossier.user_id, services({ snapshots: [] })), { status: "year_unavailable", reason: "snapshot_missing" });
  assert.deepEqual(await loadRealWorkspace(dossier.user_id, services({ snapshots: [{ ...snapshot(), closedAt: "2026-12-31" }] })), { status: "year_unavailable", reason: "closed" });
  const closedLocal = workspace(); closedLocal.fiscalYear.status = "closed";
  assert.deepEqual(await loadRealWorkspace(dossier.user_id, services({ dossier: { ...dossier, active_fiscal_year: null }, snapshots: [], local: closedLocal })), { status: "year_unavailable", reason: "closed" });
  const wrongYear = workspace(); wrongYear.fiscalYear.year = 2025;
  assert.deepEqual(await loadRealWorkspace(dossier.user_id, services({ snapshots: [snapshot(wrongYear)] })), { status: "year_unavailable", reason: "mismatch" });
  const wrongDossier = workspace(); wrongDossier.fiscalYear.dossierId = "another-dossier";
  assert.deepEqual(await loadRealWorkspace(dossier.user_id, services({ snapshots: [snapshot(wrongDossier)] })), { status: "year_unavailable", reason: "mismatch" });
  assert.deepEqual(await loadRealWorkspace(dossier.user_id, services({ dossier: { ...dossier, user_id: "another-user" } })), { status: "error" });
  assert.deepEqual(await loadRealWorkspace(dossier.user_id, services({ snapshots: [{ ...snapshot(), payload: {} }] })), { status: "error" });
});

test("R8 — dossier legacy : le repli canonique lit le workspace local sans écriture", async () => {
  const local = workspace();
  const io = services({ dossier: { ...dossier, active_fiscal_year: null }, snapshots: [], local });
  const result = await loadRealWorkspace(dossier.user_id, io);
  assert.equal(result.status, "ready");
  assert.equal(io.reads, 3);
  if (result.status === "ready") assert.equal(result.workspace, local);
  if (result.status === "ready") assert.equal(result.source, "local");
});

test("R8.2 — NULL avec un seul snapshot 2025 reste lisible", async () => {
  const ws = workspace(); ws.fiscalYear.year = 2025; ws.fiscalYear.id = "year-2025";
  const row = { ...snapshot(ws), fiscalYear: 2025 };
  const io = services({ dossier: { ...dossier, active_fiscal_year: null }, snapshots: [row] });
  const result = await loadRealWorkspace(dossier.user_id, io);
  assert.equal(result.status, "ready");
  assert.equal(io.reads, 3);
  if (result.status === "ready") {
    assert.equal(result.fiscalYear, 2025);
    assert.equal(result.source, "server");
  }
});

test("R8.2 — V3 REAL refuse deux années ouvertes sans exposer de workspace ni de fixture", async () => {
  const ws2025 = workspace(); ws2025.fiscalYear.year = 2025; ws2025.fiscalYear.id = "year-2025";
  const row2025 = { ...snapshot(ws2025), fiscalYear: 2025 };
  const io = services({ dossier: { ...dossier, active_fiscal_year: null }, snapshots: [row2025, snapshot()] });
  const result = await loadRealWorkspace(dossier.user_id, io);
  assert.deepEqual(result, { status: "year_unavailable", reason: "ambiguous" });
  assert.equal(io.reads, 3);
  assert.equal("workspace" in result, false);
});

test("R8.2 — V3 REAL refuse un pointeur sans snapshot même avec un cache local", async () => {
  const ws2025 = workspace(); ws2025.fiscalYear.year = 2025; ws2025.fiscalYear.id = "year-2025";
  const io = services({ snapshots: [], local: ws2025 });
  assert.deepEqual(await loadRealWorkspace(dossier.user_id, io), { status: "year_unavailable", reason: "snapshot_missing" });
});

test("R8 — workspace partiel et sans fiscalResult : six projections stables, aucun zéro inventé", async () => {
  const result = await loadRealWorkspace(dossier.user_id, services());
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  const source = { mode: "real" as const, workspace: result.workspace };
  const domains = [resolveV3Activity(source), resolveV3Property(source), resolveV3Financing(source), resolveV3Revenue(source), resolveV3Charges(source), resolveV3Amortization(source)];
  assert.equal(domains.length, 6);
  assert.ok(domains.every(domain => domain && domain.facts.every(fact => fact.value === null || !fact.value.includes("140 000 €"))));
  const declaration = resolveV3Declaration(source);
  assert.equal(declaration?.status, "unavailable");
  assert.equal(declaration?.freshness, "unknown");
  assert.ok(declaration?.facts.every(fact => fact.value === null));
});

test("R8 — multi-biens : le garde unsupported reste actif", async () => {
  const ws = workspace();
  ws.properties = [
    { id: "p1", label: "Bien 1", address: "", city: "", postalCode: "" },
    { id: "p2", label: "Bien 2", address: "", city: "", postalCode: "" },
  ];
  const result = await loadRealWorkspace(dossier.user_id, services({ snapshots: [snapshot(ws)] }));
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(resolveV3Property({ mode: "real", workspace: result.workspace })?.status, "unsupported");
});

test("R8 — un résultat persisté sans signal de fraîcheur reste stale", async () => {
  const ws = workspace();
  ws.declarationDraft = { completedSteps: [], fiscalResult: {
    exercice: 2026, resultatFiscal: 0, resultatAvantAmort: 0, totalRecettes: 0, totalCharges: 0,
    amortDeduct: 0, amortReporte: 0, amortNonDeduitExercice: 0, deficitNouveau: 0,
    stocks: { deficits: [], amortissementsReportes: 0 },
    trace: { ksArtifacts: [], computedAt: "2026-03-01", journal: [] }, computedAt: "2026-03-01",
  } };
  const result = await loadRealWorkspace(dossier.user_id, services({ snapshots: [snapshot(ws)] }));
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  const declaration = resolveV3Declaration({ mode: "real", workspace: result.workspace });
  assert.equal(declaration?.freshness, "stale");
  assert.ok(declaration?.facts.some(fact => fact.id === "resultatFiscal" && fact.value === "0 €"));
});
