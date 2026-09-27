import type { LmnpDossier } from "@/lib/lmnp/dossier/supabase-dossier";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { lastClosedFiscalYear } from "@/lib/lmnp/services/payment/fiscal-year-closure";
import { isValidPersistedWorkspace } from "@/lib/lmnp/store/workspace-snapshot";
import { pickTargetYear, resolveWorkspaceHydration, type WorkspaceSnapshotRecord } from "@/lib/lmnp/store/workspace-snapshot-resolve";

export type RealWorkspaceLoad =
  | { status: "ready"; workspace: PersistedWorkspace; dossierId: string; fiscalYear: number; source: "server" | "local" }
  | { status: "no_dossier" | "error" }
  | { status: "year_unavailable"; reason: "not_selected" | "snapshot_missing" | "closed" | "mismatch" };

type ReadServices = {
  fetchDossier(userId: string): Promise<
    { status: "ok"; dossier: LmnpDossier } | { status: "not_found" } | { status: "error" }
  >;
  listSnapshots(dossierId: string): Promise<
    { status: "ok"; snapshots: WorkspaceSnapshotRecord[] } | { status: "error" }
  >;
  loadLocal(userId: string): Promise<{ workspace: PersistedWorkspace | null; lastSyncedServerRevision?: number }>;
  fallbackYear: number;
};

// This lab never calls ensureActiveDossier(): that helper may INSERT a new dossier.
// It uses the same pure year/hydration decision as LmnpProvider, without its
// reconciliation write, dispatch, autosave or legacy IndexedDB migration.
export async function loadRealWorkspace(
  userId: string | null,
  services?: ReadServices,
): Promise<RealWorkspaceLoad> {
  if (!userId) return { status: "no_dossier" };
  try {
    const readers = services ?? await defaultReaders();
    const fetched = await readers.fetchDossier(userId);
    if (fetched.status === "error") return { status: "error" };
    if (fetched.status === "not_found") return { status: "no_dossier" };
    const dossier = fetched.dossier;
    if (dossier.user_id !== userId) return { status: "error" };
    const [listed, localRecord] = await Promise.all([
      readers.listSnapshots(dossier.id), readers.loadLocal(userId),
    ]);
    if (listed.status !== "ok") return { status: "error" };
    const snapshots = listed.snapshots.filter(row => row.dossierId === dossier.id);
    const local = localRecord.workspace?.fiscalYear.dossierId && localRecord.workspace.fiscalYear.dossierId !== dossier.id
      ? null : localRecord.workspace;
    const activeYear = dossier.active_fiscal_year;
    const year = pickTargetYear(local, snapshots, readers.fallbackYear, activeYear);
    if (year === null) return { status: "year_unavailable", reason: activeYear === null ? "not_selected" : "snapshot_missing" };
    if (activeYear !== null && year !== activeYear) return { status: "year_unavailable", reason: "snapshot_missing" };

    const decision = resolveWorkspaceHydration({
      local,
      lastSyncedServerRevision: localRecord.lastSyncedServerRevision,
      snapshots,
      fallbackYear: readers.fallbackYear,
      activeFiscalYear: activeYear,
    });
    if (decision.source === "blocked") return { status: "error" };
    if (decision.source === "none") return { status: "year_unavailable", reason: "snapshot_missing" };
    const snapshot = snapshots.find(row => row.fiscalYear === year);
    if (snapshot?.closedAt != null) return { status: "year_unavailable", reason: "closed" };
    const workspace = decision.workspace;
    if (workspace.fiscalYear.status === "closed") return { status: "year_unavailable", reason: "closed" };
    if (workspace.fiscalYear.year !== year ||
        (workspace.fiscalYear.dossierId && workspace.fiscalYear.dossierId !== dossier.id)) {
      return { status: "year_unavailable", reason: "mismatch" };
    }
    return { status: "ready", workspace, dossierId: dossier.id, fiscalYear: year, source: decision.source };
  } catch {
    return { status: "error" };
  }
}

async function defaultReaders(): Promise<ReadServices> {
  const [{ fetchActiveDossierForUserResult }, { listWorkspaceSnapshots }, { getWorkspaceRecord, LMNP_DB_NAME, LMNP_DB_VERSION }] = await Promise.all([
    import("@/lib/lmnp/dossier/supabase-dossier"),
    import("@/lib/lmnp/store/workspace-snapshot-client"),
    import("@/lib/lmnp/store/db"),
  ]);
  return {
    fetchDossier: fetchActiveDossierForUserResult,
    listSnapshots: listWorkspaceSnapshots,
    fallbackYear: lastClosedFiscalYear(),
    async loadLocal(userId) {
      if (typeof indexedDB === "undefined" || !indexedDB.databases) return { workspace: null };
      const databases = await indexedDB.databases();
      if (!databases.some(db => db.name === LMNP_DB_NAME && db.version === LMNP_DB_VERSION)) {
        return { workspace: null };
      }
      const record = await getWorkspaceRecord(userId);
      return {
        workspace: isValidPersistedWorkspace(record?.data) ? record.data : null,
        lastSyncedServerRevision: record?.lastSyncedServerRevision,
      };
    },
  };
}
