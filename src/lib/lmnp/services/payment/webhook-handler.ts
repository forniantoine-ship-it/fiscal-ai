/**
 * Payment V1 — POST /api/stripe/webhook : SEULE source qui marque un exercice payé.
 *
 * - corps BRUT + signature vérifiée avec STRIPE_WEBHOOK_SECRET (invalide → 400) ;
 * - événements traités : `checkout.session.completed` et
 *   `checkout.session.async_payment_succeeded`, uniquement si `payment_status = paid` ;
 * - la ligne est retrouvée par `metadata.paymentId` ; dossier, exercice, montant
 *   (14 900 centimes) et devise (EUR) doivent correspondre EXACTEMENT à la ligne
 *   serveur, sinon rien n'est débloqué (fail-closed, 422 visible dans Stripe) ;
 * - idempotent : un événement rejoué ne change rien (transition pending → paid unique).
 *
 * Jamais une URL de succès, jamais un paramètre de requête : uniquement cet événement signé.
 */
import { jsonResponse, mapPaymentError } from "./payment-http";
import { createDefaultPaymentDeps, type PaymentDeps } from "./payment-server";

const HANDLED_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

export async function handleStripeWebhook(
  request: Request,
  depsFactory: () => Pick<PaymentDeps, "store" | "stripe"> = createDefaultPaymentDeps,
): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const deps = depsFactory();

    let event;
    try {
      event = deps.stripe.constructWebhookEvent(rawBody, signature);
    } catch {
      return jsonResponse(400, { error: "Signature invalide.", code: "invalid_signature" });
    }

    if (!HANDLED_EVENTS.has(event.type) || !event.session) {
      return jsonResponse(200, { received: true, ignored: true });
    }
    const session = event.session;
    if (session.paymentStatus !== "paid") {
      // Paiement asynchrone encore en attente : aucun droit accordé.
      return jsonResponse(200, { received: true, ignored: true });
    }

    const paymentId = session.metadata.paymentId;
    if (!paymentId || session.clientReferenceId !== paymentId) {
      console.error("[stripe/webhook] session payée sans référence de paiement cohérente", { session: session.id });
      return jsonResponse(200, { received: true, ignored: true });
    }

    const row = await deps.store.getById(paymentId);
    if (!row) {
      console.error("[stripe/webhook] paiement inconnu", { paymentId, session: session.id });
      return jsonResponse(200, { received: true, ignored: true });
    }

    const identityMatches =
      session.metadata.dossierId === row.dossier_id && session.metadata.fiscalYear === String(row.fiscal_year);
    const amountMatches = session.amountTotal === row.amount_cents && session.currency === row.currency;
    if (!identityMatches || !amountMatches) {
      console.error("[stripe/webhook] incohérence paiement/entitlement — RIEN débloqué", {
        paymentId,
        session: session.id,
        identityMatches,
        amountMatches,
      });
      return jsonResponse(422, { error: "Paiement incohérent avec l'entitlement.", code: "payment_mismatch" });
    }

    if (row.prior_history_status === "EXTERNAL_HISTORY") {
      console.error("[stripe/webhook] paiement reçu alors que l'historique externe est déclaré — livraison fermée, REMBOURSEMENT à traiter", {
        paymentId,
        session: session.id,
      });
    }

    if (row.status === "paid") {
      if (row.stripe_checkout_session_id && row.stripe_checkout_session_id !== session.id) {
        console.error("[stripe/webhook] DEUXIÈME paiement pour un exercice déjà payé — remboursement à traiter", {
          paymentId,
          session: session.id,
        });
      }
      return jsonResponse(200, { received: true, alreadyPaid: true });
    }

    const outcome = await deps.store.markPaid(row.id, {
      sessionId: session.id,
      paymentIntentId: session.paymentIntentId,
    });
    return jsonResponse(200, { received: true, alreadyPaid: outcome === "already_paid" });
  } catch (err) {
    return mapPaymentError("stripe/webhook", err);
  }
}
