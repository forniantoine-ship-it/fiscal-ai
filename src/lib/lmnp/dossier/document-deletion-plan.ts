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
