import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { v3CorrectionActionFor } from "@/lab/v2-dossier/correction-registry";
import { v3OwnerHrefForResolvedScope, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import { buildV3UserActionReadModel, type V3UserActionReadModel } from "@/lab/v2-dossier/user-action-read-model";

/**
 * Real "Besoin de vous" actions with owner hrefs bound to the verified scope. Same scoping rules as the V2 real view:
 * without a resolved scope no zero-action claim is made (`unknown`), and an action whose href cannot be scoped is dropped.
 */
export function resolveRealUserActions(workspace: PersistedWorkspace, scope: V3CorrectionScope | null): V3UserActionReadModel {
  const raw = buildV3UserActionReadModel(workspace);
  return {
    state: scope ? raw.state : "unknown",
    actions: raw.actions.flatMap(action => {
      // F009's generic action targets the legacy href; redirect only that exact href to its V3-native route.
      const href = action.domain === "activite" && action.href === LMNP_ROUTES.activite
        ? (v3CorrectionActionFor("activity", scope)?.href ?? null)
        : v3OwnerHrefForResolvedScope(action.href, scope);
      return href ? [{ ...action, href }] : [];
    }),
  };
}
