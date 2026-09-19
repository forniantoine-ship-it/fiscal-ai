/**
 * Payment V1 — POST /api/lmnp/payment/checkout : auth, propriété, prix serveur,
 * éligibilité d'antériorité AVANT tout argent, entitlement déjà payé.
 * Stripe est doublé (aucun appel réseau).
 * Run: npx tsx --test src/lib/lmnp/services/payment/checkout-handler.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";

import { handleCheckoutRequest } from "./checkout-handler";
import { handlePriorHistoryRequest } from "./prior-history-handler";
import { createFakePaymentEnv, jsonPost } from "./payment-fakes";
import { createStripeGateway, PaymentConfigError, type PaymentDeps } from "./payment-server";
import { GENERATION_PRICE_CENTS, GENERATION_PRICE_TTC, PAYMENT_CURRENCY } from "./price";

const URL_CHECKOUT = "https://app.fiscal-ai.test/api/lmnp/payment/checkout";
const URL_PRIOR = "https://app.fiscal-ai.test/api/lmnp/payment/prior-history";
const VALID_STOCKS = { sourceClosureId: "closure-1", stocks: { deficits: [], amortissementsReportes: 0 } };

function setup() {
  const env = createFakePaymentEnv();
  env.addUser("tok-antoine", "user-antoine");
  env.addUser("tok-eve", "user-eve");
  env.addDossier("dossier-X", "user-antoine");
  env.addDossier("dossier-Y", "user-antoine");
  env.addDossier("dossier-EVE", "user-eve");
  const checkout = (body: unknown) => handleCheckoutRequest(jsonPost(URL_CHECKOUT, body), () => env.deps);
  const declare = (dossierId: string, fiscalYear: number, status: string, token = "tok-antoine") =>
    handlePriorHistoryRequest(jsonPost(URL_PRIOR, { authToken: token, dossierId, fiscalYear, status }), () => env.deps);
  return { env, checkout, declare };
}

describe("checkout — authentification et propriété", () => {
  it("sans authentification → 401, aucune session Stripe, aucune ligne", async () => {
    const { env, checkout } = setup();
    const res = await checkout({ dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(res.status, 401);
    const bad = await checkout({ authToken: "faux", dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(bad.status, 401);
    assert.equal(env.created.length, 0);
    assert.equal(env.rows.length, 0);
  });

  it("dossier d'un autre utilisateur → 403, aucune session Stripe", async () => {
    const { env, checkout } = setup();
    const res = await checkout({ authToken: "tok-eve", dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(res.status, 403);
    assert.equal(env.created.length, 0);
  });

  it("entrée invalide (exercice hors bornes / non entier / dossier absent) → 400", async () => {
    const { env, checkout } = setup();
    for (const body of [
      { authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 1999 },
      { authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026.5 },
      { authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: "2026" },
      { authToken: "tok-antoine", fiscalYear: 2026 },
    ]) {
      assert.equal((await checkout(body)).status, 400, JSON.stringify(body));
    }
    assert.equal(env.created.length, 0);
  });

  it("configuration Stripe/Supabase absente → 503 explicite, jamais un faux paiement", async () => {
    const res = await handleCheckoutRequest(
      jsonPost(URL_CHECKOUT, { authToken: "x", dossierId: "d", fiscalYear: 2026 }),
      () => {
        throw new PaymentConfigError("STRIPE_SECRET_KEY manquante");
      },
    );
    assert.equal(res.status, 503);
    assert.equal(((await res.json()) as { code: string }).code, "payment_not_configured");
  });
});

describe("checkout — l'éligibilité d'antériorité (P0) passe AVANT tout Stripe", () => {
  it("historique inconnu (aucune réponse enregistrée) → 403, AUCUNE session Stripe, aucun paiement", async () => {
    const { env, checkout } = setup();
    const res = await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { code: string; reason: string };
    assert.equal(body.code, "prior_history_not_eligible");
    assert.equal(body.reason, "ANSWER_REQUIRED");
    assert.equal(env.created.length, 0, "aucun Checkout créé pour un dossier non éligible");
    assert.equal(env.rows.filter((r) => r.status === "paid").length, 0);
  });

  it("historique externe déclaré → 403, aucune session Stripe", async () => {
    const { env, checkout, declare } = setup();
    assert.equal((await declare("dossier-X", 2026, "EXTERNAL_HISTORY")).status, 200);
    const res = await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(res.status, 403);
    assert.equal(env.created.length, 0);
  });

  it("changer le payload de checkout ne contourne pas un historique externe déjà enregistré côté serveur", async () => {
    const { env, checkout, declare } = setup();
    await declare("dossier-X", 2026, "EXTERNAL_HISTORY");
    const res = await checkout({
      authToken: "tok-antoine",
      dossierId: "dossier-X",
      fiscalYear: 2026,
      // Tentatives de forçage : aucune n'est lue.
      priorHistory: { eligible: true, status: "FIRST_REAL_YEAR" },
      priorHistoryEligible: true,
      priorHistoryDeclaration: { status: "FIRST_REAL_YEAR" },
      continuity: { previousFiscalYearId: "fy-0", stocksOuverture: VALID_STOCKS },
    });
    assert.equal(res.status, 403);
    assert.equal(env.created.length, 0);
  });

  it("continuité native revendiquée SANS exercice précédent payé côté serveur → refusé", async () => {
    const { env, checkout } = setup();
    const res = await checkout({
      authToken: "tok-antoine",
      dossierId: "dossier-X",
      fiscalYear: 2026,
      continuity: { previousFiscalYearId: "fy-0", stocksOuverture: VALID_STOCKS },
    });
    assert.equal(res.status, 403);
    assert.equal(env.created.length, 0);
  });

  it("« déjà réalisé avec Fiscal AI » sans continuité prouvée → refusé", async () => {
    const { env, checkout, declare } = setup();
    await declare("dossier-X", 2026, "FISCAL_AI_PREVIOUS");
    const res = await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(res.status, 403);
    assert.equal(env.created.length, 0);
  });

  it("exercice précédent payé côté serveur mais « première année » déclarée et aucune continuité → refusé (contradictoire)", async () => {
    const { env, checkout, declare } = setup();
    await env.seedPaid("dossier-X", 2025);
    await declare("dossier-X", 2026, "FIRST_REAL_YEAR");
    const res = await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(res.status, 403);
    assert.equal(env.created.length, 0);
  });

  it("exercice précédent payé + continuité native valide → autorisé, sans question", async () => {
    const { env, checkout } = setup();
    await env.seedPaid("dossier-X", 2025);
    const res = await checkout({
      authToken: "tok-antoine",
      dossierId: "dossier-X",
      fiscalYear: 2026,
      continuity: { previousFiscalYearId: "fy-2025", stocksOuverture: VALID_STOCKS },
    });
    assert.equal(res.status, 200);
    assert.equal(env.created.length, 1);
  });

  it("exercice précédent payé + continuité incohérente (stocks manquants) → refusé", async () => {
    const { env, checkout } = setup();
    await env.seedPaid("dossier-X", 2025);
    const res = await checkout({
      authToken: "tok-antoine",
      dossierId: "dossier-X",
      fiscalYear: 2026,
      continuity: { previousFiscalYearId: "fy-2025" },
    });
    assert.equal(res.status, 403);
    assert.equal(env.created.length, 0);
  });

  it("première année déclarée (enregistrée côté serveur) → session Checkout créée", async () => {
    const { env, checkout, declare } = setup();
    await declare("dossier-X", 2026, "FIRST_REAL_YEAR");
    const res = await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { status: string; url: string };
    assert.equal(body.status, "checkout");
    assert.match(body.url, /^https:\/\/checkout\.stripe\.test\/pay\/cs_test_1$/);
    assert.equal(env.created.length, 1);
    assert.equal(env.rows[0].status, "pending", "la ligne reste pending : seul le webhook la marque payée");
    assert.equal(env.rows[0].stripe_checkout_session_id, "cs_test_1");
  });
});

describe("prior-history — enregistrement serveur de la réponse", () => {
  it("exige authentification (401), propriété (403) et un statut valide (400)", async () => {
    const { env, declare } = setup();
    assert.equal((await declare("dossier-X", 2026, "FIRST_REAL_YEAR", "faux")).status, 401);
    assert.equal((await declare("dossier-X", 2026, "FIRST_REAL_YEAR", "tok-eve")).status, 403);
    assert.equal((await declare("dossier-X", 2026, "N_IMPORTE_QUOI")).status, 400);
    assert.equal(env.rows.length, 0);
  });

  it("horodate et conserve la réponse ; la modifier recalcule l'éligibilité (aucun effet sur le statut payé)", async () => {
    const { env, declare } = setup();
    await declare("dossier-X", 2026, "FIRST_REAL_YEAR");
    const row = env.rows[0];
    assert.equal(row.prior_history_status, "FIRST_REAL_YEAR");
    assert.ok(row.prior_history_declared_at);
    await declare("dossier-X", 2026, "EXTERNAL_HISTORY");
    assert.equal(env.rows.length, 1, "une seule ligne par (dossier, exercice)");
    assert.equal(row.prior_history_status, "EXTERNAL_HISTORY");
    assert.equal(row.status, "pending");
  });
});

describe("checkout — prix et devise : autorité serveur", () => {
  it("le prix vient du serveur : 14 900 centimes EUR, quels que soient les champs envoyés par le client", async () => {
    const { env, checkout, declare } = setup();
    await declare("dossier-X", 2026, "FIRST_REAL_YEAR");
    const res = await checkout({
      authToken: "tok-antoine",
      dossierId: "dossier-X",
      fiscalYear: 2026,
      amount: 1,
      amountCents: 100,
      unit_amount: 1,
      price: 0,
      currency: "usd",
    });
    assert.equal(res.status, 200);
    assert.equal(GENERATION_PRICE_CENTS, 14900);
    assert.equal(env.created[0].amountCents, 14900);
    assert.equal(env.created[0].currency, "eur");
    assert.equal(env.rows[0].amount_cents, 14900);
    assert.equal(env.rows[0].currency, PAYMENT_CURRENCY);
  });

  it("le prix affiché et le prix facturé partagent une seule source (149 € TTC)", () => {
    assert.equal(GENERATION_PRICE_TTC, 149);
    assert.equal(GENERATION_PRICE_CENTS, GENERATION_PRICE_TTC * 100);
  });

  it("la vraie passerelle envoie à Stripe : mode payment, 14900 EUR, métadonnées serveur (paiement, dossier, exercice)", async () => {
    let captured: Record<string, unknown> | undefined;
    let capturedOptions: Record<string, unknown> | undefined;
    const fakeStripe = {
      webhooks: new Stripe("sk_test_dummy").webhooks,
      checkout: {
        sessions: {
          create: async (params: Record<string, unknown>, options: Record<string, unknown>) => {
            captured = params;
            capturedOptions = options;
            return { id: "cs_real_shape", url: "https://checkout.stripe.test/x" };
          },
          retrieve: async () => ({}),
        },
      },
    };
    const gateway = createStripeGateway(fakeStripe as never, "whsec_test");
    await gateway.createCheckoutSession({
      paymentId: "pay-1",
      dossierId: "dossier-X",
      fiscalYear: 2026,
      userId: "user-antoine",
      amountCents: GENERATION_PRICE_CENTS,
      currency: PAYMENT_CURRENCY,
      successUrl: "https://app/success",
      cancelUrl: "https://app/cancel",
      idempotencyKey: "k1",
    });
    const line = (captured!.line_items as Array<{ quantity: number; price_data: { unit_amount: number; currency: string } }>)[0];
    assert.equal(captured!.mode, "payment");
    assert.equal(line.price_data.unit_amount, 14900);
    assert.equal(line.price_data.currency, "eur");
    assert.equal(line.quantity, 1);
    assert.deepEqual(captured!.metadata, {
      paymentId: "pay-1",
      dossierId: "dossier-X",
      fiscalYear: "2026",
      userId: "user-antoine",
    });
    assert.equal(captured!.client_reference_id, "pay-1");
    assert.equal(capturedOptions!.idempotencyKey, "k1");

    // Stripe = prestataire de paiement (Hosted Checkout), jamais marchand de référence :
    // Managed Payments est explicitement désactivé, indépendamment du réglage du compte.
    const managedPayments = captured!.managed_payments as { enabled?: unknown } | undefined;
    assert.ok(managedPayments, "managed_payments doit être envoyé à stripe.checkout.sessions.create");
    assert.equal(managedPayments.enabled, false);
    // Aucune décision TVA/fiscale dans ce correctif : pas de tax_code produit.
    const productData = (captured!.line_items as Array<{ price_data: { product_data: Record<string, unknown> } }>)[0].price_data.product_data;
    assert.equal("tax_code" in productData, false);
  });
});

describe("checkout — entitlement déjà payé et sessions en cours", () => {
  it("exercice déjà payé → already_paid, aucune nouvelle session, aucune nouvelle facturation", async () => {
    const { env, checkout } = setup();
    await env.seedPaid("dossier-X", 2026);
    const res = await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { status: string }).status, "already_paid");
    assert.equal(env.created.length, 0);
  });

  it("second clic pendant qu'une session est ouverte → même URL, une seule session créée", async () => {
    const { env, checkout, declare } = setup();
    await declare("dossier-X", 2026, "FIRST_REAL_YEAR");
    const first = (await (await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 })).json()) as { url: string };
    const second = (await (await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 })).json()) as { url: string };
    assert.equal(first.url, second.url);
    assert.equal(env.created.length, 1);
  });

  it("session payée côté Stripe mais webhook pas encore reçu → payment_processing, jamais un second paiement", async () => {
    const { env, checkout, declare } = setup();
    await declare("dossier-X", 2026, "FIRST_REAL_YEAR");
    await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    env.sessionStates.set("cs_test_1", { id: "cs_test_1", url: null, status: "complete", paymentStatus: "paid" });
    const res = await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(((await res.json()) as { status: string }).status, "payment_processing");
    assert.equal(env.created.length, 1);
    assert.equal(env.rows[0].status, "pending", "toujours pending : seul le webhook accorde le droit");
  });

  it("session pending périmée (expirée) → une NOUVELLE session est créée, la ligne reste unique", async () => {
    const { env, checkout, declare } = setup();
    await declare("dossier-X", 2026, "FIRST_REAL_YEAR");
    await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    env.sessionStates.set("cs_test_1", { id: "cs_test_1", url: null, status: "expired", paymentStatus: "unpaid" });
    const res = await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(res.status, 200);
    assert.equal(env.created.length, 2);
    assert.equal(env.rows.length, 1);
    assert.equal(env.rows[0].stripe_checkout_session_id, "cs_test_2");
  });

  it("URLs de retour : succès et annulation renvoient vers le tunnel de validation de l'exercice (jamais une preuve de paiement)", async () => {
    const { env, checkout, declare } = setup();
    await declare("dossier-X", 2026, "FIRST_REAL_YEAR");
    await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(
      env.created[0].successUrl,
      "https://app.fiscal-ai.test/documents?step=validation&fy=2026&checkout=success",
    );
    assert.equal(
      env.created[0].cancelUrl,
      "https://app.fiscal-ai.test/documents?step=validation&fy=2026&checkout=cancelled",
    );
    assert.equal(env.rows[0].status, "pending", "atteindre l'URL de succès n'accorde rien");
  });
});

describe("changer la réponse d'antériorité invalide une session Checkout déjà ouverte", () => {
  it("FIRST_REAL_YEAR → session ouverte → EXTERNAL_HISTORY : la session est expirée ET détachée, aucun nouveau paiement possible", async () => {
    const { env, checkout, declare } = setup();
    await declare("dossier-X", 2026, "FIRST_REAL_YEAR");
    await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(env.created.length, 1);

    await declare("dossier-X", 2026, "EXTERNAL_HISTORY");
    assert.deepEqual(env.expired, ["cs_test_1"], "l'ancienne session ne peut plus être payée");
    assert.equal(env.rows[0].stripe_checkout_session_id, null);
    assert.equal(env.sessionStates.get("cs_test_1")?.status, "expired");

    const res = await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(res.status, 403);
    assert.equal(env.created.length, 1, "aucune nouvelle session pour un dossier non éligible");
  });

  it("renvoyer la MÊME réponse (le checkout la renvoie avant chaque paiement) n'expire pas la session en cours", async () => {
    const { env, checkout, declare } = setup();
    await declare("dossier-X", 2026, "FIRST_REAL_YEAR");
    const first = (await (await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 })).json()) as { url: string };
    await declare("dossier-X", 2026, "FIRST_REAL_YEAR");
    const second = (await (await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 })).json()) as { url: string };
    assert.equal(env.expired.length, 0);
    assert.equal(first.url, second.url);
    assert.equal(env.created.length, 1);
  });

  it("session complétée mais paiement asynchrone encore non confirmé → payment_processing (jamais une seconde session)", async () => {
    const { env, checkout, declare } = setup();
    await declare("dossier-X", 2026, "FIRST_REAL_YEAR");
    await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    env.sessionStates.set("cs_test_1", { id: "cs_test_1", url: null, status: "complete", paymentStatus: "unpaid" });
    const res = await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(((await res.json()) as { status: string }).status, "payment_processing");
    assert.equal(env.created.length, 1);
  });
});

describe("si l'expiration de la session échoue, aucune seconde session payable n'est ouverte", () => {
  it("expiration impossible (session déjà payée ou erreur Stripe) → session conservée : re-déclarer « première année » puis payer renvoie la MÊME session, jamais une seconde", async () => {
    const { env, checkout, declare } = setup();
    await declare("dossier-X", 2026, "FIRST_REAL_YEAR");
    await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    env.stripe.expireCheckoutSession = async () => {
      throw new Error("session déjà complétée");
    };
    await declare("dossier-X", 2026, "EXTERNAL_HISTORY");
    assert.equal(env.rows[0].stripe_checkout_session_id, "cs_test_1", "la session n'est pas détachée quand l'expiration échoue");

    // Le client se ravise et re-déclare « première année » ; la session de départ est complétée côté Stripe (webhook en attente).
    env.sessionStates.set("cs_test_1", { id: "cs_test_1", url: null, status: "complete", paymentStatus: "paid" });
    await declare("dossier-X", 2026, "FIRST_REAL_YEAR");
    const res = await checkout({ authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2026 });
    assert.equal(((await res.json()) as { status: string }).status, "payment_processing");
    assert.equal(env.created.length, 1, "aucune seconde session : pas de double facturation");
  });
});

describe("corps de requête invalide", () => {
  it("JSON `null` / tableau / scalaire → 400 (jamais une erreur 500)", async () => {
    const { checkout, declare, env } = setup();
    for (const body of [null, 42, "x"]) {
      assert.equal((await checkout(body)).status, 400, JSON.stringify(body));
      assert.equal(
        (await handlePriorHistoryRequest(jsonPost(URL_PRIOR, body), () => env.deps)).status,
        400,
        JSON.stringify(body),
      );
    }
    void declare;
  });
});

describe("N → N+1 : les entitlements sont indépendants par exercice", () => {
  it("N payé : N+1 se prépare et se paie séparément ; payer N+1 ne modifie pas N", async () => {
    const { env, checkout } = setup();
    const paidN = await env.seedPaid("dossier-X", 2025);
    const snapshotN = { ...paidN };

    const res = await checkout({
      authToken: "tok-antoine",
      dossierId: "dossier-X",
      fiscalYear: 2026,
      continuity: { previousFiscalYearId: "fy-2025", stocksOuverture: VALID_STOCKS },
    });
    assert.equal(res.status, 200);
    assert.equal(env.created[0].fiscalYear, 2026);
    const rowN1 = env.rows.find((r) => r.fiscal_year === 2026)!;
    assert.equal(rowN1.status, "pending", "le paiement de N n'accorde pas N+1");
    assert.deepEqual(env.rows.find((r) => r.fiscal_year === 2025), snapshotN, "N+1 n'altère pas N");
  });

  it("deux dossiers du même utilisateur ont des entitlements distincts", async () => {
    const { env, checkout, declare } = setup();
    await env.seedPaid("dossier-X", 2026);
    await declare("dossier-Y", 2026, "FIRST_REAL_YEAR");
    const res = await checkout({ authToken: "tok-antoine", dossierId: "dossier-Y", fiscalYear: 2026 });
    assert.equal(((await res.json()) as { status: string }).status, "checkout", "X payé ne paie pas Y");
  });
});

// Garde de type : les deps de test respectent le contrat de production.
const _typecheck: PaymentDeps = createFakePaymentEnv().deps;
void _typecheck;
