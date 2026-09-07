import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

/**
 * P1-2 — pont client vers la route serveur P1-1 (`/api/lmnp/declaration/cerfa-pdf`).
 * Ce module ne recalcule jamais de fiscalité, ne reconstruit jamais la RFS,
 * n'invente aucun identifiant : la RFS et le `declarationVersionId` reçus en
 * paramètre sont exactement ceux de la génération affichée par
 * `DeclarationReadyView.tsx` — jamais une version historique, jamais un
 * recalcul local.
 */

export const CERFA_PDF_ROUTE = "/api/lmnp/declaration/cerfa-pdf";

/** 2033-C reste hors périmètre (P1-1/P1-2) — jamais ajouté ici sans un chantier dédié. */
export const CERFA_PDF_FORMS = ["2033-A-SD", "2033-B-SD"] as const;

export type CerfaPdfRequestPayload = {
  rfs: FiscalRepresentation;
  declarationVersionId: string;
  forms: typeof CERFA_PDF_FORMS;
};

/**
 * Payload exact envoyé à la route P1-1 — fonction pure, testable sans fetch
 * ni DOM.
 */
export function buildCerfaPdfRequestPayload(
  rfs: FiscalRepresentation,
  declarationVersionId: string,
): CerfaPdfRequestPayload {
  return { rfs, declarationVersionId, forms: CERFA_PDF_FORMS };
}

export function cerfaPdfFileName(fiscalYear: number): string {
  return `liasse-lmnp-cerfa-officiel-${fiscalYear}.pdf`;
}

/**
 * Message utilisateur à partir du corps d'erreur JSON éventuel de la route
 * (`{ error: string }` ou `{ status: "blocked", violations: [...] }`) —
 * fonction pure, testable, jamais de valeur inventée si le corps est
 * inexploitable (fallback appelé par `downloadOfficialCerfaPdf` uniquement).
 */
export function describeCerfaPdfErrorBody(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim() !== "") return record.error;
  if (record.status === "blocked" && Array.isArray(record.violations) && record.violations.length > 0) {
    const first = record.violations[0] as Record<string, unknown> | undefined;
    if (first && typeof first.message === "string") return first.message;
  }
  return undefined;
}

export type CerfaPdfDownloadError = { message: string };

/**
 * Appelle la route P1-1 et déclenche le téléchargement navigateur du PDF
 * officiel reçu. Ne transforme jamais un échec en fausse réussite : toute
 * réponse non-200 (y compris `status:"blocked"` du moteur, 422) lève une
 * `CerfaPdfDownloadError` avec un message utilisateur, jamais un
 * téléchargement partiel ou silencieux.
 */
export async function downloadOfficialCerfaPdf(payload: CerfaPdfRequestPayload, fiscalYear: number): Promise<void> {
  let response: Response;
  try {
    response = await fetch(CERFA_PDF_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw { message: "Le PDF officiel n'a pas pu être généré (connexion impossible)." } satisfies CerfaPdfDownloadError;
  }

  if (!response.ok) {
    let message: string | undefined;
    try {
      message = describeCerfaPdfErrorBody(await response.json());
    } catch {
      message = undefined;
    }
    throw {
      message: message ?? "Le PDF officiel n'a pas pu être généré. Réessayez dans quelques instants.",
    } satisfies CerfaPdfDownloadError;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = cerfaPdfFileName(fiscalYear);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
