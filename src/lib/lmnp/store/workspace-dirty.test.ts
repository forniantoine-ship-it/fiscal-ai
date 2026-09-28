import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LmnpState } from "./reducer";
import type { TrackedWorkspace } from "./workspace-dirty";

// `./workspace-dirty` imports `./reducer`, which imports `./persistence`,
// which imports the real Supabase client at module scope. A static top-level
// import of any of them here would crash before this file can supply test
// env vars — same pattern as reducer-confirmation-invalidation.test.ts (P1-5.2).
async function modules() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const [persistence, workspaceDirty] = await Promise.all([
    import("./persistence"),
    import("./workspace-dirty"),
  ]);
  return { ...persistence, ...workspaceDirty };
}

async function initial(dossierId: string, userId = "user"): Promise<TrackedWorkspace> {
  const { createDefaultWorkspace, workspaceScopeKey } = await modules();
  const base = createDefaultWorkspace(new Date("2025-01-01"));
  const workspace: LmnpState = {
    ...base,
    fiscalYear: { ...base.fiscalYear, id: `${dossierId}-year`, dossierId, year: 2025 },
    fileRegistry: new Map(),
  };
  return {
    workspace, appliedActions: 0, incarnation: 0, version: 0, savedVersion: 0,
    scopeKey: workspaceScopeKey(userId, workspace),
  };
}

describe("workspace dirty authority", () => {
  it("hydrates clean and ignores technical reconstruction and read-only navigation", async () => {
    const { trackedWorkspaceReducer, workspaceCanPersist, workspaceIsDirty } = await modules();
    const apply = (state: TrackedWorkspace, action: Parameters<typeof trackedWorkspaceReducer>[1] & { type: "apply" }) =>
      trackedWorkspaceReducer(state, action);
    const start = await initial("A");
    const hydrated = apply(start, { type: "apply", userId: "user", action: {
      type: "HYDRATE", payload: start.workspace,
    } });
    assert.equal(workspaceIsDirty(hydrated), false);
    const mirrored = apply(hydrated, { type: "apply", userId: "user", action: {
      type: "JOURNEY_SYNC_PAID_FROM_SERVER", paidAt: "2025-01-02",
    } });
    assert.equal(workspaceIsDirty(mirrored), false);
    const cached = apply(mirrored, { type: "apply", userId: "user", action: {
      type: "REGISTER_FILE", documentId: "read-only-cache", file: new File(["cache"], "cache.txt"),
    } });
    assert.equal(workspaceIsDirty(cached), false);
    // Waiting, mounting, changing route/sessionStorage and unmounting dispatch
    // no business action, so each save entry point sees the same clean guard.
    assert.equal(workspaceCanPersist(cached, "user", true), false);
    assert.equal(workspaceCanPersist(cached, "user", false), false);
  });

  it("tracks only new persisted business data, including automatic results", async () => {
    const { trackedWorkspaceReducer, workspaceCanPersist, workspaceIsDirty } = await modules();
    const apply = (state: TrackedWorkspace, action: Parameters<typeof trackedWorkspaceReducer>[1] & { type: "apply" }) =>
      trackedWorkspaceReducer(state, action);
    const start = await initial("A");
    const action = { type: "DECLARATION_PATCH_DRAFT" as const, patch: { exploitantFirstName: "New" } };
    const first = apply(start, { type: "apply", userId: "user", action });
    assert.equal(workspaceIsDirty(first), true);
    assert.equal(workspaceCanPersist(first, "user", true), true);
    assert.equal(workspaceCanPersist(first, "other-user", true), false);
    const same = apply(first, { type: "apply", userId: "user", action });
    assert.equal(same.version, first.version);
    const saved = trackedWorkspaceReducer(same, {
      type: "server_confirmed", scopeKey: same.scopeKey!, incarnation: same.incarnation, version: same.version,
    });
    assert.equal(workspaceIsDirty(saved), false);
    assert.equal(saved.appliedActions, same.appliedActions);
    assert.equal(workspaceCanPersist(saved, "user", true), false);
    const changedAgain = apply(saved, { type: "apply", userId: "user", action: {
      type: "DECLARATION_PATCH_DRAFT", patch: { exploitantFirstName: "Later" },
    } });
    assert.equal(workspaceIsDirty(changedAgain), true);
    const olderSave = trackedWorkspaceReducer(changedAgain, {
      type: "server_confirmed", scopeKey: saved.scopeKey!, incarnation: saved.incarnation, version: saved.version,
    });
    assert.equal(workspaceIsDirty(olderSave), true);
  });

  it("keeps failures retryable and acknowledges only the exact workspace incarnation", async () => {
    const { trackedWorkspaceReducer, workspaceCanPersist, workspaceIsDirty } = await modules();
    const apply = (state: TrackedWorkspace, action: Parameters<typeof trackedWorkspaceReducer>[1] & { type: "apply" }) =>
      trackedWorkspaceReducer(state, action);
    const a = apply(await initial("A"), { type: "apply", userId: "user", action: {
      type: "DECLARATION_PATCH_DRAFT", patch: { exploitantFirstName: "A" },
    } });
    const b = await initial("B");
    assert.equal(workspaceIsDirty(a), true);
    assert.equal(workspaceIsDirty(b), false);
    assert.equal(workspaceCanPersist(a, "user", true), true);
    assert.equal(workspaceCanPersist(b, "user", true), false);
    const wrongScope = trackedWorkspaceReducer(a, {
      type: "server_confirmed", scopeKey: b.scopeKey!, incarnation: a.incarnation, version: a.version,
    });
    assert.equal(workspaceIsDirty(wrongScope), true);
    const bDirty = apply(b, { type: "apply", userId: "user", action: {
      type: "DECLARATION_PATCH_DRAFT", patch: { exploitantFirstName: "B" },
    } });
    const aSaved = trackedWorkspaceReducer(a, {
      type: "server_confirmed", scopeKey: a.scopeKey!, incarnation: a.incarnation, version: a.version,
    });
    assert.equal(workspaceIsDirty(aSaved), false);
    assert.equal(workspaceIsDirty(bDirty), true);
    assert.equal(workspaceCanPersist(aSaved, "user", true), false);
    assert.equal(workspaceCanPersist(bDirty, "user", true), true);
    const eligible = [a, bDirty].filter(state => workspaceCanPersist(state, "user", true));
    assert.deepEqual(eligible.map(state => state.scopeKey), [a.scopeKey, b.scopeKey]);
    assert.notEqual(a.scopeKey, b.scopeKey);
    const rehydrated = apply(aSaved, { type: "apply", userId: "user", action: {
      type: "HYDRATE", payload: aSaved.workspace,
    } });
    const newMutation = apply(rehydrated, { type: "apply", userId: "user", action: {
      type: "DECLARATION_PATCH_DRAFT", patch: { exploitantFirstName: "Again" },
    } });
    const staleAcknowledgement = trackedWorkspaceReducer(newMutation, {
      type: "server_confirmed", scopeKey: a.scopeKey!, incarnation: a.incarnation, version: a.version,
    });
    assert.equal(workspaceIsDirty(staleAcknowledgement), true);
  });
});
