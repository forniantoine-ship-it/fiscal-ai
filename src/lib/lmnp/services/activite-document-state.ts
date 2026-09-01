import type { DeclarationDraft, LmnpDocument } from "@/lib/lmnp/types";

export type ActiviteDocumentState = "empty" | "processing" | "done" | "interrupted";

/** Délai normal entre l'upload et le déclenchement auto du pipeline (statut encore "uploaded"). */
export const ACTIVITE_UPLOAD_TRIGGER_GRACE_MS = 10_000;

/** Au-delà, un statut "processing" sans progression est considéré comme mort. */
export const ACTIVITE_PROCESSING_TIMEOUT_MS = 3 * 60_000;

/**
 * Résout l'état UI cible de l'écran Activité/INPI à partir des seules données persistées.
 * Pure — aucune lecture d'horloge globale, `now` est injecté par l'appelant.
 */
export function resolveActiviteDocumentState(
  draft: DeclarationDraft | undefined,
  inpiDoc: LmnpDocument | undefined,
  now: number,
): ActiviteDocumentState {
  if (!draft?.inpiDocumentId) return "empty";

  if (draft.inpiConfirmedAt) return "done";
  if (inpiDoc?.status === "analyzed" && draft.inpiGptPrefillAppliedAt) return "done";

  if (inpiDoc?.status === "failed") return "interrupted";

  if (inpiDoc?.status === "uploaded") {
    const sinceUpload = now - Date.parse(inpiDoc.uploadedAt);
    return sinceUpload < ACTIVITE_UPLOAD_TRIGGER_GRACE_MS ? "processing" : "interrupted";
  }

  if (inpiDoc?.status === "processing") {
    const startedAt = draft.inpiExtractionStartedAt;
    if (!startedAt) return "interrupted";
    const sinceStart = now - Date.parse(startedAt);
    return sinceStart < ACTIVITE_PROCESSING_TIMEOUT_MS ? "processing" : "interrupted";
  }

  return "interrupted";
}
