import "fake-indexeddb/auto";
(globalThis as unknown as { window: unknown }).window = globalThis;

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { scopeMatchesWorkspace, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import type { LmnpAction, LmnpState } from "./reducer";
import { toPersistedWorkspace } from "./workspace-snapshot";
import {
  __resetWorkspaceSnapshotSyncForTests, __setWorkspaceSnapshotStoreForTests,
  setWorkspaceSnapshotSyncGate,
} from "./workspace-snapshot-client";
import type { TrackedWorkspace } from "./workspace-dirty";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const A1 = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const B1 = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
const USER = "scope-write-user";

const session = new Map<string, string>();
(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: key => session.get(key) ?? null,
  setItem: (key, value) => { session.set(key, value); },
  removeItem: key => { session.delete(key); },
  clear: () => { session.clear(); },
  key: index => [...session.keys()][index] ?? null,
  get length() { return session.size; },
} as Storage;

type Write = { dossierId: string; year: number; payload: unknown; revision: number };
const writes: Write[] = [];
const revisions = new Map<string, number>();
__setWorkspaceSnapshotStoreForTests({
  async listByDossier() { return []; },
  async upsert(input) {
    const key = `${input.dossierId}:${input.fiscalYear}`;
    const revision = (revisions.get(key) ?? 0) + 1;
    revisions.set(key, revision);
    writes.push({ dossierId: input.dossierId, year: input.fiscalYear, payload: input.payload, revision });
    return { revision };
  },
});
after(() => __resetWorkspaceSnapshotSyncForTests());

// `./persistence`, `./workspace-dirty` (via `./reducer`) and `@/lib/uploadDocument`
// all import the real Supabase client at module scope. A static top-level
// import of any of them here would crash before this file can supply test env
// vars — same pattern as reducer-confirmation-invalidation.test.ts (P1-5.2).
async function modules() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const [persistence, workspaceDirty, uploadDocument, currentDossier] = await Promise.all([
    import("./persistence"),
    import("./workspace-dirty"),
    import("@/lib/uploadDocument"),
    import("@/lib/lmnp/dossier/current-dossier"),
  ]);
  return { ...persistence, ...workspaceDirty, ...uploadDocument, ...currentDossier };
}

async function makeTab(dossierId: string, propertyId: string | null): Promise<{ scope: V3CorrectionScope; tracked: TrackedWorkspace }> {
  const { createDefaultWorkspace, workspaceScopeKey } = await modules();
  const base = createDefaultWorkspace(new Date("2025-01-01"));
  const workspace: LmnpState = {
    ...base,
    fiscalYear: { ...base.fiscalYear, id: `fy-${dossierId}`, dossierId, year: 2025,
      propertyIds: propertyId ? [propertyId] : [] },
    properties: propertyId ? [{ id: propertyId, label: "", address: "", city: "", postalCode: "" }] : [],
    fileRegistry: new Map(),
  };
  const scope: V3CorrectionScope = { dossierId, fiscalYearId: workspace.fiscalYear.id, year: 2025,
    property: propertyId ? { kind: "required", propertyId } : { kind: "not_applicable" } };
  return { scope, tracked: { workspace, appliedActions: 0, incarnation: 0, version: 0, savedVersion: 0,
    scopeKey: workspaceScopeKey(USER, workspace) } };
}

async function mutate(tab: TrackedWorkspace, action: LmnpAction): Promise<TrackedWorkspace> {
  const { trackedWorkspaceReducer } = await modules();
  return trackedWorkspaceReducer(tab, { type: "apply", action, userId: USER });
}

async function persist(scope: V3CorrectionScope, tracked: TrackedWorkspace): Promise<number> {
  const { saveWorkspace, workspaceCanPersist } = await modules();
  const snapshot = toPersistedWorkspace(tracked.workspace);
  assert.equal(scopeMatchesWorkspace(scope, snapshot), true);
  assert.equal(workspaceCanPersist(tracked, USER, true), true);
  setWorkspaceSnapshotSyncGate("ready", { dossierId: scope.dossierId, fiscalYear: scope.year });
  const before = writes.length;
  let confirmed = 0;
  await saveWorkspace(USER, snapshot, revision => { confirmed = revision; });
  assert.equal(writes.length, before + 1, "one synthetic server write");
  const saved = writes.at(-1)!;
  assert.equal(saved.dossierId, scope.dossierId);
  assert.equal(saved.year, scope.year);
  assert.equal((saved.payload as { workspace: { fiscalYear: { dossierId: string; id: string } } }).workspace.fiscalYear.dossierId, scope.dossierId);
  assert.equal((saved.payload as { workspace: { fiscalYear: { dossierId: string; id: string } } }).workspace.fiscalYear.id, scope.fiscalYearId);
  assert.equal(confirmed, saved.revision);
  return confirmed;
}

const ownerActions: readonly [string, LmnpAction, boolean][] = [
  ["F009", { type: "DECLARATION_PATCH_DRAFT", patch: { exploitantFirstName: "F009 changed" } }, false],
  ["F010", { type: "DECLARATION_COMPLETE_STEP", stepId: "logement-assistant" }, true],
  ["F011", { type: "DECLARATION_COMPLETE_STEP", stepId: "financement-assistant" }, true],
  ["F012", { type: "DECLARATION_COMPLETE_STEP", stepId: "charges-assistant" }, true],
  ["F013", { type: "DECLARATION_COMPLETE_STEP", stepId: "revenus-assistant" }, true],
  ["F014", { type: "DECLARATION_COMPLETE_STEP", stepId: "amortissement-assistant" }, true],
];

test("F009–F014 : mutation persistable A/B et pointeur global B gardent la cible serveur exacte", async () => {
  const { trackedWorkspaceReducer, workspaceIsDirty, setCurrentDossierId } = await modules();
  for (const [owner, action, needsProperty] of ownerActions) {
    for (const [dossierId, propertyId] of [[A, A1], [B, B1], [A, A1]] as const) {
      const tab = await makeTab(dossierId, needsProperty ? propertyId : null);
      const changed = await mutate(tab.tracked, action);
      assert.equal(workspaceIsDirty(changed), true, owner);
      setCurrentDossierId(B, USER);
      const revision = await persist(tab.scope, changed);
      assert.ok(revision > 0, owner);
      const clean = trackedWorkspaceReducer(changed, { type: "server_confirmed",
        scopeKey: changed.scopeKey!, incarnation: changed.incarnation, version: changed.version });
      assert.equal(workspaceIsDirty(clean), false, owner);
    }
  }
});

test("property B1 dans A est refusée ; F009 sans bien reste légitime", async () => {
  const a = await makeTab(A, A1);
  const wrong = { ...a.scope, property: { kind: "required" as const, propertyId: B1 } };
  assert.equal(scopeMatchesWorkspace(wrong, toPersistedWorkspace(a.tracked.workspace)), false);
  const noProperty = await makeTab(A, null);
  assert.equal(scopeMatchesWorkspace(noProperty.scope, toPersistedWorkspace(noProperty.tracked.workspace)), true);
});

test("Documents et upload A/B : snapshot et ligne serveur gardent le dossier malgré le pointeur B", async () => {
  const { workspaceIsDirty, resolveUploadDossierId, documentInsertForUpload, setCurrentDossierId } = await modules();
  for (const [dossierId, propertyId] of [[A, A1], [B, B1]] as const) {
    const tab = await makeTab(dossierId, propertyId);
    const documentId = `document-${dossierId}`;
    const filePath = `synthetic/${documentId}`;
    const file = new File(["synthetic"], "synthetic.pdf", { type: "application/pdf" });
    const changed = await mutate(tab.tracked, { type: "UPLOAD_DOCUMENTS", files: [{
      file, category: "charges", documentId, isSupabaseDocumentId: true, storagePath: filePath,
      fiscalYear: 2025,
    }] });
    assert.equal(workspaceIsDirty(changed), true);
    setCurrentDossierId(B, USER);
    await persist(tab.scope, changed);
    const selected = resolveUploadDossierId(dossierId, () => B);
    const row = documentInsertForUpload({ userId: USER, dossierId: selected!, fileName: "synthetic.pdf",
      filePath, fiscalYear: 2025, documentRole: "annual_evidence", propertyId });
    assert.equal(row.dossier_id, dossierId);
    assert.equal(row.property_id, propertyId);
    const saved = writes.at(-1)!.payload as { workspace: { documents: { id: string; storagePath?: string }[] } };
    assert.equal(saved.workspace.documents[0]?.id, documentId);
    assert.equal(saved.workspace.documents[0]?.storagePath, filePath);
  }
});

test("deux onglets F011 A / F013 B : dirty, revisions et confirmations restent indépendants", async () => {
  const { trackedWorkspaceReducer, workspaceIsDirty } = await modules();
  const a = await mutate((await makeTab(A, A1)).tracked, { type: "DECLARATION_COMPLETE_STEP", stepId: "financement-assistant" });
  const b = await mutate((await makeTab(B, B1)).tracked, { type: "DECLARATION_COMPLETE_STEP", stepId: "revenus-assistant" });
  assert.equal(workspaceIsDirty(a), true);
  assert.equal(workspaceIsDirty(b), true);
  const beforeA = revisions.get(`${A}:2025`) ?? 0;
  const beforeB = revisions.get(`${B}:2025`) ?? 0;
  const confirmedA = await persist((await makeTab(A, A1)).scope, a);
  const cleanA = trackedWorkspaceReducer(a, { type: "server_confirmed", scopeKey: a.scopeKey!,
    incarnation: a.incarnation, version: a.version });
  assert.equal(workspaceIsDirty(cleanA), false);
  assert.equal(workspaceIsDirty(b), true);
  assert.equal(revisions.get(`${B}:2025`), beforeB);
  const confirmedB = await persist((await makeTab(B, B1)).scope, b);
  const cleanB = trackedWorkspaceReducer(b, { type: "server_confirmed", scopeKey: b.scopeKey!,
    incarnation: b.incarnation, version: b.version });
  assert.equal(workspaceIsDirty(cleanB), false);
  assert.equal(confirmedA, beforeA + 1);
  assert.equal(confirmedB, beforeB + 1);
  assert.notEqual(a.scopeKey, b.scopeKey);
});
