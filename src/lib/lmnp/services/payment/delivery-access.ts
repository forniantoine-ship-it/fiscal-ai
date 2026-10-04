/**
 * Payment V1 — accès à la LIVRAISON finale payée (Cerfa, aide 2042-C-PRO).
 *
 *   AUTH → PROPRIÉTÉ → ENTITLEMENT PAYÉ (dossier + exercice) → [déclarabilité, côté route] → PDF
 *
 * L'entitlement est la ligne serveur `status = 'paid'` pour (dossier, exercice) :
 * jamais `paidAt` local, jamais une URL de succès. Aucun compteur, aucune
 * consommation : un exercice payé se régénère et se retélécharge sans limite.
 * Un exercice payé ne débloque jamais un autre exercice ni un autre dossier.
 *
 * Lot 5.3 — si `prior_history_status === EXTERNAL_HISTORY`, la livraison exige
 * en plus une FiscalYearOpening usable (même garde 4F.2 que le checkout).
 * Absent / wrong year / pending / wrong source → 403 fail-closed.
 *
 * MB-MULTI-SERVER-TRUST-2 — cette Opening est lue dans le snapshot PERSISTÉ du serveur, jamais dans la requête : un client ne peut
 * ni la fournir ni la remplacer. Sans lecteur de snapshot, sans ligne ou avec un payload illisible : fail-closed (403).
 */
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";
import { isUsableExternalTakeoverOpening } from "@/lib/lmnp/services/fiscal-year-opening/is-usable-external-takeover-opening";
import { parseWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import { isNonEmptyString, jsonResponse, mapPaymentError, parseFiscalYear } from "./payment-http";
import { createDeliveryDeps, type PaymentDeps } from "./payment-server";

export type DeliveryAccessInput = {
  authToken?: unknown;
  dossierId?: unknown;
  fiscalYear?: unknown;
};

export type DeliveryAccessResult =
  | { ok: true; fiscalYear?: number }
  | { ok: false; response: Response };

export type DeliveryAccessResolver = (input: DeliveryAccessInput) => Promise<DeliveryAccessResult>;
type DeliveryDeps = Pick<PaymentDeps, "authenticate" | "assertOwnership" | "store"> & Partial<Pick<PaymentDeps, "readWorkspaceSnapshot">>;

/** Opening externe PERSISTÉE côté serveur (snapshot courant de l'exercice) ; `undefined` si elle n'est pas établie. */
async function persistedExternalOpening(deps: DeliveryDeps, dossierId: string, fiscalYear: number): Promise<FiscalYearOpening | undefined> {
  if (!deps.readWorkspaceSnapshot) return undefined;
  const row = await deps.readWorkspaceSnapshot(dossierId, fiscalYear);
  if (!row) return undefined;
  const parsed = parseWorkspaceSnapshot(row.payload);
  return parsed.ok ? parsed.envelope.workspace.fiscalYear.externalTakeoverOpening?.opening : undefined;
}

export async function resolveDeliveryAccess(
  input: DeliveryAccessInput,
  deps: DeliveryDeps,
): Promise<DeliveryAccessResult> {
  const fiscalYear = parseFiscalYear(input.fiscalYear);
  const dossierId = isNonEmptyString(input.dossierId) ? input.dossierId.trim() : null;
  const authToken = typeof input.authToken === "string" ? input.authToken : undefined;

  try {
    // Identité d'abord : un appel anonyme n'apprend rien de plus qu'un 401.
    const { userId } = await deps.authenticate(authToken);
    if (!dossierId || fiscalYear === null) {
      return {
        ok: false,
        response: jsonResponse(400, { error: "dossierId et fiscalYear requis.", code: "invalid_request" }),
      };
    }
    await deps.assertOwnership(dossierId, userId);

    const row = await deps.store.getByDossierYear(dossierId, fiscalYear);
    if (!row || row.status !== "paid") {
      return {
        ok: false,
        response: jsonResponse(402, {
          error: "Le paiement de cet exercice est requis pour télécharger vos documents.",
          code: "payment_required",
        }),
      };
    }
    // Lot 5.3 — EXTERNAL_HISTORY : livraison seulement avec Opening usable (4F.2).
    if (row.prior_history_status === "EXTERNAL_HISTORY") {
      const opening = await persistedExternalOpening(deps, dossierId, fiscalYear);
      if (!isUsableExternalTakeoverOpening(opening, fiscalYear)) {
        return {
          ok: false,
          response: jsonResponse(403, {
            error: "La reprise de votre comptabilité précédente n'est pas encore disponible.",
            code: "prior_history_not_eligible",
          }),
        };
      }
    }
    return { ok: true, fiscalYear };
  } catch (err) {
    return { ok: false, response: mapPaymentError("delivery-access", err) };
  }
}

/** Résolveur de production : dépendances réelles construites à chaque appel (échec fermé si config absente). */
export const defaultResolveDeliveryAccess: DeliveryAccessResolver = async (input) => {
  try {
    return await resolveDeliveryAccess(input, createDeliveryDeps());
  } catch (err) {
    return { ok: false, response: mapPaymentError("delivery-access", err) };
  }
};
