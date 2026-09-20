/**
 * P0 Lot 1 — Supabase client for lmnp_workspace_snapshots.
 *
 * Writes are gated: a failed listing must not upsert a default workspace over
 * an unseen server row (anti-default-wipe). Future schema_version blocks writes.
 */
import type { PersistedWorkspace } from "./persistence";
import {
  serializeWorkspaceSnapshot,
  WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
} from "./workspace-snapshot";
import type { WorkspaceSnapshotRecord } from "./workspace-snapshot-resolve";

export type WorkspaceSnapshotSyncGate = "unknown" | "ready" | "blocked";

const SNAPSHOT_COLUMNS =
  "dossier_id, fiscal_year, schema_version, revision, payload, updated_at";

export type WorkspaceSnapshotStore = {
  listByDossier(dossierId: string): Promise<WorkspaceSnapshotRecord[]>;
  upsert(input: {
    dossierId: string;
    fiscalYear: number;
    payload: unknown;
    schemaVersion: number;
  }): Promise<{ revision: number }>;
};

let gate: WorkspaceSnapshotSyncGate = "unknown";
let storeOverride: WorkspaceSnapshotStore | null = null;

export function getWorkspaceSnapshotSyncGate(): WorkspaceSnapshotSyncGate {
  return gate;
}

export function setWorkspaceSnapshotSyncGate(next: WorkspaceSnapshotSyncGate): void {
  gate = next;
}

export function __setWorkspaceSnapshotStoreForTests(store: WorkspaceSnapshotStore | null): void {
  storeOverride = store;
}

export function __resetWorkspaceSnapshotSyncForTests(): void {
  gate = "unknown";
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
}): WorkspaceSnapshotRecord {
  return {
    dossierId: row.dossier_id,
    fiscalYear: row.fiscal_year,
    schemaVersion: row.schema_version,
    revision: row.revision,
    payload: row.payload,
    updatedAt: row.updated_at,
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
        .select("revision, schema_version")
        .eq("dossier_id", input.dossierId)
        .eq("fiscal_year", input.fiscalYear)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
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
  | { status: "error" };

export async function saveWorkspaceSnapshotToServer(input: {
  dossierId: string | null | undefined;
  workspace: PersistedWorkspace;
}): Promise<SaveWorkspaceSnapshotResult> {
  if (gate === "blocked" || gate === "unknown") return { status: "skipped" };
  const dossierId = input.dossierId;
  if (!dossierId) return { status: "skipped" };
  const serialized = serializeWorkspaceSnapshot(input.workspace);
  if (!serialized.ok) {
    console.error("[lmnp] workspace snapshot serialize refused", serialized);
    return { status: "error" };
  }
  const current = activeStore();
  if (!current) return { status: "skipped" };
  try {
    const saved = await current.upsert({
      dossierId,
      fiscalYear: serialized.envelope.workspace.fiscalYear.year,
      schemaVersion: serialized.envelope.schemaVersion,
      payload: serialized.envelope,
    });
    return { status: "ok", revision: saved.revision };
  } catch (error) {
    console.error("[lmnp] workspace snapshot upsert failed", { dossierId, error });
    return { status: "error" };
  }
}
