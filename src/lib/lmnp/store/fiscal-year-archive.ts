/**
 * Lot 3 / Lot 6A — archive / history primitives (server snapshots).
 * V1: list closed years, load closed snapshot read-only, never autosave.
 * Lot 6A: UI "Mes déclarations" + archive page consume these helpers only —
 * never IndexedDB STORE_FISCAL_YEARS for cold-safe history.
 */
import { listWorkspaceSnapshots } from "@/lib/lmnp/store/workspace-snapshot-client";
import {
  resolveClosedArchiveSnapshotAccess,
  resolveWorkspaceHydration,
  type WorkspaceSnapshotRecord,
} from "@/lib/lmnp/store/workspace-snapshot-resolve";
import { parseWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { ArchivedLiasseDownloadRecord } from "@/lib/lmnp/services/declaration/resolve-archived-liasse-download";

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
  // Does NOT adopt this year as activeFiscalYear — local:null force-loads
  // the closed snapshot; callers must never dispatch the result into LmnpProvider.
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

/**
 * Lot 6A — map a closed server workspace to the archive download/view contract.
 * Pure: never reads IndexedDB, never invents version IDs.
 */
export function archivedLiasseRecordFromWorkspace(
  workspace: PersistedWorkspace,
): ArchivedLiasseDownloadRecord {
  return {
    year: workspace.fiscalYear.year,
    stocksOuverture: workspace.fiscalYear.stocksOuverture,
    closures: workspace.fiscalYear.closures,
    // Lot 5.3 — Opening externe pour la livraison serveur si EXTERNAL_HISTORY.
    externalTakeoverOpening: workspace.fiscalYear.externalTakeoverOpening,
    declarationDraft: workspace.declarationDraft ?? null,
  };
}

/**
 * Lot 6A — route param for `/declarations/[fiscalYearId]` is the calendar year
 * (server archive key), not an IndexedDB UUID.
 */
export function parseArchivedFiscalYearParam(raw: string): number | null {
  if (!/^\d{4}$/.test(raw.trim())) return null;
  const year = Number(raw.trim());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return year;
}
