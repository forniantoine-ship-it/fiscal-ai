import { isDispense2033AEnEffet } from "@/runtime/capabilities/rfs/dispense-2033a";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import type { DeliveryAccessContext } from "@/lib/lmnp/services/payment/entitlement-client";

/**
 * P1-2 — pont client vers la route serveur (`/api/lmnp/declaration/cerfa-pdf`).
 *
 * MB-MULTI-SERVER-TRUST-2 — la requête ne transporte AUCUNE RFS : le serveur charge le snapshot persisté courant, vérifie
 * `expectedRevision` (portée par le contexte d'accès) et recalcule la déclaration. La RFS locale ne sert ici qu'à choisir les
 * formulaires à DEMANDER (indication non autoritative : le serveur reste strict, ex. dispense 2033-A) ; elle n'est jamais envoyée.
 * Ce module ne recalcule jamais de fiscalité et n'invente aucun identifiant.
 *
 * Une régénération historique (exercice archivé) utilise le millésime actuel du moteur Cerfa ; elle ne restitue pas les bytes PDF
 * produits au moment de la clôture.
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

export type CerfaFormId = (typeof CERFA_PDF_FORMS)[number];

export type CerfaPdfRequestPayload = {
  declarationVersionId: string;
  forms: CerfaFormId[];
  /** `liasse_fiscale` : le serveur renvoie la liasse complète (pages documentaires + Cerfa), toutes deux depuis SA RFS. */
  bundle?: "liasse_fiscale";
};

/**
 * Payload exact envoyé à la route P1-1 — fonction pure, testable sans fetch
 * ni DOM.
 *
 * Dispense 2033-A (CGI, art. 302 septies A bis, VI) — quand
 * `isDispense2033AEnEffet(rfs.dispense2033A)` est vrai (ÉLIGIBLE + décision
 * client `USE_DISPENSE`, seule source de vérité, voir `dispense-2033a.ts`),
 * "2033-A-SD" est retiré de la sélection : le 2033-A n'est alors JAMAIS
 * demandé à la route, jamais généré en blanc ni en partiel. FILE_2033A et
 * NOT_ELIGIBLE (dispense non en effet) conservent exactement la sélection
 * historique (les 6 formulaires).
 */
export function buildCerfaPdfRequestPayload(
  rfs: FiscalRepresentation,
  declarationVersionId: string,
  options: { bundle?: "liasse_fiscale" } = {},
): CerfaPdfRequestPayload {
  const forms = isDispense2033AEnEffet(rfs.dispense2033A)
    ? CERFA_PDF_FORMS.filter((form) => form !== "2033-A-SD")
    : [...CERFA_PDF_FORMS];
  return { declarationVersionId, forms, ...(options.bundle ? { bundle: options.bundle } : {}) };
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
export async function fetchOfficialCerfaPdfBytes(
  payload: CerfaPdfRequestPayload,
  /** Payment V1 — contexte d'accès (authToken, dossierId, fiscalYear) : sans lui, le serveur répond 401. */
  access?: DeliveryAccessContext,
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(CERFA_PDF_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(access ? { ...payload, ...access } : payload),
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
