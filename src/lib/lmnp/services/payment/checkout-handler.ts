/**
 * Payment V1 — POST /api/lmnp/payment/checkout
 *
 * Ordre imposé (jamais de Checkout créé avant d'avoir écarté un dossier non
 * éligible — un dossier non éligible n'est jamais facturé) :
 *
 *   1. authentification            → 401
 *   2. propriété du dossier        → 403
 *   3. exercice terminé            → 409 `fiscal_year_not_closed` (ni ligne, ni session)
 *   4. éligibilité d'antériorité   → 403 `prior_history_not_eligible` (AVANT tout argent)
 *   5. entitlement déjà payé       → 200 `already_paid` (aucun second paiement)
 *   6. ligne pending créée/réutilisée
 *   7. session Stripe Checkout     → 200 `checkout` + URL hébergée
 *
 * Le prix, la devise et l'identité viennent du serveur ; le client ne fournit
 * que `dossierId`, `fiscalYear` et ses faits de continuité (non fiables).
 */
import {
  isNonEmptyString,
  jsonResponse,
  mapPaymentError,
  parseFiscalYear,
  rejectUnclosedFiscalYear,
} from "./payment-http";
import {
  createDefaultPaymentDeps,
  type PaymentDeps,
  type PaymentRow,
} from "./payment-server";
import { GENERATION_PRICE_CENTS, PAYMENT_CURRENCY } from "./price";
import { resolveServerPriorHistoryEligibility, type ClientContinuityFacts } from "./server-prior-history";

type CheckoutBody = {
  authToken?: unknown;
  dossierId?: unknown;
  fiscalYear?: unknown;
  continuity?: unknown;
};

function safeContinuity(value: unknown): ClientContinuityFacts | undefined {
  if (!value || typeof value !== "object") return undefined;
  const c = value as Record<string, unknown>;
  return {
    previousFiscalYearId: typeof c.previousFiscalYearId === "string" ? c.previousFiscalYearId : undefined,
    stocksOuverture: c.stocksOuverture as ClientContinuityFacts["stocksOuverture"],
    stocksOuvertureUnavailableReason:
      typeof c.stocksOuvertureUnavailableReason === "string" ? c.stocksOuvertureUnavailableReason : undefined,
    // Lot 5.3 — Opening transmise telle quelle ; la garde structurelle 4F.2 décide.
    fiscalYearOpening:
      c.fiscalYearOpening && typeof c.fiscalYearOpening === "object"
        ? (c.fiscalYearOpening as ClientContinuityFacts["fiscalYearOpening"])
        : undefined,
  };
}

async function reuseOpenSession(deps: PaymentDeps, row: PaymentRow): Promise<Response | null> {
  if (!row.stripe_checkout_session_id) return null;
  try {
    const session = await deps.stripe.retrieveCheckoutSession(row.stripe_checkout_session_id);
    if (session.status === "open" && session.url) {
      return jsonResponse(200, { status: "checkout", url: session.url });
    }
    if (session.status === "complete") {
      // Payé (ou paiement asynchrone en cours) côté Stripe, webhook pas encore
      // reçu : jamais de second paiement.
      return jsonResponse(200, { status: "payment_processing" });
    }
  } catch (err) {
    console.warn("[payment/checkout] session précédente illisible, nouvelle session", err);
  }
  return null;
}

export async function handleCheckoutRequest(
  request: Request,
  depsFactory: () => PaymentDeps = createDefaultPaymentDeps,
): Promise<Response> {
  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return jsonResponse(400, { error: "Corps de requête JSON invalide.", code: "invalid_request" });
  }
  if (!body || typeof body !== "object") {
    return jsonResponse(400, { error: "Corps de requête JSON invalide.", code: "invalid_request" });
  }

  try {
    const deps = depsFactory();
    const authToken = typeof body.authToken === "string" ? body.authToken : undefined;

    const { userId } = await deps.authenticate(authToken);

    const dossierId = isNonEmptyString(body.dossierId) ? body.dossierId.trim() : null;
    const fiscalYear = parseFiscalYear(body.fiscalYear);
    if (!dossierId || fiscalYear === null) {
      return jsonResponse(400, { error: "dossierId et fiscalYear requis.", code: "invalid_request" });
    }

    await deps.assertOwnership(dossierId, userId);

    const notClosed = rejectUnclosedFiscalYear(deps, fiscalYear);
    if (notClosed) return notClosed;

    const existing = await deps.store.getByDossierYear(dossierId, fiscalYear);
    const previous = await deps.store.getByDossierYear(dossierId, fiscalYear - 1);
    const eligibility = resolveServerPriorHistoryEligibility({
      declaration: existing?.prior_history_status,
      previousYearPaid: previous?.status === "paid",
      clientContinuity: safeContinuity(body.continuity),
      requestedFiscalYear: fiscalYear,
    });
    if (!eligibility.eligible) {
      return jsonResponse(403, {
        error:
          "Pour établir correctement votre déclaration, nous devons reprendre certains éléments de votre comptabilité précédente. Cette reprise n'est pas encore disponible.",
        code: "prior_history_not_eligible",
        reason: eligibility.reason,
      });
    }

    if (existing?.status === "paid") {
      return jsonResponse(200, { status: "already_paid" });
    }

    const row = existing ?? (await deps.store.ensureRow(dossierId, fiscalYear));
    const reusable = await reuseOpenSession(deps, row);
    if (reusable) return reusable;

    const origin = new URL(request.url).origin;
    const returnBase = `${origin}/documents?step=validation&fy=${fiscalYear}`;
    const session = await deps.stripe.createCheckoutSession({
      paymentId: row.id,
      dossierId,
      fiscalYear,
      userId,
      // Prix et devise : serveur uniquement, jamais le payload.
      amountCents: GENERATION_PRICE_CENTS,
      currency: PAYMENT_CURRENCY,
      successUrl: `${returnBase}&checkout=success`,
      cancelUrl: `${returnBase}&checkout=cancelled`,
      idempotencyKey: `lmnp-checkout-${row.id}-${Math.floor(Date.now() / 60_000)}`,
    });
    await deps.store.attachSession(row.id, session.id);

    return jsonResponse(200, { status: "checkout", url: session.url });
  } catch (err) {
    return mapPaymentError("payment/checkout", err);
  }
}
