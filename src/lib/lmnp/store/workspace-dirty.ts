import type { LmnpAction, LmnpState } from "./reducer";
import { lmnpReducer } from "./reducer";
import { toPersistedWorkspace } from "./workspace-snapshot";

/** One provider instance owns one hydrated workspace at a time. */
export type TrackedWorkspace = {
  workspace: LmnpState;
  appliedActions: number;
  incarnation: number;
  version: number;
  savedVersion: number;
  scopeKey: string | null;
};

export type TrackedWorkspaceAction =
  | { type: "apply"; action: LmnpAction; userId: string | null }
  | { type: "server_confirmed"; scopeKey: string; incarnation: number; version: number };

export function workspaceScopeKey(userId: string | null, state: LmnpState): string | null {
  if (!userId) return null;
  const year = state.fiscalYear;
  if (!year.id || !Number.isInteger(year.year)) return null;
  return JSON.stringify([userId, year.dossierId ?? null, year.id, year.year]);
}

const PERSISTED_KEYS = [
  "fiscalYear", "properties", "documents", "extractions", "validationItems",
  "ledgerEntries", "declarationDraft", "aiActivityFeed",
] as const;

function persistedBusinessChanged(before: LmnpState, after: LmnpState): boolean {
  const previous = toPersistedWorkspace(before);
  const next = toPersistedWorkspace(after);
  return PERSISTED_KEYS.some(key =>
    previous[key] !== next[key] && (
      key === "fiscalYear"
        // finalizeState touches this technical timestamp on every reducer call.
        // It must not turn a repeated/no-op business result into a save.
        ? JSON.stringify({ ...previous.fiscalYear, updatedAt: undefined }) !==
          JSON.stringify({ ...next.fiscalYear, updatedAt: undefined })
        : JSON.stringify(previous[key]) !== JSON.stringify(next[key])
    ));
}

export function trackedWorkspaceReducer(state: TrackedWorkspace, input: TrackedWorkspaceAction): TrackedWorkspace {
  if (input.type === "server_confirmed") {
    if (input.incarnation !== state.incarnation || input.scopeKey !== state.scopeKey ||
        input.version > state.version) return state;
    return { ...state, savedVersion: Math.max(state.savedVersion, input.version) };
  }

  const workspace = lmnpReducer(state.workspace, input.action);
  const scopeKey = workspaceScopeKey(input.userId, workspace);
  const appliedActions = state.appliedActions + 1;
  // These actions install or mirror already authoritative data. The two fiscal
  // transitions dispatch only after their dedicated server persistence succeeds.
  if (input.action.type === "HYDRATE" || input.action.type === "AUTH_SESSION_RESET" ||
      input.action.type === "CREATE_NEXT_FISCAL_YEAR" ||
      input.action.type === "CLOSE_FISCAL_YEAR_AND_CREATE_NEXT") {
    return { workspace, appliedActions, incarnation: state.incarnation + 1, version: 0, savedVersion: 0, scopeKey };
  }
  if (input.action.type === "REGISTER_FILE" || input.action.type === "JOURNEY_SYNC_PAID_FROM_SERVER") {
    return { ...state, workspace, appliedActions };
  }
  const changed = persistedBusinessChanged(state.workspace, workspace);
  return { ...state, workspace, appliedActions, scopeKey, version: state.version + (changed ? 1 : 0) };
}

export function workspaceIsDirty(state: TrackedWorkspace): boolean {
  return state.version > state.savedVersion;
}

export function workspaceCanPersist(state: TrackedWorkspace, userId: string | null, ready: boolean): boolean {
  return ready && workspaceIsDirty(state) && state.scopeKey !== null &&
    state.scopeKey === workspaceScopeKey(userId, state.workspace);
}
