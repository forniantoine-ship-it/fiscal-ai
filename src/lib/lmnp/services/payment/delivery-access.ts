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
 */
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";
import { isUsableExternalTakeoverOpening } from "@/lib/lmnp/services/fiscal-year-opening/is-usable-external-takeover-opening";
import { isNonEmptyString, jsonResponse, mapPaymentError, parseFiscalYear } from "./payment-http";
import { createDeliveryDeps, type PaymentDeps } from "./payment-server";

export type DeliveryAccessInput = {
  authToken?: unknown;
  dossierId?: unknown;
  fiscalYear?: unknown;
  /** Lot 5.3 — Opening externe persistée, requise si EXTERNAL_HISTORY. */
  fiscalYearOpening?: unknown;
};

export type DeliveryAccessResult =
  | { ok: true; fiscalYear?: number }
  | { ok: false; response: Response };

export type DeliveryAccessResolver = (input: DeliveryAccessInput) => Promise<DeliveryAccessResult>;
type DeliveryDeps = Pick<PaymentDeps, "authenticate" | "assertOwnership" | "store">;

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
      const opening =
        input.fiscalYearOpening && typeof input.fiscalYearOpening === "object"
          ? (input.fiscalYearOpening as FiscalYearOpening)
          : undefined;
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
