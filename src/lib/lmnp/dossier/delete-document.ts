import type { SupabaseClient } from "@supabase/supabase-js";

import { OwnershipError } from "@/lib/supabase-server";

/** Must match the bucket id in Supabase Dashboard (case-sensitive). */
const STORAGE_BUCKET = "lmnp-documents";

export type DeleteDocumentOutcome = "deleted" | "already_deleted";

/**
 * Deletes every server-side artifact of one document: Storage object →
 * extracted_document_data rows → the documents row itself, in that order.
 *
 * Order is load-bearing: if Storage succeeds but a DB step fails, the residue
 * is an orphaned DB row (traceable, safe to retry). Deleting DB rows first
 * would risk an orphaned Storage object with no DB reference left to find it —
 * exactly the PII-retention risk this fix closes.
 *
 * Idempotent by construction: `documents` is deleted last, so its absence
 * means a previous attempt already completed the full sequence — treated as
 * success, not re-run. Storage presence is checked explicitly via `.exists()`
 * before calling `.remove()`, rather than assuming `.remove()`'s behavior on
 * an already-absent object (not demonstrated locally for this SDK/server).
 *
 * Ownership: `documents.dossier_id`/`documents.user_id` are checked after
 * confirming the row exists, so "already deleted" (no row) and "not yours"
 * (row present, mismatched) are never conflated — the caller must never see
 * an ownership violation reported as a successful deletion.
 */
export async function deleteDocumentArtifacts(
  supabase: SupabaseClient,
  params: { documentId: string; dossierId: string; userId: string },
): Promise<DeleteDocumentOutcome> {
  const { documentId, dossierId, userId } = params;

  const { data: docRow, error: fetchError } = await supabase
    .from("documents")
    .select("id, file_path, dossier_id, user_id")
    .eq("id", documentId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Lecture du document échouée : ${fetchError.message}`);
  }

  if (!docRow) {
    // documents is deleted last in this sequence, so its absence can only mean
    // a previous attempt already completed — idempotent success, nothing to do.
    return "already_deleted";
  }

  if (docRow.dossier_id !== dossierId || docRow.user_id !== userId) {
    throw new OwnershipError();
  }

  if (docRow.file_path) {
    const storage = supabase.storage.from(STORAGE_BUCKET);
    const { data: fileExists } = await storage.exists(docRow.file_path);

    if (fileExists) {
      const { error: removeError } = await storage.remove([docRow.file_path]);
      if (removeError) {
        throw new Error(`Suppression Storage échouée : ${removeError.message}`);
      }
    }
    // else: already absent (demonstrated via .exists(), not assumed) — treated
    // as an artifact already removed by a previous attempt, sequence continues.
  }

  const { error: extractionDeleteError } = await supabase
    .from("extracted_document_data")
    .delete()
    .eq("document_id", documentId)
    .eq("dossier_id", dossierId);

  if (extractionDeleteError) {
    throw new Error(
      `Suppression extracted_document_data échouée : ${extractionDeleteError.message}`,
    );
  }

  const { error: documentDeleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("dossier_id", dossierId);

  if (documentDeleteError) {
    throw new Error(`Suppression documents échouée : ${documentDeleteError.message}`);
  }

  return "deleted";
}
