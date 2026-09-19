/**
 * Payment V1 — POST /api/lmnp/payment/prior-history
 *
 * Enregistre côté serveur la réponse du client sur l'antériorité LMNP (P0), pour
 * (dossier, exercice). C'est CETTE valeur — jamais le payload du checkout — que
 * l'éligibilité serveur lit avant de créer une session Stripe.
 */
import type { PriorHistoryDeclarationStatus } from "@/lib/lmnp/types/domain";
import { isNonEmptyString, jsonResponse, mapPaymentError, parseFiscalYear } from "./payment-http";
import { createDefaultPaymentDeps, type PaymentDeps } from "./payment-server";

const STATUSES: readonly PriorHistoryDeclarationStatus[] = [
  "FIRST_REAL_YEAR",
  "FISCAL_AI_PREVIOUS",
  "EXTERNAL_HISTORY",
];

export async function handlePriorHistoryRequest(
  request: Request,
  depsFactory: () => PaymentDeps = createDefaultPaymentDeps,
): Promise<Response> {
  let body: { authToken?: unknown; dossierId?: unknown; fiscalYear?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Corps de requête JSON invalide.", code: "invalid_request" });
  }
  if (!body || typeof body !== "object") {
    return jsonResponse(400, { error: "Corps de requête JSON invalide.", code: "invalid_request" });
  }

  try {
    const deps = depsFactory();
    const { userId } = await deps.authenticate(typeof body.authToken === "string" ? body.authToken : undefined);

    const dossierId = isNonEmptyString(body.dossierId) ? body.dossierId.trim() : null;
    const fiscalYear = parseFiscalYear(body.fiscalYear);
    const status = STATUSES.find((s) => s === body.status);
    if (!dossierId || fiscalYear === null || !status) {
      return jsonResponse(400, { error: "dossierId, fiscalYear et status valides requis.", code: "invalid_request" });
    }

    await deps.assertOwnership(dossierId, userId);
    const row = await deps.store.ensureRow(dossierId, fiscalYear);
    const changed = row.prior_history_status !== status;
    await deps.store.setPriorHistory(row.id, status);

    // Une session Checkout ouverte a été créée sous l'ANCIENNE réponse : si la
    // réponse change, elle ne doit plus pouvoir être payée (un dossier non
    // éligible ne doit jamais être facturé). On l'expire ; la session n'est détachée
    // QUE si l'expiration a réussi. Si elle échoue (session déjà payée/en cours de
    // confirmation, ou erreur réseau), l'identifiant est conservé : le prochain
    // checkout retrouve cette session (ouverte → même URL ; complétée →
    // payment_processing) au lieu d'en ouvrir une seconde payable en double.
    if (changed && row.status === "pending" && row.stripe_checkout_session_id) {
      try {
        await deps.stripe.expireCheckoutSession(row.stripe_checkout_session_id);
        await deps.store.clearSession(row.id);
      } catch (err) {
        console.error("[payment/prior-history] expiration de la session impossible — session conservée", err);
      }
    }
    return jsonResponse(200, { ok: true, status });
  } catch (err) {
    return mapPaymentError("payment/prior-history", err);
  }
}
