/**
 * TESTS UNIQUEMENT — doublures en mémoire de la frontière de paiement (base
 * Supabase + passerelle Stripe). Aucune route ni aucun composant ne les importe ;
 * Stripe n'est jamais appelé pour de vrai dans les tests.
 */
import { OwnershipError, UnauthorizedError } from "@/lib/supabase-server";
import { GENERATION_PRICE_CENTS, PAYMENT_CURRENCY } from "./price";
import type {
  CreateCheckoutSessionParams,
  PaymentDeps,
  PaymentRow,
  PaymentStore,
  StripeCheckoutSessionInfo,
  StripeGateway,
} from "./payment-server";
import type { PriorHistoryDeclarationStatus } from "@/lib/lmnp/types/domain";

export function createFakePaymentEnv() {
  const rows: PaymentRow[] = [];
  const owners = new Map<string, string>(); // dossierId → userId
  const tokens = new Map<string, string>(); // authToken → userId
  const markPaidCalls: string[] = [];
  const created: CreateCheckoutSessionParams[] = [];
  const expired: string[] = [];
  const sessionStates = new Map<string, StripeCheckoutSessionInfo>();
  let seq = 0;

  const store: PaymentStore = {
    async getById(id) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async getByDossierYear(dossierId, fiscalYear) {
      return rows.find((r) => r.dossier_id === dossierId && r.fiscal_year === fiscalYear) ?? null;
    },
    async ensureRow(dossierId, fiscalYear) {
      const existing = rows.find((r) => r.dossier_id === dossierId && r.fiscal_year === fiscalYear);
      if (existing) return existing;
      const row: PaymentRow = {
        id: `pay-${++seq}`,
        dossier_id: dossierId,
        fiscal_year: fiscalYear,
        status: "pending",
        amount_cents: GENERATION_PRICE_CENTS,
        currency: PAYMENT_CURRENCY,
        prior_history_status: null,
        prior_history_declared_at: null,
        stripe_checkout_session_id: null,
        stripe_payment_intent_id: null,
        created_at: new Date().toISOString(),
        paid_at: null,
      };
      rows.push(row);
      return row;
    },
    async setPriorHistory(id, status: PriorHistoryDeclarationStatus) {
      const row = rows.find((r) => r.id === id)!;
      row.prior_history_status = status;
      row.prior_history_declared_at = new Date().toISOString();
    },
    async attachSession(id, sessionId) {
      const row = rows.find((r) => r.id === id)!;
      if (row.status === "pending") row.stripe_checkout_session_id = sessionId;
    },
    async clearSession(id) {
      const row = rows.find((r) => r.id === id)!;
      if (row.status === "pending") row.stripe_checkout_session_id = null;
    },
    async markPaid(id, { sessionId, paymentIntentId }) {
      markPaidCalls.push(id);
      const row = rows.find((r) => r.id === id)!;
      if (row.status === "paid") return "already_paid";
      row.status = "paid";
      row.paid_at = new Date().toISOString();
      row.stripe_checkout_session_id = sessionId;
      row.stripe_payment_intent_id = paymentIntentId;
      return "marked";
    },
  };

  const stripe: StripeGateway = {
    async createCheckoutSession(params) {
      created.push(params);
      const id = `cs_test_${created.length}`;
      const url = `https://checkout.stripe.test/pay/${id}`;
      sessionStates.set(id, { id, url, status: "open", paymentStatus: "unpaid" });
      return { id, url };
    },
    async retrieveCheckoutSession(id) {
      const state = sessionStates.get(id);
      if (!state) throw new Error("unknown session");
      return state;
    },
    async expireCheckoutSession(id) {
      expired.push(id);
      const state = sessionStates.get(id);
      if (state) sessionStates.set(id, { ...state, url: null, status: "expired" });
    },
    constructWebhookEvent() {
      throw new Error("non utilisé : les tests de webhook utilisent la vraie vérification de signature");
    },
  };

  const deps: PaymentDeps = {
    async authenticate(authToken) {
      const userId = authToken ? tokens.get(authToken) : undefined;
      if (!userId) throw new UnauthorizedError();
      return { userId };
    },
    async assertOwnership(dossierId, userId) {
      if (owners.get(dossierId) !== userId) throw new OwnershipError();
    },
    store,
    stripe,
  };

  return {
    rows,
    store,
    stripe,
    deps,
    created,
    expired,
    markPaidCalls,
    sessionStates,
    addUser(token: string, userId: string) {
      tokens.set(token, userId);
    },
    addDossier(dossierId: string, ownerUserId: string) {
      owners.set(dossierId, ownerUserId);
    },
    async seedPaid(dossierId: string, fiscalYear: number, priorHistory: PriorHistoryDeclarationStatus | null = "FIRST_REAL_YEAR") {
      const row = await store.ensureRow(dossierId, fiscalYear);
      row.prior_history_status = priorHistory;
      await store.markPaid(row.id, { sessionId: `cs_seed_${row.id}`, paymentIntentId: `pi_seed_${row.id}` });
      markPaidCalls.length = 0;
      return row;
    },
  };
}

export function jsonPost(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
