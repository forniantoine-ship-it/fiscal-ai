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
      reason: "unsupported_schema_version" | "invalid_snapshot" | "closed_archive" | "ambiguous_fiscal_year" | "active_snapshot_missing";
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

export type TargetFiscalYear =
  | { status: "resolved"; year: number }
  | { status: "no_year" }
  | { status: "ambiguous"; reason: "multiple_candidates" | "active_snapshot_missing" };

/** A closed server year is an archive, even when an older local cache calls it open. */
function activeLocalCandidate(local: PersistedWorkspace | null, snapshots: WorkspaceSnapshotRecord[]): PersistedWorkspace | null {
  if (!local || local.fiscalYear.status === "closed") return null;
  if (snapshots.some(row => row.fiscalYear === local.fiscalYear.year && row.closedAt != null)) return null;
  return local;
}

/**
 * One shared active-year decision for product hydration and V3 REAL. A pointer
 * requires its snapshot; without a pointer, only distinct open years are
 * candidates. Closed snapshots remain available through the archive route.
 */
export function pickTargetYear(
  local: PersistedWorkspace | null,
  snapshots: WorkspaceSnapshotRecord[],
  _fallbackYear: number,
  activeFiscalYear?: number | null,
): TargetFiscalYear {
  if (activeFiscalYear != null) {
    return snapshots.some(row => row.fiscalYear === activeFiscalYear)
      ? { status: "resolved", year: activeFiscalYear }
      : { status: "ambiguous", reason: "active_snapshot_missing" };
  }
  const candidates = new Set(snapshots.filter(row => row.closedAt == null).map(row => row.fiscalYear));
  const localCandidate = activeLocalCandidate(local, snapshots);
  if (localCandidate) candidates.add(localCandidate.fiscalYear.year);
  if (candidates.size === 0) return { status: "no_year" };
  if (candidates.size > 1) return { status: "ambiguous", reason: "multiple_candidates" };
  return { status: "resolved", year: candidates.values().next().value as number };
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
  const target = pickTargetYear(local, snapshots, fallbackYear, input.activeFiscalYear);
  if (target.status === "ambiguous") {
    return { source: "blocked", workspace: null, blockWrites: true,
      reason: target.reason === "multiple_candidates" ? "ambiguous_fiscal_year" : "active_snapshot_missing" };
  }
  if (target.status === "no_year") return { source: "none", workspace: null, blockWrites: false };
  const year = target.year;
  const snapshot = snapshots.find((row) => row.fiscalYear === year);
  const isClosedArchive = snapshot?.closedAt != null;
  const activeLocal = activeLocalCandidate(local, snapshots);

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
      if (activeLocal && lastSynced != null && activeLocal.fiscalYear.year === year) {
        if (snapshot.revision > lastSynced) return serverDecision;
        if (!workspacesAreEquivalent(activeLocal, serverWorkspace)) {
          return { source: "local", workspace: activeLocal, blockWrites: false, uploadLocal: true };
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

  if (activeLocal) {
    return { source: "local", workspace: activeLocal, blockWrites: false, uploadLocal: true };
  }
  return { source: "none", workspace: null, blockWrites: false };
}
