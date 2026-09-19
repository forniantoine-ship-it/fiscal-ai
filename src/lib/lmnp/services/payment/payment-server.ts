/**
 * Payment V1 — frontière serveur : persistance de l'entitlement + passerelle
 * Stripe + dépendances injectables des handlers.
 *
 * Aucune logique fiscale. Aucune confiance accordée au client : identité
 * (`getServerSupabaseForUser`), propriété (`assertDossierOwnership`) et statut
 * payé (table `lmnp_declaration_payments`, écrite uniquement par le webhook via
 * le service role) sont tous établis ici, côté serveur.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import {
  assertDossierOwnership,
  getServerSupabaseForUser,
} from "@/lib/supabase-server";
import type { PriorHistoryDeclarationStatus } from "@/lib/lmnp/types/domain";
import { GENERATION_PRICE_CENTS, PAYMENT_CURRENCY } from "./price";

/** Configuration de paiement absente : échec fermé, jamais de repli (HTTP 503). */
export class PaymentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConfigError";
  }
}

export type PaymentStatus = "pending" | "paid";

export type PaymentRow = {
  id: string;
  dossier_id: string;
  fiscal_year: number;
  status: PaymentStatus;
  amount_cents: number;
  currency: string;
  prior_history_status: PriorHistoryDeclarationStatus | null;
  prior_history_declared_at: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  paid_at: string | null;
};

export interface PaymentStore {
  getById(paymentId: string): Promise<PaymentRow | null>;
  getByDossierYear(dossierId: string, fiscalYear: number): Promise<PaymentRow | null>;
  /** Crée la ligne (pending, montant serveur) si absente ; jamais de doublon (dossier, année). */
  ensureRow(dossierId: string, fiscalYear: number): Promise<PaymentRow>;
  setPriorHistory(paymentId: string, status: PriorHistoryDeclarationStatus): Promise<void>;
  attachSession(paymentId: string, sessionId: string): Promise<void>;
  /** Détache la session Checkout d'une ligne pending (la réponse P0 a changé : la session ne doit plus servir). */
  clearSession(paymentId: string): Promise<void>;
  /** Transition pending → paid, atomique et idempotente. `already_paid` si déjà payé. */
  markPaid(
    paymentId: string,
    input: { sessionId: string; paymentIntentId: string | null },
  ): Promise<"marked" | "already_paid">;
}

const PAYMENT_COLUMNS =
  "id, dossier_id, fiscal_year, status, amount_cents, currency, prior_history_status, prior_history_declared_at, stripe_checkout_session_id, stripe_payment_intent_id, created_at, paid_at";

/** Client service role STRICT : contrairement à `getServerSupabaseUnscoped()`, jamais de repli sur la clé anonyme. */
export function getPaymentServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new PaymentConfigError("Configuration Supabase du paiement manquante (SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function createSupabasePaymentStore(client: SupabaseClient): PaymentStore {
  return {
    async getById(paymentId) {
      const { data, error } = await client
        .from("lmnp_declaration_payments")
        .select(PAYMENT_COLUMNS)
        .eq("id", paymentId)
        .maybeSingle();
      if (error) throw new Error(`payment lookup failed: ${error.message}`);
      return (data as PaymentRow | null) ?? null;
    },

    async getByDossierYear(dossierId, fiscalYear) {
      const { data, error } = await client
        .from("lmnp_declaration_payments")
        .select(PAYMENT_COLUMNS)
        .eq("dossier_id", dossierId)
        .eq("fiscal_year", fiscalYear)
        .maybeSingle();
      if (error) throw new Error(`payment lookup failed: ${error.message}`);
      return (data as PaymentRow | null) ?? null;
    },

    async ensureRow(dossierId, fiscalYear) {
      const existing = await this.getByDossierYear(dossierId, fiscalYear);
      if (existing) return existing;
      const { data, error } = await client
        .from("lmnp_declaration_payments")
        .insert({
          dossier_id: dossierId,
          fiscal_year: fiscalYear,
          amount_cents: GENERATION_PRICE_CENTS,
          currency: PAYMENT_CURRENCY,
        })
        .select(PAYMENT_COLUMNS)
        .single();
      if (error) {
        // Course entre deux requêtes : la contrainte UNIQUE(dossier, année) a tranché.
        const raced = await this.getByDossierYear(dossierId, fiscalYear);
        if (raced) return raced;
        throw new Error(`payment row creation failed: ${error.message}`);
      }
      return data as PaymentRow;
    },

    async setPriorHistory(paymentId, status) {
      const { error } = await client
        .from("lmnp_declaration_payments")
        .update({ prior_history_status: status, prior_history_declared_at: new Date().toISOString() })
        .eq("id", paymentId);
      if (error) throw new Error(`prior history update failed: ${error.message}`);
    },

    async attachSession(paymentId, sessionId) {
      const { error } = await client
        .from("lmnp_declaration_payments")
        .update({ stripe_checkout_session_id: sessionId })
        .eq("id", paymentId)
        .eq("status", "pending");
      if (error) throw new Error(`session attach failed: ${error.message}`);
    },

    async clearSession(paymentId) {
      const { error } = await client
        .from("lmnp_declaration_payments")
        .update({ stripe_checkout_session_id: null })
        .eq("id", paymentId)
        .eq("status", "pending");
      if (error) throw new Error(`session clear failed: ${error.message}`);
    },

    async markPaid(paymentId, { sessionId, paymentIntentId }) {
      const { data, error } = await client
        .from("lmnp_declaration_payments")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe_checkout_session_id: sessionId,
          stripe_payment_intent_id: paymentIntentId,
        })
        .eq("id", paymentId)
        .eq("status", "pending")
        .select("id");
      if (error) throw new Error(`mark paid failed: ${error.message}`);
      return data && data.length > 0 ? "marked" : "already_paid";
    },
  };
}

// -- Passerelle Stripe ------------------------------------------------------

export type StripeCheckoutSessionInfo = {
  id: string;
  url: string | null;
  status: string | null;
  paymentStatus: string | null;
};

export type StripeSessionEventData = {
  id: string;
  paymentStatus: string | null;
  amountTotal: number | null;
  currency: string | null;
  paymentIntentId: string | null;
  clientReferenceId: string | null;
  metadata: Record<string, string>;
};

export type StripeWebhookEvent = {
  id: string;
  type: string;
  session: StripeSessionEventData | null;
};

export type CreateCheckoutSessionParams = {
  paymentId: string;
  dossierId: string;
  fiscalYear: number;
  userId: string;
  amountCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
};

export interface StripeGateway {
  createCheckoutSession(params: CreateCheckoutSessionParams): Promise<{ id: string; url: string }>;
  retrieveCheckoutSession(sessionId: string): Promise<StripeCheckoutSessionInfo>;
  /** Expire une session ouverte (elle ne peut plus être payée). */
  expireCheckoutSession(sessionId: string): Promise<void>;
  /** Vérifie la signature sur le corps BRUT ; lève si invalide. */
  constructWebhookEvent(rawBody: string, signatureHeader: string | null): StripeWebhookEvent;
}

type StripeLike = Pick<Stripe, "checkout" | "webhooks">;

export function createStripeGateway(stripe: StripeLike, webhookSecret: string): StripeGateway {
  return {
    async createCheckoutSession(p) {
      const metadata = {
        paymentId: p.paymentId,
        dossierId: p.dossierId,
        fiscalYear: String(p.fiscalYear),
        userId: p.userId,
      };
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          locale: "fr",
          // V1 : Stripe n'est qu'un prestataire de paiement (Hosted Checkout), pas le marchand de
          // référence. Explicite pour ne pas dépendre du réglage Managed Payments du compte, qui
          // exigerait sinon un `tax_code` produit (aucune décision TVA/fiscale n'est prise ici).
          managed_payments: { enabled: false },
          client_reference_id: p.paymentId,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: p.currency,
                unit_amount: p.amountCents,
                product_data: { name: `Fiscal AI — Déclaration LMNP ${p.fiscalYear}` },
              },
            },
          ],
          metadata,
          payment_intent_data: { metadata },
          success_url: p.successUrl,
          cancel_url: p.cancelUrl,
        },
        { idempotencyKey: p.idempotencyKey },
      );
      if (!session.url) throw new Error("Stripe n'a pas renvoyé d'URL de paiement.");
      return { id: session.id, url: session.url };
    },

    async retrieveCheckoutSession(sessionId) {
      const s = await stripe.checkout.sessions.retrieve(sessionId);
      return {
        id: s.id,
        url: s.url ?? null,
        status: s.status ?? null,
        paymentStatus: s.payment_status ?? null,
      };
    },

    async expireCheckoutSession(sessionId) {
      await stripe.checkout.sessions.expire(sessionId);
    },

    constructWebhookEvent(rawBody, signatureHeader) {
      if (!signatureHeader) throw new Error("Signature Stripe absente.");
      const event = stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
      const object = event.data.object as unknown as Record<string, unknown> | undefined;
      const isSession = event.type.startsWith("checkout.session.") && object?.object === "checkout.session";
      return {
        id: event.id,
        type: event.type,
        session: isSession
          ? {
              id: String(object.id),
              paymentStatus: (object.payment_status as string | null | undefined) ?? null,
              amountTotal: (object.amount_total as number | null | undefined) ?? null,
              currency: (object.currency as string | null | undefined) ?? null,
              paymentIntentId:
                typeof object.payment_intent === "string" ? object.payment_intent : null,
              clientReferenceId: (object.client_reference_id as string | null | undefined) ?? null,
              metadata: (object.metadata as Record<string, string> | null | undefined) ?? {},
            }
          : null,
      };
    },
  };
}

// -- Dépendances des handlers ----------------------------------------------

export type PaymentDeps = {
  authenticate(authToken: string | undefined): Promise<{ userId: string }>;
  assertOwnership(dossierId: string, userId: string): Promise<void>;
  store: PaymentStore;
  stripe: StripeGateway;
  /** Horloge injectable (tests) pour le verrou de clôture d'exercice ; absente ⇒ `new Date()`. */
  now?: () => Date;
};

/** Dépendances réelles. Lève `PaymentConfigError` si la configuration Stripe/Supabase manque. */
export function createDefaultPaymentDeps(): PaymentDeps {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) {
    throw new PaymentConfigError("Configuration Stripe manquante (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET).");
  }
  const client = getPaymentServiceClient();
  return {
    authenticate: (authToken) => getServerSupabaseForUser(authToken),
    assertOwnership: (dossierId, userId) => assertDossierOwnership(client, dossierId, userId),
    store: createSupabasePaymentStore(client),
    stripe: createStripeGateway(new Stripe(stripeKey), webhookSecret),
  };
}

/** Dépendances SANS Stripe (accès livraison uniquement) : n'exige que Supabase. */
export function createDeliveryDeps(): Pick<PaymentDeps, "authenticate" | "assertOwnership" | "store"> {
  const client = getPaymentServiceClient();
  return {
    authenticate: (authToken) => getServerSupabaseForUser(authToken),
    assertOwnership: (dossierId, userId) => assertDossierOwnership(client, dossierId, userId),
    store: createSupabasePaymentStore(client),
  };
}
