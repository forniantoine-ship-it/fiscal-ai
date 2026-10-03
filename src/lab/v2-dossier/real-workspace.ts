import { resolveExerciseScope } from "@/lib/lmnp/dossier/property-scope";
import type { LmnpDossier } from "@/lib/lmnp/dossier/supabase-dossier";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { lastClosedFiscalYear } from "@/lib/lmnp/services/payment/fiscal-year-closure";
import { isValidPersistedWorkspace, parseWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import { pickTargetYear, resolveWorkspaceHydration, type WorkspaceSnapshotRecord } from "@/lib/lmnp/store/workspace-snapshot-resolve";

/**
 * MB-MULTI-UX-1 — scope multi-bien VÉRIFIÉ côté serveur : le snapshot serveur et le workspace local décrivent EXACTEMENT les mêmes
 * biens (≥ 2, identifiants uniques, liste de biens = biens de l'exercice). Un bien présent d'un seul côté invalide le scope.
 * Le bien ACTIF n'est pas jugé ici : il est vérifié contre ce même ensemble (`propertyScopeFor`) pour chaque requête.
 */
function sameVerifiedMultiPropertyScope(
  server: Pick<PersistedWorkspace, "properties" | "fiscalYear">,
  local: Pick<PersistedWorkspace, "properties" | "fiscalYear">,
): boolean {
  const serverScope = resolveExerciseScope(server);
  const localScope = resolveExerciseScope(local);
  if (serverScope.kind !== "multi" || localScope.kind !== "multi") return false;
  const serverIds = [...serverScope.propertyIds].sort();
  const localIds = [...localScope.propertyIds].sort();
  return serverIds.length === localIds.length && serverIds.every((id, index) => id === localIds[index]);
}

export type RealWorkspaceLoad =
  | { status: "ready"; workspace: PersistedWorkspace; dossierId: string; userId: string; fiscalYear: number; source: "server" | "local"; serverScopeVerified: boolean; legacyDocumentYears: ReadonlyArray<{ fiscalYear: number; documentIds: ReadonlyArray<string> }> }
  | { status: "no_dossier" | "error" }
  | { status: "year_unavailable"; reason: "not_selected" | "snapshot_missing" | "closed" | "mismatch" | "ambiguous" };

type ReadServices = {
  fetchDossier(userId: string): Promise<
    { status: "ok"; dossier: LmnpDossier } | { status: "not_found" } | { status: "error" }
  >;
  fetchExactDossier?(userId: string, dossierId: string): ReturnType<ReadServices["fetchDossier"]>;
  listSnapshots(dossierId: string): Promise<
    { status: "ok"; snapshots: WorkspaceSnapshotRecord[] } | { status: "error" }
  >;
  loadLocal(userId: string, dossierId?: string, fiscalYear?: number): Promise<{ workspace: PersistedWorkspace | null; lastSyncedServerRevision?: number }>;
  fallbackYear: number;
};

// This lab never calls ensureActiveDossier(): that helper may INSERT a new dossier.
// It uses the same pure year/hydration decision as LmnpProvider, without its
// reconciliation write, dispatch, autosave or legacy IndexedDB migration.
export async function loadRealWorkspace(
  userId: string | null,
  services?: ReadServices,
  requestedDossierId?: string,
): Promise<RealWorkspaceLoad> {
  if (!userId) return { status: "no_dossier" };
  try {
    const readers = services ?? await defaultReaders();
    const fetched = requestedDossierId
      ? readers.fetchExactDossier ? await readers.fetchExactDossier(userId, requestedDossierId) : { status: "error" as const }
      : await readers.fetchDossier(userId);
    if (fetched.status === "error") return { status: "error" };
    if (fetched.status === "not_found") return { status: "no_dossier" };
    const dossier = fetched.dossier;
    if (dossier.user_id !== userId || (requestedDossierId && dossier.id !== requestedDossierId)) return { status: "error" };
    const listed = await readers.listSnapshots(dossier.id);
    if (listed.status !== "ok") return { status: "error" };
    const snapshots = listed.snapshots.filter(row => row.dossierId === dossier.id);
    const selectedYear = dossier.active_fiscal_year ??
      (snapshots.length === 1 ? snapshots[0].fiscalYear : undefined);
    const localRecord = await readers.loadLocal(userId, requestedDossierId ? dossier.id : undefined, selectedYear);
    const local = requestedDossierId
      ? localRecord.workspace?.fiscalYear.dossierId === dossier.id ? localRecord.workspace : null
      : localRecord.workspace?.fiscalYear.dossierId && localRecord.workspace.fiscalYear.dossierId !== dossier.id
        ? null : localRecord.workspace;
    const activeYear = dossier.active_fiscal_year;
    const target = pickTargetYear(local, snapshots, readers.fallbackYear, activeYear);
    if (target.status === "ambiguous") {
      return { status: "year_unavailable", reason: target.reason === "multiple_candidates" ? "ambiguous" : "snapshot_missing" };
    }
    if (target.status === "no_year") {
      return { status: "year_unavailable", reason: localRecord.workspace?.fiscalYear.status === "closed" || snapshots.some(row => row.closedAt != null)
        ? "closed" : "not_selected" };
    }
    const year = target.year;

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
    // A newer local draft may win R8's content reconciliation. Correction
    // still requires a server snapshot proving the SAME entity scope; a local
    // cache alone cannot authorize opening an editing provider.
    const parsedActive = snapshot ? parseWorkspaceSnapshot(snapshot.payload) : null;
    const serverWorkspace = parsedActive?.ok ? parsedActive.envelope.workspace : null;
    const serverScopeVerified = Boolean(serverWorkspace &&
      snapshot?.dossierId === dossier.id && snapshot.closedAt == null &&
      serverWorkspace.fiscalYear.dossierId === dossier.id &&
      serverWorkspace.fiscalYear.id === workspace.fiscalYear.id &&
      serverWorkspace.fiscalYear.year === year && serverWorkspace.fiscalYear.status !== "closed" &&
      ((serverWorkspace.fiscalYear.propertyIds.length === 0 && workspace.fiscalYear.propertyIds.length === 0 &&
        serverWorkspace.properties.length === 0 && workspace.properties.length === 0) ||
       (serverWorkspace.fiscalYear.propertyIds.length === 1 && workspace.fiscalYear.propertyIds.length === 1 &&
        serverWorkspace.fiscalYear.propertyIds[0] === workspace.fiscalYear.propertyIds[0] &&
        serverWorkspace.properties.length === 1 && workspace.properties.length === 1 &&
        serverWorkspace.properties[0]?.id === workspace.properties[0]?.id &&
        serverWorkspace.properties[0]?.id === serverWorkspace.fiscalYear.propertyIds[0]) ||
       sameVerifiedMultiPropertyScope(serverWorkspace, workspace)));
    const legacyDocumentYears = snapshots.flatMap(row => {
      const parsed = parseWorkspaceSnapshot(row.payload);
      if (!parsed.ok || parsed.envelope.workspace.fiscalYear.year !== row.fiscalYear ||
          parsed.envelope.workspace.fiscalYear.dossierId !== dossier.id) return [];
      return [{ fiscalYear: row.fiscalYear, documentIds: parsed.envelope.workspace.documents.map(doc => doc.id) }];
    });
    return { status: "ready", workspace, dossierId: dossier.id, userId, fiscalYear: year, source: decision.source, serverScopeVerified, legacyDocumentYears };
  } catch {
    return { status: "error" };
  }
}

async function defaultReaders(): Promise<ReadServices> {
  const [{ fetchActiveDossierForUserResult, fetchOwnedDossierById }, { listWorkspaceSnapshots }, { getWorkspaceRecord, peekScopedWorkspaceRecord, listScopedWorkspaceRecords, LMNP_DB_NAME, LMNP_DB_VERSION }] = await Promise.all([
    import("@/lib/lmnp/dossier/supabase-dossier"),
    import("@/lib/lmnp/store/workspace-snapshot-client"),
    import("@/lib/lmnp/store/db"),
  ]);
  return {
    fetchDossier: fetchActiveDossierForUserResult,
    fetchExactDossier: fetchOwnedDossierById,
    listSnapshots: listWorkspaceSnapshots,
    fallbackYear: lastClosedFiscalYear(),
    async loadLocal(userId, dossierId, fiscalYear) {
      if (typeof indexedDB === "undefined" || !indexedDB.databases) return { workspace: null };
      const databases = await indexedDB.databases();
      if (!databases.some(db => db.name === LMNP_DB_NAME && db.version === LMNP_DB_VERSION)) {
        return { workspace: null };
      }
      let record;
      if (dossierId && fiscalYear != null) {
        record = await peekScopedWorkspaceRecord({ userId, dossierId, fiscalYear });
      } else if (dossierId) {
        const records = await listScopedWorkspaceRecords(userId, dossierId);
        const legacy = await getWorkspaceRecord(userId);
        const legacyWorkspace = legacy?.data;
        if (legacy && isValidPersistedWorkspace(legacyWorkspace) && legacyWorkspace.fiscalYear.dossierId === dossierId &&
            !records.some(item => isValidPersistedWorkspace(item.data) && item.data.fiscalYear.year === legacyWorkspace.fiscalYear.year)) {
          records.push(legacy);
        }
        record = records.length === 1 ? records[0] : undefined;
      } else {
        record = await getWorkspaceRecord(userId);
      }
      return {
        workspace: isValidPersistedWorkspace(record?.data) ? record.data : null,
        lastSyncedServerRevision: record?.lastSyncedServerRevision,
      };
    },
  };
}
