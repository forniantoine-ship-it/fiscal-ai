import { scopeMatchesWorkspace, v3ReturnHref, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import type { ConfirmedWorkspaceSaveResult, PersistedWorkspace } from "@/lib/lmnp/store/persistence";

export type V3CorrectionReturnOutcome = { status: "returning"; href: string } | { status: "error" };

/**
 * Reuses R12.1A's single confirmed-save mechanism for dirty workspaces. A
 * clean workspace returns without a server write. Both paths still require
 * the exact original scope and navigate to V3's fixed read route.
 */
export async function performV3CorrectionReturn(input: {
  scope: V3CorrectionScope;
  workspace: PersistedWorkspace;
  confirmWorkspaceSave: () => Promise<ConfirmedWorkspaceSaveResult>;
}): Promise<V3CorrectionReturnOutcome> {
  const save = await input.confirmWorkspaceSave();
  if (save.status === "failed") return { status: "error" };
  const href = v3ReturnHref({
    scope: input.scope, changed: save.status === "confirmed", save: save.status === "confirmed" ? save : undefined,
    scopeStillMatches: scopeMatchesWorkspace(input.scope, input.workspace),
  });
  return href ? { status: "returning", href } : { status: "error" };
}
