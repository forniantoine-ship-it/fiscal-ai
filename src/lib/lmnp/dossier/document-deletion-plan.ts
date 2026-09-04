import type { DeleteDocumentOutcome } from "./delete-document";

export type DocumentDeletionPlan =
  | { kind: "local-only" }
  | { kind: "server-required"; dossierId: string }
  | { kind: "blocked"; reason: string };

/**
 * Decides whether removing a document needs a server round-trip, purely from
 * data already on the document (hasSupabaseArtifacts, set at upload time —
 * never inferred from filename or other heuristics) and the current dossier id.
 */
export function resolveDocumentDeletionPlan(params: {
  hasSupabaseArtifacts?: boolean;
  dossierId: string | null;
}): DocumentDeletionPlan {
  if (!params.hasSupabaseArtifacts) {
    return { kind: "local-only" };
  }

  if (!params.dossierId) {
    return { kind: "blocked", reason: "Dossier introuvable — suppression impossible pour l'instant." };
  }

  return { kind: "server-required", dossierId: params.dossierId };
}

/**
 * Executes a document removal per its plan. For "server-required", the local
 * removal (removeLocal) only runs after the server call succeeds — never
 * before, so a failed server deletion never makes the document disappear
 * from the UI. For "local-only", behavior is unchanged from before this fix:
 * immediate local removal, no network call.
 */
export async function runDocumentRemoval(params: {
  documentId: string;
  plan: DocumentDeletionPlan;
  removeLocal: (documentId: string) => void;
  deleteOnServer: (params: {
    documentId: string;
    dossierId: string;
  }) => Promise<DeleteDocumentOutcome>;
  onPendingChange: (documentId: string, pending: boolean) => void;
  onError: (documentId: string, message: string | null) => void;
}): Promise<void> {
  const { documentId, plan, removeLocal, deleteOnServer, onPendingChange, onError } = params;

  if (plan.kind === "local-only") {
    removeLocal(documentId);
    return;
  }

  if (plan.kind === "blocked") {
    onError(documentId, plan.reason);
    return;
  }

  onError(documentId, null);
  onPendingChange(documentId, true);

  try {
    await deleteOnServer({ documentId, dossierId: plan.dossierId });
    removeLocal(documentId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Suppression échouée.";
    onError(documentId, message);
  } finally {
    onPendingChange(documentId, false);
  }
}

export type BulkPurgeOutcome =
  | { status: "no_documents" }
  | { status: "purged"; count: number }
  | { status: "failed"; failures: Array<{ documentId: string; message: string }> };

/**
 * Purges every Supabase-backed document (hasSupabaseArtifacts) before an
 * operation that is about to replace the whole local workspace
 * (CREATE_NEW_DECLARATION). Local-only documents never trigger a server
 * call. Uses Promise.allSettled — not Promise.all — so a single failure
 * doesn't prevent knowing the outcome of every document, which the caller
 * needs to report accurately and to make retries converge (deleteOnServer
 * is already idempotent per-document, see delete-document.ts).
 */
export async function purgeAllSupabaseDocuments(params: {
  documents: Array<{ id: string; hasSupabaseArtifacts?: boolean }>;
  dossierId: string | null;
  deleteOnServer: (params: {
    documentId: string;
    dossierId: string;
  }) => Promise<DeleteDocumentOutcome>;
}): Promise<BulkPurgeOutcome> {
  const { documents, dossierId, deleteOnServer } = params;
  const contributors = documents.filter((d) => d.hasSupabaseArtifacts);

  if (contributors.length === 0) {
    return { status: "no_documents" };
  }

  if (!dossierId) {
    return {
      status: "failed",
      failures: contributors.map((d) => ({
        documentId: d.id,
        message: "Dossier introuvable — suppression impossible pour l'instant.",
      })),
    };
  }

  const settled = await Promise.allSettled(
    contributors.map((d) => deleteOnServer({ documentId: d.id, dossierId })),
  );

  const failures = settled.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          {
            documentId: contributors[index].id,
            message: result.reason instanceof Error ? result.reason.message : "Suppression échouée.",
          },
        ]
      : [],
  );

  if (failures.length > 0) {
    return { status: "failed", failures };
  }

  return { status: "purged", count: contributors.length };
}

/**
 * Orchestrates CREATE_NEW_DECLARATION: purge every Supabase-backed document
 * first, and only call dispatchCreateNewDeclaration() once every purge has
 * been confirmed. On any failure, dispatchCreateNewDeclaration() is never
 * called — the current workspace (documents, declarationDraft) is left
 * completely untouched, so a failed purge can never look like a success and
 * can never leave the local workspace in a state Supabase disagrees with.
 */
export async function runCreateNewDeclaration(params: {
  documents: Array<{ id: string; hasSupabaseArtifacts?: boolean }>;
  dossierId: string | null;
  deleteOnServer: (params: {
    documentId: string;
    dossierId: string;
  }) => Promise<DeleteDocumentOutcome>;
  dispatchCreateNewDeclaration: () => void;
  onError: (message: string | null) => void;
}): Promise<void> {
  const outcome = await purgeAllSupabaseDocuments({
    documents: params.documents,
    dossierId: params.dossierId,
    deleteOnServer: params.deleteOnServer,
  });

  if (outcome.status === "failed") {
    params.onError(outcome.failures[0]?.message ?? "Suppression échouée.");
    return;
  }

  params.onError(null);
  params.dispatchCreateNewDeclaration();
}
