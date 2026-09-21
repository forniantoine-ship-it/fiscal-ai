/**
 * Lot 3 — single client command for server-authoritative N→N+1 transition.
 *
 * Both `runCloseAndCreateNextFiscalYear` and `runCreateNextFiscalYear` converge here.
 *
 * Post-commit adoption contract (F1):
 *   server commit confirmed
 *   → install local N+1 + nextRevision (critical, not best-effort)
 *   → SI succès : gate READY N+1 → dispatch N+1
 *   → SI échec : gate blocked, pas de dispatch éditable, erreur POST-COMMIT
 *     (serveur déjà N+1 — reload/cold restore ; jamais reseed)
 */
import { prepareFiscalYearTransitionCandidate } from "@/lib/lmnp/services/fiscal-year-transition/prepare-transition";
import type { TransitionCommitResult } from "@/lib/lmnp/services/fiscal-year-transition/types";
import { parseWorkspaceSnapshot } from "./workspace-snapshot";
import {
  flushWorkspaceSaveForTransition,
  type PersistedWorkspace,
  type StrictWorkspaceFlushResult,
} from "./persistence";
import { putWorkspaceRecord } from "./db";
import { FiscalYearAlreadyClosedError } from "./dossier-db";
import { setWorkspaceSnapshotSyncGate } from "./workspace-snapshot-client";

let transitionInFlight = false;

/** Explicit POST-COMMIT local adoption failure — server already on N+1. */
export const POST_COMMIT_LOCAL_ADOPTION_FAILED_MESSAGE =
  "L'exercice suivant a été créé sur le serveur, mais l'enregistrement local a échoué. Rechargez la page pour continuer sur le nouvel exercice.";

export type RunServerFiscalYearTransitionParams = {
  dossierId: string | null;
  userId: string | null;
  workspace: PersistedWorkspace;
  now?: string;
  dispatchNextWorkspace: (nextWorkspace: PersistedWorkspace) => void;
  onError: (message: string | null) => void;
  /** Injectable — default forces a confirmed server revision for N. */
  flushForTransition?: (
    userId: string | null,
    workspace: PersistedWorkspace,
  ) => Promise<StrictWorkspaceFlushResult>;
  /** Injectable — default POST /api/lmnp/fiscal-year/transition. */
  commitOnServer?: (input: {
    authToken: string;
    dossierId: string;
    fromYear: number;
    nextYear: number;
    expectedRevision: number;
    closedNPayload: unknown;
    closedNSchemaVersion: number;
    nextPayload: unknown;
    nextSchemaVersion: number;
    now: string;
  }) => Promise<TransitionCommitResult>;
  /**
   * Local IDB adoption of N+1 after server commit.
   * Critical for an editable session — failure must not dispatch N+1.
   */
  mirrorLocalAfterCommit?: (input: {
    userId: string;
    nextWorkspace: PersistedWorkspace;
    nextRevision: number;
  }) => Promise<void>;
  getAuthToken?: () => Promise<string | null>;
  /**
   * Optional fail-safe after POST-COMMIT local failure (e.g. force reload).
   * Server remains on N+1; never retry/reseed the transition.
   */
  onPostCommitLocalAdoptionFailed?: (info: {
    dossierId: string;
    nextYear: number;
    nextRevision: number;
    nextWorkspace: PersistedWorkspace;
  }) => void;
};

async function defaultGetAuthToken(): Promise<string | null> {
  // Lazy import — unit tests must not require NEXT_PUBLIC_SUPABASE_URL.
  const { supabase } = await import("@/lib/supabase");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function defaultCommitOnServer(input: {
  authToken: string;
  dossierId: string;
  fromYear: number;
  nextYear: number;
  expectedRevision: number;
  closedNPayload: unknown;
  closedNSchemaVersion: number;
  nextPayload: unknown;
  nextSchemaVersion: number;
  now: string;
}): Promise<TransitionCommitResult> {
  const response = await fetch("/api/lmnp/fiscal-year/transition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => null)) as
    | (TransitionCommitResult & { ok?: boolean; error?: string; code?: string })
    | null;
  if (!response.ok || !body || body.ok !== true) {
    const code = body?.code ?? "server_error";
    const message = body?.error ?? "Échec de la transition d'exercice.";
    const err = new Error(message) as Error & { code?: string };
    err.code = code;
    throw err;
  }
  return {
    status: body.status,
    fromYear: body.fromYear,
    nextYear: body.nextYear,
    closedRevision: body.closedRevision,
    nextRevision: body.nextRevision,
    closedAt: body.closedAt,
    activeFiscalYear: body.activeFiscalYear,
    nextPayload: body.nextPayload,
    nextSchemaVersion: body.nextSchemaVersion,
  };
}

async function defaultMirrorLocal(input: {
  userId: string;
  nextWorkspace: PersistedWorkspace;
  nextRevision: number;
}): Promise<void> {
  // Exact server N+1 + its revision — never inherit N's lastSyncedServerRevision.
  await putWorkspaceRecord(input.userId, input.nextWorkspace, {
    lastSyncedServerRevision: input.nextRevision,
  });
}

export async function runServerFiscalYearTransition(
  params: RunServerFiscalYearTransitionParams,
): Promise<void> {
  const {
    dossierId,
    userId,
    workspace,
    dispatchNextWorkspace,
    onError,
  } = params;
  const flushForTransition = params.flushForTransition ?? flushWorkspaceSaveForTransition;
  const commitOnServer = params.commitOnServer ?? defaultCommitOnServer;
  const mirrorLocalAfterCommit = params.mirrorLocalAfterCommit ?? defaultMirrorLocal;
  const getAuthToken = params.getAuthToken ?? defaultGetAuthToken;

  if (transitionInFlight) {
    onError("Une transition d'exercice est déjà en cours — patientez.");
    return;
  }

  transitionInFlight = true;
  try {
    if (!dossierId) {
      onError("Dossier introuvable — impossible de transitionner l'exercice pour l'instant.");
      return;
    }
    if (!userId) {
      onError("Utilisateur non identifié — impossible de transitionner l'exercice pour l'instant.");
      return;
    }

    const now = params.now ?? new Date().toISOString();
    const sourceAlreadyClosed = workspace.fiscalYear.status === "closed";

    // Lot 3 — open N must be flushed with a confirmed CAS server revision.
    // Already-closed N is the idempotent path: server ignores expectedRevision
    // when closed_at is set (no write flush — would be rejected as closed).
    let expectedRevision = 1;
    if (!sourceAlreadyClosed) {
      const flush = await flushForTransition(userId, workspace);
      if (flush.status !== "ok") {
        if (flush.reason === "revision_conflict") {
          onError("L'exercice a été modifié ailleurs — rechargez avant de clôturer.");
          return;
        }
        if (flush.reason === "unknown_revision" || flush.reason === "scope_mismatch") {
          onError(
            "Exercice non synchronisé avec le serveur — rechargez avant de clôturer.",
          );
          return;
        }
        onError(
          flush.reason === "server_unavailable"
            ? "Serveur indisponible — l'exercice n'a pas été modifié."
            : "Impossible de sauvegarder l'exercice avant clôture — réessayez.",
        );
        return;
      }
      expectedRevision = flush.revision;
    }

    const prepared = prepareFiscalYearTransitionCandidate({
      workspace,
      dossierId,
      now,
    });
    if (!prepared.ok) {
      onError(prepared.reason);
      return;
    }

    const authToken = await getAuthToken();
    if (!authToken) {
      onError("Session expirée — reconnectez-vous pour clôturer l'exercice.");
      return;
    }

    const committed = await commitOnServer({
      authToken,
      dossierId,
      fromYear: prepared.fromYear,
      nextYear: prepared.nextYear,
      expectedRevision,
      closedNPayload: prepared.closedNPayload,
      closedNSchemaVersion: prepared.closedNSchemaVersion,
      nextPayload: prepared.nextPayload,
      nextSchemaVersion: prepared.nextSchemaVersion,
      now,
    });

    const parsed = parseWorkspaceSnapshot(committed.nextPayload);
    const nextWorkspace = parsed.ok ? parsed.envelope.workspace : prepared.nextWorkspace;

    // F1 — local adoption BEFORE gate READY / dispatch. Critical for editable session.
    try {
      await mirrorLocalAfterCommit({
        userId,
        nextWorkspace,
        nextRevision: committed.nextRevision,
      });
    } catch (localError) {
      console.error("[lmnp] POST-COMMIT local adoption failed — server already on N+1", localError);
      // Block writes: do not pretend N+1 is editable with IDB still on N.
      setWorkspaceSnapshotSyncGate("blocked");
      onError(POST_COMMIT_LOCAL_ADOPTION_FAILED_MESSAGE);
      params.onPostCommitLocalAdoptionFailed?.({
        dossierId,
        nextYear: committed.nextYear,
        nextRevision: committed.nextRevision,
        nextWorkspace,
      });
      // No dispatch — UI stays on N; reload/cold restore converges to server N+1.
      return;
    }

    // B1 — gate READY N+1 only after coherent local adoption.
    setWorkspaceSnapshotSyncGate("ready", {
      dossierId,
      fiscalYear: committed.nextYear,
    });

    onError(null);
    dispatchNextWorkspace(nextWorkspace);
  } catch (error) {
    if (error instanceof FiscalYearAlreadyClosedError) {
      onError(error.message);
      return;
    }
    const code = (error as { code?: string } | null)?.code;
    if (code === "revision_conflict") {
      onError(
        "L'exercice a été modifié ailleurs — rechargez avant de clôturer.",
      );
      return;
    }
    onError(error instanceof Error ? error.message : "Échec de la transition d'exercice.");
  } finally {
    transitionInFlight = false;
  }
}

/** @internal tests only */
export function __testResetServerFiscalYearTransitionGuard(): void {
  transitionInFlight = false;
}
