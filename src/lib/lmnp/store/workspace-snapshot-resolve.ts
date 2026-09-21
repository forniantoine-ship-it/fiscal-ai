/**
 * P0 Lot 1 — pure hydration decision for (dossier, fiscal year) snapshots.
 * No I/O. No CRDT / field merge.
 *
 * Freshness proof is `lastSyncedServerRevision` persisted next to the IndexedDB
 * workspace (not a client timestamp, not the server revision counter alone):
 *
 * - absent / invalid = LEGACY cache (never recorded a successful server sync).
 *   Server row present → SERVER (a default/empty local cannot beat a snapshot).
 *   Server row absent → LOCAL + first upload (a rich legacy workspace is kept).
 * - present = this local cache was hydrated from, or saved as, that server revision.
 *   Local mutation does not bump it. A successful server save does.
 *   Same server revision + different content → unsynced local edits: keep LOCAL + repush.
 *   Greater server revision → SERVER.
 */
import type { PersistedWorkspace } from "./persistence";
import { parseWorkspaceSnapshot, serializeWorkspaceSnapshot } from "./workspace-snapshot";

export type WorkspaceSnapshotRecord = {
  dossierId: string;
  fiscalYear: number;
  schemaVersion: number;
  revision: number;
  payload: unknown;
  updatedAt: string;
  /** Lot 3 — when set, snapshot is closed server-side; autosave must not write. */
  closedAt?: string | null;
  successorFiscalYear?: number | null;
};

export type WorkspaceHydrationDecision =
  | {
      source: "server";
      workspace: PersistedWorkspace;
      blockWrites: boolean;
      lastSyncedServerRevision: number;
    }
  | { source: "local"; workspace: PersistedWorkspace; blockWrites: false; uploadLocal: boolean }
  | { source: "none"; workspace: null; blockWrites: false }
  | {
      source: "blocked";
      workspace: PersistedWorkspace | null;
      blockWrites: true;
      reason: "unsupported_schema_version" | "invalid_snapshot" | "closed_archive";
      schemaVersion?: number;
    };

export function normalizeLastSyncedServerRevision(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) return value;
  return undefined;
}

function workspacesAreEquivalent(
  left: PersistedWorkspace,
  right: PersistedWorkspace,
): boolean {
  const a = serializeWorkspaceSnapshot(left);
  const b = serializeWorkspaceSnapshot(right);
  if (!a.ok || !b.ok) return false;
  return JSON.stringify(a.envelope.workspace) === JSON.stringify(b.envelope.workspace);
}

/**
 * Lot 3 — year selection for hydrate.
 * Priority: server active fiscal year (when snapshot exists) → local cache →
 * civil fallbackYear → most recently updated snapshot.
 * `activeFiscalYear` absent/null keeps legacy Lot 1/P0 behaviour.
 */
export function pickTargetYear(
  local: PersistedWorkspace | null,
  snapshots: WorkspaceSnapshotRecord[],
  fallbackYear: number,
  activeFiscalYear?: number | null,
): number | null {
  if (
    typeof activeFiscalYear === "number" &&
    Number.isInteger(activeFiscalYear) &&
    snapshots.some((row) => row.fiscalYear === activeFiscalYear)
  ) {
    return activeFiscalYear;
  }
  if (local) return local.fiscalYear.year;
  if (snapshots.some((row) => row.fiscalYear === fallbackYear)) return fallbackYear;
  if (snapshots.length === 0) return null;
  return [...snapshots].sort((a, b) => {
    const byTime = b.updatedAt.localeCompare(a.updatedAt);
    if (byTime !== 0) return byTime;
    return b.fiscalYear - a.fiscalYear;
  })[0].fiscalYear;
}

/** Archive primitive: closed server snapshot may be loaded read-only. */
export function resolveClosedArchiveSnapshotAccess(
  snapshot: WorkspaceSnapshotRecord | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!snapshot) return { ok: false, reason: "Exercice introuvable sur le serveur." };
  if (snapshot.closedAt == null) {
    return { ok: false, reason: "Cet exercice n'est pas une archive fermée." };
  }
  return { ok: true };
}

export function resolveWorkspaceHydration(input: {
  local: PersistedWorkspace | null;
  lastSyncedServerRevision?: number | null;
  snapshots: WorkspaceSnapshotRecord[];
  fallbackYear: number;
  /** Lot 3 — server-authoritative active year when present. */
  activeFiscalYear?: number | null;
}): WorkspaceHydrationDecision {
  const { local, snapshots, fallbackYear } = input;
  const lastSynced = normalizeLastSyncedServerRevision(input.lastSyncedServerRevision);
  const year = pickTargetYear(local, snapshots, fallbackYear, input.activeFiscalYear);
  const snapshot = year == null ? undefined : snapshots.find((row) => row.fiscalYear === year);
  const isClosedArchive = snapshot?.closedAt != null;

  if (snapshot) {
    const parsed = parseWorkspaceSnapshot(snapshot.payload);
    if (parsed.ok === false && parsed.reason === "unsupported_schema_version") {
      return {
        source: "blocked",
        workspace: local,
        blockWrites: true,
        reason: "unsupported_schema_version",
        schemaVersion: parsed.schemaVersion ?? snapshot.schemaVersion,
      };
    }
    if (parsed.ok) {
      const serverWorkspace = parsed.envelope.workspace;
      const serverDecision = {
        source: "server" as const,
        workspace: serverWorkspace,
        blockWrites: isClosedArchive,
        lastSyncedServerRevision: snapshot.revision,
      };
      if (isClosedArchive) {
        // Closed N must never autosave — even if a stale local cache differs.
        return serverDecision;
      }
      if (local && lastSynced != null && local.fiscalYear.year === year) {
        if (snapshot.revision > lastSynced) return serverDecision;
        if (!workspacesAreEquivalent(local, serverWorkspace)) {
          return { source: "local", workspace: local, blockWrites: false, uploadLocal: true };
        }
      }
      return serverDecision;
    }
    return {
      source: "blocked",
      workspace: local,
      blockWrites: true,
      reason: "invalid_snapshot",
      schemaVersion: parsed.schemaVersion ?? snapshot.schemaVersion,
    };
  }

  if (local) {
    return { source: "local", workspace: local, blockWrites: false, uploadLocal: true };
  }
  return { source: "none", workspace: null, blockWrites: false };
}
