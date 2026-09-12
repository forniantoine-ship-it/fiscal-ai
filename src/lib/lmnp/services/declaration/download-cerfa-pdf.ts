import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

/**
 * P1-2 — pont client vers la route serveur P1-1 (`/api/lmnp/declaration/cerfa-pdf`).
 * Ce module ne recalcule jamais de fiscalité, ne reconstruit jamais la RFS,
 * n'invente aucun identifiant : la RFS et le `declarationVersionId` reçus
 * en paramètre sont ceux fournis par l'appelant.
 *
 * L'appelant peut être l'exercice actif ou un exercice archivé. Dans les
 * deux cas, `fetchOfficialCerfaPdfBytes` n'ouvre pas le workspace : il
 * envoie le RFS et le `declarationVersionId` tels quels. Une régénération
 * historique utilise donc le millésime actuel du moteur Cerfa ; elle ne
 * restitue pas les bytes PDF produits au moment de la clôture.
 */

export const CERFA_PDF_ROUTE = "/api/lmnp/declaration/cerfa-pdf";

/**
 * P1-6C — liasse LMNP réel simplifié complète, dans l'ordre canonique
 * (`ALL_CERFA_FORM_IDS`, `src/lib/lmnp/services/liasse-pdf/types.ts`) :
 * 2031-SD, 2031-bis-SD, puis 2033-A/B/C/D-SD. Sélection par défaut du
 * téléchargement utilisateur — la route reste capable d'accepter un
 * sous-ensemble si un futur appelant le demande explicitement.
 */
export const CERFA_PDF_FORMS = [
  "2031-SD",
  "2031-bis-SD",
  "2033-A-SD",
  "2033-B-SD",
  "2033-C-SD",
  "2033-D-SD",
] as const;

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

/**
 * Message utilisateur à partir du corps d'erreur JSON éventuel de la route
 * (`{ error: string }` ou `{ status: "blocked", violations: [...] }`) —
 * fonction pure, testable, jamais de valeur inventée si le corps est
 * inexploitable. Consommée par `fetchOfficialCerfaPdfBytes`.
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
 * Appelle la route P1-1 et retourne les bytes du PDF Cerfa. Aucun mapper,
 * aucun recalcul : le serveur reste l'unique producteur des Cerfa.
 * Copie défensive du buffer (pdf-lib peut réécrire un ArrayBuffer partagé).
 */
export async function fetchOfficialCerfaPdfBytes(payload: CerfaPdfRequestPayload): Promise<Uint8Array> {
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

  const bytes = new Uint8Array(await response.arrayBuffer());
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}
