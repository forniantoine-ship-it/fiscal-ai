/**
 * Lot 3 — Supabase-backed commit via SECURITY DEFINER RPC (service role).
 * Owner must already be verified by the API handler before calling.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TransitionCommitError,
  type TransitionCommitInput,
  type TransitionCommitResult,
} from "./types";

const RPC_NAME = "lmnp_commit_fiscal_year_transition";

function mapRpcError(message: string): TransitionCommitError {
  const lower = message.toLowerCase();
  if (lower.includes("not_owner")) return new TransitionCommitError("not_owner", message);
  if (lower.includes("dossier_not_found")) return new TransitionCommitError("dossier_not_found", message);
  if (lower.includes("source_missing")) return new TransitionCommitError("source_missing", message);
  if (lower.includes("revision_conflict")) return new TransitionCommitError("revision_conflict", message);
  if (lower.includes("closed_without_successor")) {
    return new TransitionCommitError("closed_without_successor", message);
  }
  if (lower.includes("successor_missing")) return new TransitionCommitError("successor_missing", message);
  if (lower.includes("invalid_years")) return new TransitionCommitError("invalid_years", message);
  if (lower.includes("invalid_revision")) return new TransitionCommitError("invalid_revision", message);
  if (lower.includes("invalid_payload")) return new TransitionCommitError("invalid_payload", message);
  if (lower.includes("invalid_schema")) return new TransitionCommitError("invalid_schema", message);
  if (lower.includes("snapshot_closed")) return new TransitionCommitError("snapshot_closed", message);
  return new TransitionCommitError("successor_insert_failed", message);
}

export async function commitFiscalYearTransitionViaRpc(
  supabase: SupabaseClient,
  input: TransitionCommitInput,
): Promise<TransitionCommitResult> {
  const { data, error } = await supabase.rpc(RPC_NAME, {
    p_dossier_id: input.dossierId,
    p_user_id: input.userId,
    p_from_year: input.fromYear,
    p_expected_revision: input.expectedRevision,
    p_closed_n_payload: input.closedNPayload,
    p_closed_n_schema_version: input.closedNSchemaVersion,
    p_next_year: input.nextYear,
    p_next_payload: input.nextPayload,
    p_next_schema_version: input.nextSchemaVersion,
    p_now: input.now,
  });

  if (error) {
    throw mapRpcError(error.message);
  }

  const row = data as {
    status?: string;
    fromYear?: number;
    nextYear?: number;
    closedRevision?: number;
    nextRevision?: number;
    closedAt?: string;
    activeFiscalYear?: number;
    nextPayload?: unknown;
    nextSchemaVersion?: number;
  } | null;

  if (
    !row ||
    (row.status !== "committed" && row.status !== "idempotent") ||
    typeof row.fromYear !== "number" ||
    typeof row.nextYear !== "number" ||
    typeof row.closedRevision !== "number" ||
    typeof row.nextRevision !== "number" ||
    typeof row.closedAt !== "string" ||
    typeof row.activeFiscalYear !== "number" ||
    row.nextPayload == null ||
    typeof row.nextSchemaVersion !== "number"
  ) {
    throw new TransitionCommitError("successor_insert_failed", "invalid RPC response");
  }

  return {
    status: row.status,
    fromYear: row.fromYear,
    nextYear: row.nextYear,
    closedRevision: row.closedRevision,
    nextRevision: row.nextRevision,
    closedAt: row.closedAt,
    activeFiscalYear: row.activeFiscalYear,
    nextPayload: row.nextPayload,
    nextSchemaVersion: row.nextSchemaVersion,
  };
}
