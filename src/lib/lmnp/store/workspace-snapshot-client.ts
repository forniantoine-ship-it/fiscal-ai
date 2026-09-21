/**
 * P0 Lot 1 — Supabase client for lmnp_workspace_snapshots.
 *
 * Writes are gated: UNKNOWN/BLOCKED never upsert. READY is scoped to the
 * hydrated (dossier_id, fiscal_year) pair. A first-upload of another year
 * of the same dossier may insert; after that upsert is confirmed (revision >= 1)
 * the gate adopts the new year so later saves are not skipped.
 */
import type { PersistedWorkspace } from "./persistence";
import {
  serializeWorkspaceSnapshot,
  WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
} from "./workspace-snapshot";
import type { WorkspaceSnapshotRecord } from "./workspace-snapshot-resolve";

export type WorkspaceSnapshotSyncGate = "unknown" | "ready" | "blocked";

export type WorkspaceSnapshotReadyScope = {
  dossierId: string;
  fiscalYear: number;
};

type GateState =
  | { status: "unknown" }
  | { status: "blocked" }
  | { status: "ready"; dossierId: string; fiscalYear: number };

const SNAPSHOT_COLUMNS =
  "dossier_id, fiscal_year, schema_version, revision, payload, updated_at, closed_at, successor_fiscal_year";

export type WorkspaceSnapshotStore = {
  listByDossier(dossierId: string): Promise<WorkspaceSnapshotRecord[]>;
  upsert(input: {
    dossierId: string;
    fiscalYear: number;
    payload: unknown;
    schemaVersion: number;
  }): Promise<{ revision: number }>;
  /**
   * Lot 3 B2 — conditional update: succeeds only if current revision equals
   * expectedRevision and the row is still open. 0 rows ⇒ conflict (no overwrite).
   */
  casUpdate?(input: {
    dossierId: string;
    fiscalYear: number;
    payload: unknown;
    schemaVersion: number;
    expectedRevision: number;
  }): Promise<{ status: "ok"; revision: number } | { status: "conflict" }>;
  /** Lot 3 — read closed marker before mutating (defense in depth vs RLS). */
  getMeta?(
    dossierId: string,
    fiscalYear: number,
  ): Promise<{ revision: number; closedAt: string | null; schemaVersion: number } | null>;
};

let gate: GateState = { status: "unknown" };
let storeOverride: WorkspaceSnapshotStore | null = null;

export function getWorkspaceSnapshotSyncGate(): WorkspaceSnapshotSyncGate {
  return gate.status;
}

export function getWorkspaceSnapshotReadyScope(): WorkspaceSnapshotReadyScope | null {
  if (gate.status !== "ready") return null;
  return { dossierId: gate.dossierId, fiscalYear: gate.fiscalYear };
}

/**
 * READY without a (dossier, year) scope is refused: the client cannot prove it
 * finished hydration for that pair, so writes stay UNKNOWN.
 */
export function setWorkspaceSnapshotSyncGate(
  next: WorkspaceSnapshotSyncGate,
  scope?: WorkspaceSnapshotReadyScope,
): void {
  if (next === "ready") {
    if (!scope?.dossierId || !Number.isInteger(scope.fiscalYear) || scope.fiscalYear < 2000) {
      gate = { status: "unknown" };
      return;
    }
    gate = { status: "ready", dossierId: scope.dossierId, fiscalYear: scope.fiscalYear };
    return;
  }
  gate = { status: next };
}

/** Call before listing snapshots so debounce/autosave cannot upsert during load. */
export function beginWorkspaceSnapshotHydration(): void {
  setWorkspaceSnapshotSyncGate("unknown");
}

export function completeWorkspaceSnapshotHydration(input: {
  blockWrites: boolean;
  dossierId: string;
  fiscalYear: number;
}): void {
  if (input.blockWrites) {
    setWorkspaceSnapshotSyncGate("blocked");
    return;
  }
  setWorkspaceSnapshotSyncGate("ready", { dossierId: input.dossierId, fiscalYear: input.fiscalYear });
}

export function __setWorkspaceSnapshotStoreForTests(store: WorkspaceSnapshotStore | null): void {
  storeOverride = store;
}

export function __resetWorkspaceSnapshotSyncForTests(): void {
  gate = { status: "unknown" };
  storeOverride = null;
}

function isLiveSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return false;
  if (url.includes("invalid") || key === "test-anon-key") return false;
  return true;
}

function mapRow(row: {
  dossier_id: string;
  fiscal_year: number;
  schema_version: number;
  revision: number;
  payload: unknown;
  updated_at: string;
  closed_at?: string | null;
  successor_fiscal_year?: number | null;
}): WorkspaceSnapshotRecord {
  return {
    dossierId: row.dossier_id,
    fiscalYear: row.fiscal_year,
    schemaVersion: row.schema_version,
    revision: row.revision,
    payload: row.payload,
    updatedAt: row.updated_at,
    closedAt: row.closed_at ?? null,
    successorFiscalYear: row.successor_fiscal_year ?? null,
  };
}

function createSupabaseStore(): WorkspaceSnapshotStore {
  async function getClient() {
    const { supabase } = await import("@/lib/supabase");
    return supabase;
  }
  return {
    async listByDossier(dossierId) {
      const { data, error } = await (await getClient())
        .from("lmnp_workspace_snapshots")
        .select(SNAPSHOT_COLUMNS)
        .eq("dossier_id", dossierId);
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapRow);
    },
    async upsert(input) {
      const supabase = await getClient();
      const { data: existing, error: readError } = await supabase
        .from("lmnp_workspace_snapshots")
        .select("revision, schema_version, closed_at")
        .eq("dossier_id", input.dossierId)
        .eq("fiscal_year", input.fiscalYear)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      if (existing?.closed_at) {
        throw new Error("lmnp_snapshot_closed: snapshot is closed");
      }
      if (existing && existing.schema_version > WORKSPACE_SNAPSHOT_SCHEMA_VERSION) {
        throw new Error("workspace snapshot schema is newer than this client");
      }
      const nextRevision = (existing?.revision ?? 0) + 1;
      const { data, error } = await supabase
        .from("lmnp_workspace_snapshots")
        .upsert(
          {
            dossier_id: input.dossierId,
            fiscal_year: input.fiscalYear,
            schema_version: input.schemaVersion,
            revision: nextRevision,
            payload: input.payload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "dossier_id,fiscal_year" },
        )
        .select("revision")
        .single();
      if (error || data?.revision == null) {
        throw new Error(error?.message ?? "workspace snapshot upsert failed");
      }
      return { revision: data.revision };
    },
    async casUpdate(input) {
      const supabase = await getClient();
      const nextRevision = input.expectedRevision + 1;
      const { data, error } = await supabase
        .from("lmnp_workspace_snapshots")
        .update({
          schema_version: input.schemaVersion,
          revision: nextRevision,
          payload: input.payload,
          updated_at: new Date().toISOString(),
        })
        .eq("dossier_id", input.dossierId)
        .eq("fiscal_year", input.fiscalYear)
        .eq("revision", input.expectedRevision)
        .is("closed_at", null)
        .select("revision")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data || data.revision == null) return { status: "conflict" as const };
      return { status: "ok" as const, revision: data.revision as number };
    },
    async getMeta(dossierId, fiscalYear) {
      const { data, error } = await (await getClient())
        .from("lmnp_workspace_snapshots")
        .select("revision, schema_version, closed_at")
        .eq("dossier_id", dossierId)
        .eq("fiscal_year", fiscalYear)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        revision: data.revision as number,
        schemaVersion: data.schema_version as number,
        closedAt: (data.closed_at as string | null) ?? null,
      };
    },
  };
}

function activeStore(): WorkspaceSnapshotStore | null {
  if (storeOverride) return storeOverride;
  if (!isLiveSupabaseConfigured()) return null;
  return createSupabaseStore();
}

export async function listWorkspaceSnapshots(dossierId: string): Promise<
  { status: "ok"; snapshots: WorkspaceSnapshotRecord[] } | { status: "error" }
> {
  const current = activeStore();
  if (!current) return { status: "error" };
  try {
    const snapshots = await current.listByDossier(dossierId);
    return { status: "ok", snapshots };
  } catch (error) {
    console.error("[lmnp] workspace snapshot list failed", { dossierId, error });
    return { status: "error" };
  }
}

export type SaveWorkspaceSnapshotResult =
  | { status: "ok"; revision: number }
  | { status: "skipped" }
  | { status: "error" }
  | { status: "closed" };

function isConfirmedServerRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function adoptReadyScopeAfterConfirmedFirstUpload(dossierId: string, fiscalYear: number): void {
  if (gate.status !== "ready" || gate.dossierId !== dossierId) return;
  if (gate.fiscalYear === fiscalYear) return;
  setWorkspaceSnapshotSyncGate("ready", { dossierId, fiscalYear });
}

function isClosedSnapshotError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("lmnp_snapshot_closed") || message.toLowerCase().includes("snapshot is closed");
}

export async function saveWorkspaceSnapshotToServer(input: {
  dossierId: string | null | undefined;
  workspace: PersistedWorkspace;
}): Promise<SaveWorkspaceSnapshotResult> {
  if (gate.status !== "ready") return { status: "skipped" };
  const dossierId = input.dossierId;
  if (!dossierId || dossierId !== gate.dossierId) return { status: "skipped" };
  const serialized = serializeWorkspaceSnapshot(input.workspace);
  if (!serialized.ok) {
    console.error("[lmnp] workspace snapshot serialize refused", serialized);
    return { status: "error" };
  }
  const fiscalYear = serialized.envelope.workspace.fiscalYear.year;
  const current = activeStore();
  if (!current) return { status: "skipped" };
  const isOtherYearFirstUpload = fiscalYear !== gate.fiscalYear;
  if (isOtherYearFirstUpload) {
    try {
      const rows = await current.listByDossier(dossierId);
      if (rows.some((row) => row.fiscalYear === fiscalYear)) {
        return { status: "skipped" };
      }
    } catch (error) {
      console.error("[lmnp] workspace snapshot year-scope list failed", { dossierId, fiscalYear, error });
      return { status: "skipped" };
    }
  }
  try {
    if (current.getMeta) {
      const meta = await current.getMeta(dossierId, fiscalYear);
      if (meta?.closedAt) return { status: "closed" };
    }
    const saved = await current.upsert({
      dossierId,
      fiscalYear,
      schemaVersion: serialized.envelope.schemaVersion,
      payload: serialized.envelope,
    });
    if (!isConfirmedServerRevision(saved.revision)) {
      console.error("[lmnp] workspace snapshot upsert returned invalid revision", {
        dossierId,
        fiscalYear,
        revision: saved.revision,
      });
      return { status: "error" };
    }
    if (isOtherYearFirstUpload) {
      adoptReadyScopeAfterConfirmedFirstUpload(dossierId, fiscalYear);
    }
    return { status: "ok", revision: saved.revision };
  } catch (error) {
    if (isClosedSnapshotError(error)) {
      console.warn("[lmnp] workspace snapshot upsert refused — year closed", { dossierId, fiscalYear });
      return { status: "closed" };
    }
    console.error("[lmnp] workspace snapshot upsert failed", { dossierId, error });
    return { status: "error" };
  }
}

/**
 * Lot 3 — transition flush: CAS write from the client's known synced revision.
 *
 * Contract:
 * - snapshot absent + knownRevision absent → INSERT revision 1 (first server save)
 * - snapshot exists + knownRevision matches → conditional UPDATE revision+1
 * - snapshot exists + knownRevision absent → fail-closed (`unknown_revision`)
 * - snapshot exists + knownRevision mismatch / race → `revision_conflict`
 * - snapshot closed → `already_closed` (no overwrite; idempotent path skips flush)
 *
 * NEVER adopt the server revision by reading it first — that is B2.
 */
export async function saveWorkspaceSnapshotToServerForTransition(input: {
  dossierId: string;
  workspace: PersistedWorkspace;
  /** Last server revision this client confirmed for this workspace (P0). */
  knownRevision?: number | null;
}): Promise<
  | { status: "ok"; revision: number }
  | {
      status: "failed";
      reason:
        | "serialize_failed"
        | "server_unavailable"
        | "already_closed"
        | "invalid_revision"
        | "unknown_revision"
        | "revision_conflict"
        | string;
    }
> {
  const serialized = serializeWorkspaceSnapshot(input.workspace);
  if (!serialized.ok) {
    return { status: "failed", reason: "serialize_failed" };
  }
  const fiscalYear = serialized.envelope.workspace.fiscalYear.year;
  const current = activeStore();
  if (!current) {
    return { status: "failed", reason: "server_unavailable" };
  }
  const known = normalizeConfirmedRevision(input.knownRevision);

  try {
    // Existence / closed check only — revision value is NEVER adopted as knownRevision.
    let meta: { revision: number; closedAt: string | null; schemaVersion: number } | null = null;
    if (current.getMeta) {
      meta = await current.getMeta(input.dossierId, fiscalYear);
    } else {
      const rows = await current.listByDossier(input.dossierId);
      const row = rows.find((r) => r.fiscalYear === fiscalYear);
      meta = row
        ? {
            revision: row.revision,
            closedAt: row.closedAt ?? null,
            schemaVersion: row.schemaVersion,
          }
        : null;
    }

    if (meta?.closedAt) {
      return { status: "failed", reason: "already_closed" };
    }

    if (!meta) {
      if (known != null) {
        // Local thinks it synced a revision that the server no longer has / never had.
        return { status: "failed", reason: "revision_conflict" };
      }
      // First server save for this (dossier, year).
      const saved = await current.upsert({
        dossierId: input.dossierId,
        fiscalYear,
        schemaVersion: serialized.envelope.schemaVersion,
        payload: serialized.envelope,
      });
      if (!isConfirmedServerRevision(saved.revision)) {
        return { status: "failed", reason: "invalid_revision" };
      }
      return { status: "ok", revision: saved.revision };
    }

    if (known == null) {
      return { status: "failed", reason: "unknown_revision" };
    }

    if (!current.casUpdate) {
      return { status: "failed", reason: "server_unavailable" };
    }

    const cas = await current.casUpdate({
      dossierId: input.dossierId,
      fiscalYear,
      schemaVersion: serialized.envelope.schemaVersion,
      payload: serialized.envelope,
      expectedRevision: known,
    });
    if (cas.status === "conflict") {
      return { status: "failed", reason: "revision_conflict" };
    }
    if (!isConfirmedServerRevision(cas.revision)) {
      return { status: "failed", reason: "invalid_revision" };
    }
    return { status: "ok", revision: cas.revision };
  } catch (error) {
    if (isClosedSnapshotError(error)) {
      return { status: "failed", reason: "already_closed" };
    }
    console.error("[lmnp] transition snapshot save failed", { dossierId: input.dossierId, error });
    return { status: "failed", reason: "server_unavailable" };
  }
}

function normalizeConfirmedRevision(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) return value;
  return null;
}
