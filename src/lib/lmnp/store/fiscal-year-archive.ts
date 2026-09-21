/**
 * Lot 3 — archive / history primitives (server snapshots).
 * V1: list closed years, load closed snapshot read-only, never autosave.
 */
import { listWorkspaceSnapshots } from "@/lib/lmnp/store/workspace-snapshot-client";
import {
  resolveClosedArchiveSnapshotAccess,
  resolveWorkspaceHydration,
  type WorkspaceSnapshotRecord,
} from "@/lib/lmnp/store/workspace-snapshot-resolve";
import { parseWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

export type ArchivedFiscalYearSummary = {
  fiscalYear: number;
  closedAt: string;
  revision: number;
  successorFiscalYear: number | null;
};

export async function listClosedFiscalYearArchives(
  dossierId: string,
): Promise<{ status: "ok"; archives: ArchivedFiscalYearSummary[] } | { status: "error" }> {
  const listed = await listWorkspaceSnapshots(dossierId);
  if (listed.status !== "ok") return { status: "error" };
  const archives = listed.snapshots
    .filter((row): row is WorkspaceSnapshotRecord & { closedAt: string } => row.closedAt != null)
    .map((row) => ({
      fiscalYear: row.fiscalYear,
      closedAt: row.closedAt,
      revision: row.revision,
      successorFiscalYear: row.successorFiscalYear ?? null,
    }))
    .sort((a, b) => b.fiscalYear - a.fiscalYear);
  return { status: "ok", archives };
}

export type LoadArchivedWorkspaceResult =
  | {
      status: "ok";
      workspace: PersistedWorkspace;
      /** Always true — callers must not enable autosave. */
      readOnly: true;
      blockWrites: true;
      revision: number;
    }
  | { status: "error"; reason: string };

export async function loadArchivedWorkspaceFromServer(input: {
  dossierId: string;
  fiscalYear: number;
  snapshots?: WorkspaceSnapshotRecord[];
}): Promise<LoadArchivedWorkspaceResult> {
  let snapshots = input.snapshots;
  if (!snapshots) {
    const listed = await listWorkspaceSnapshots(input.dossierId);
    if (listed.status !== "ok") {
      return { status: "error", reason: "Impossible de charger les exercices archivés." };
    }
    snapshots = listed.snapshots;
  }
  const snapshot = snapshots.find((row) => row.fiscalYear === input.fiscalYear);
  const access = resolveClosedArchiveSnapshotAccess(snapshot);
  if (!access.ok || !snapshot) {
    return { status: "error", reason: access.ok ? "Exercice introuvable." : access.reason };
  }
  const parsed = parseWorkspaceSnapshot(snapshot.payload);
  if (!parsed.ok) {
    return { status: "error", reason: "Snapshot d'archive illisible." };
  }
  // Prove hydrate path would also block writes for this closed year.
  const decision = resolveWorkspaceHydration({
    local: null,
    snapshots: [snapshot],
    fallbackYear: input.fiscalYear,
    activeFiscalYear: input.fiscalYear,
  });
  if (!decision.blockWrites) {
    return { status: "error", reason: "Archive non protégée en écriture." };
  }
  return {
    status: "ok",
    workspace: parsed.envelope.workspace,
    readOnly: true,
    blockWrites: true,
    revision: snapshot.revision,
  };
}
