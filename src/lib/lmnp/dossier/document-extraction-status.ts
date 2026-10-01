import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assertDocumentOwnership,
  assertDossierOwnership,
  getServerSupabaseForUser,
  getServerSupabaseUnscoped,
  OwnershipError,
  UnauthorizedError,
} from "@/lib/supabase-server";

/**
 * F011-R2 — frontière serveur du cycle de vie de `documents.extraction_status` pour les analyses exécutées dans le navigateur
 * (pipeline F011 : `runF011UploadFlow`). Le navigateur ne peut pas écrire cette colonne (P0-S0 : aucune policy UPDATE client) :
 * l'écriture passe par ici, dans cet ordre, sans rien ignorer —
 *   identité (jeton) → propriété du dossier → propriété du document → UPDATE exact d'UNE colonne (service role).
 *
 * `/api/lmnp/extract` n'est pas réutilisable : il relance l'extraction (OpenAI) et écrit des lignes `extracted_document_data`.
 * Les gardes, elles, sont réutilisées telles quelles (`supabase-server`). Seuls les statuts d'un événement réel de l'analyse
 * sont acceptés ; `pending` (état d'upload) ne peut pas être réécrit.
 */
export const REPORTABLE_EXTRACTION_STATUSES = ["processing", "completed", "failed"] as const;
export type ReportableExtractionStatus = (typeof REPORTABLE_EXTRACTION_STATUSES)[number];

/** Le corps ne porte que ces champs : tout autre est refusé (jamais ignoré en silence, jamais écrit). */
const ALLOWED_FIELDS = new Set(["documentId", "dossierId", "status", "authToken"]);

export type DocumentExtractionStatusDeps = {
  authenticate: (authToken?: string) => Promise<{ userId: string }>;
  supabase: () => SupabaseClient;
};

export type DocumentExtractionStatusResponse =
  | { status: 200; body: { ok: true } }
  | { status: 400 | 401 | 403 | 500; body: { error: string } };

const fail = (status: 400 | 401 | 403 | 500, error: string): DocumentExtractionStatusResponse => ({ status, body: { error } });

export const documentExtractionStatusDeps: DocumentExtractionStatusDeps = {
  authenticate: getServerSupabaseForUser,
  supabase: getServerSupabaseUnscoped,
};

function isReportableStatus(value: unknown): value is ReportableExtractionStatus {
  return typeof value === "string" && (REPORTABLE_EXTRACTION_STATUSES as readonly string[]).includes(value);
}

export async function handleDocumentExtractionStatusRequest(
  input: unknown,
  deps: DocumentExtractionStatusDeps = documentExtractionStatusDeps,
): Promise<DocumentExtractionStatusResponse> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return fail(400, "Requête invalide.");
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(key => !ALLOWED_FIELDS.has(key))) return fail(400, "Requête invalide.");

  const documentId = typeof body.documentId === "string" ? body.documentId.trim() : "";
  const dossierId = typeof body.dossierId === "string" ? body.dossierId.trim() : "";
  if (!documentId || !dossierId) return fail(400, "documentId et dossierId requis.");
  if (!isReportableStatus(body.status)) return fail(400, "Statut non autorisé.");
  const status = body.status;
  const authToken = typeof body.authToken === "string" ? body.authToken : undefined;

  try {
    // Identity first — nothing below runs without a verified user, and the user id never comes from the client.
    const { userId } = await deps.authenticate(authToken);
    const supabase = deps.supabase();
    await assertDossierOwnership(supabase, dossierId, userId);
    await assertDocumentOwnership(supabase, documentId, dossierId, userId);

    // One column, one document — re-bound to the same owner and dossier as the checks above.
    const { data, error } = await supabase
      .from("documents")
      .update({ extraction_status: status })
      .eq("id", documentId)
      .eq("dossier_id", dossierId)
      .eq("user_id", userId)
      .select("id");
    if (error) {
      console.error("[api/lmnp/documents/extraction-status] update failed", { documentId, status, message: error.message });
      return fail(500, "Mise à jour du statut impossible.");
    }
    if (!data || data.length !== 1) throw new OwnershipError();
    return { status: 200, body: { ok: true } };
  } catch (err) {
    if (err instanceof UnauthorizedError) return fail(401, err.message);
    if (err instanceof OwnershipError) return fail(403, err.message);
    console.error("[api/lmnp/documents/extraction-status]", err);
    return fail(500, "Erreur serveur.");
  }
}
