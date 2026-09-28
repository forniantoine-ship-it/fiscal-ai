import { scopeMatchesWorkspace, v3ReturnHref, type ConfirmedSave, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

export type V3CorrectionReturnOutcome = { status: "returning"; href: string } | { status: "error" };

/**
 * Reuses R12.1A's single confirmed-save mechanism (never a second persistence
 * path) then returns to V3's fixed route only if the scope still matches the
 * just-saved workspace — a failed save or a drifted scope both surface as an
 * explicit error, never a silent "as if it worked" return.
 */
export async function performV3CorrectionReturn(input: {
  scope: V3CorrectionScope;
  workspace: PersistedWorkspace;
  confirmWorkspaceSave: () => Promise<ConfirmedSave>;
}): Promise<V3CorrectionReturnOutcome> {
  const save = await input.confirmWorkspaceSave();
  if (save.status !== "confirmed") return { status: "error" };
  const href = v3ReturnHref({
    scope: input.scope, changed: true, save,
    scopeStillMatches: scopeMatchesWorkspace(input.scope, input.workspace),
  });
  return href ? { status: "returning", href } : { status: "error" };
}
