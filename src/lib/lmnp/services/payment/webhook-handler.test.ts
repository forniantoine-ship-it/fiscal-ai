/**
 * Payment V1 — POST /api/stripe/webhook. La vérification de signature est RÉELLE
 * (SDK Stripe, corps brut) ; seul le réseau est absent.
 * Run: npx tsx --test src/lib/lmnp/services/payment/webhook-handler.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import Stripe from "stripe";

import { handleStripeWebhook } from "./webhook-handler";
import { handleCheckoutRequest } from "./checkout-handler";
import { createFakePaymentEnv, jsonPost } from "./payment-fakes";
import { createStripeGateway } from "./payment-server";
import { resolveDeliveryAccess } from "./delivery-access";

const SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_dummy");
const realGateway = createStripeGateway(stripe as never, SECRET);

function setup() {
  const env = createFakePaymentEnv();
  env.addUser("tok", "user-antoine");
  env.addDossier("dossier-X", "user-antoine");
  env.addDossier("dossier-Y", "user-antoine");
  const deps = () => ({ store: env.store, stripe: realGateway });
  return { env, deps };
}

type SessionOverrides = Partial<{
  id: string;
  payment_status: string;
  amount_total: number;
  currency: string;
  payment_intent: string;
  client_reference_id: string | null;
  metadata: Record<string, string>;
}>;

function eventBody(type: string, session: SessionOverrides & { paymentId: string; dossierId: string; fiscalYear: number }) {
  const { paymentId, dossierId, fiscalYear, ...rest } = session;
  return JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2, 10)}`,
    object: "event",
    type,
    data: {
      object: {
        id: "cs_live_1",
        object: "checkout.session",
        payment_status: "paid",
        amount_total: 14900,
        currency: "eur",
        payment_intent: "pi_1",
        client_reference_id: paymentId,
        metadata: { paymentId, dossierId, fiscalYear: String(fiscalYear), userId: "user-antoine" },
        ...rest,
      },
    },
  });
}

function signedRequest(payload: string, secret = SECRET): Request {
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("https://app.fiscal-ai.test/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": header },
    body: payload,
  });
}

async function pendingRow(env: ReturnType<typeof createFakePaymentEnv>, dossier: string, year: number) {
  const row = await env.store.ensureRow(dossier, year);
  await env.store.attachSession(row.id, "cs_live_1");
  return row;
}

describe("webhook — signature", () => {
  it("signature invalide (falsifiée) → 400, rien n'est payé", async () => {
    const { env, deps } = setup();
    const row = await pendingRow(env, "dossier-X", 2026);
    const payload = eventBody("checkout.session.completed", { paymentId: row.id, dossierId: "dossier-X", fiscalYear: 2026 });
    const forged = new Request("https://x/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "t=1700000000,v1=deadbeef" },
      body: payload,
    });
    const res = await handleStripeWebhook(forged, deps);
    assert.equal(res.status, 400);
    assert.equal(row.status, "pending");
  });

  it("signature absente → 400 ; signée avec un AUTRE secret → 400 ; corps modifié après signature → 400", async () => {
    const { env, deps } = setup();
    const row = await pendingRow(env, "dossier-X", 2026);
    const payload = eventBody("checkout.session.completed", { paymentId: row.id, dossierId: "dossier-X", fiscalYear: 2026 });

    const none = await handleStripeWebhook(new Request("https://x", { method: "POST", body: payload }), deps);
    assert.equal(none.status, 400);

    const other = await handleStripeWebhook(signedRequest(payload, "whsec_autre"), deps);
    assert.equal(other.status, 400);

    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const tampered = await handleStripeWebhook(
      new Request("https://x", { method: "POST", headers: { "stripe-signature": header }, body: payload.replace("14900", "1") }),
      deps,
    );
    assert.equal(tampered.status, 400);
    assert.equal(row.status, "pending");
  });
});

describe("webhook — transition payée", () => {
  it("événement valide → PAYÉ (paid_at, session et payment intent enregistrés)", async () => {
    const { env, deps } = setup();
    const row = await pendingRow(env, "dossier-X", 2026);
    const res = await handleStripeWebhook(
      signedRequest(eventBody("checkout.session.completed", { paymentId: row.id, dossierId: "dossier-X", fiscalYear: 2026 })),
      deps,
    );
    assert.equal(res.status, 200);
    assert.equal(row.status, "paid");
    assert.ok(row.paid_at);
    assert.equal(row.stripe_checkout_session_id, "cs_live_1");
    assert.equal(row.stripe_payment_intent_id, "pi_1");
  });

  it("événement rejoué (livraison multiple) → idempotent : toujours une seule ligne payée, même paid_at", async () => {
    const { env, deps } = setup();
    const row = await pendingRow(env, "dossier-X", 2026);
    const payload = eventBody("checkout.session.completed", { paymentId: row.id, dossierId: "dossier-X", fiscalYear: 2026 });
    await handleStripeWebhook(signedRequest(payload), deps);
    const paidAt = row.paid_at;
    const again = await handleStripeWebhook(signedRequest(payload), deps);
    assert.equal(again.status, 200);
    assert.equal(((await again.json()) as { alreadyPaid: boolean }).alreadyPaid, true);
    assert.equal(env.rows.length, 1);
    assert.equal(row.paid_at, paidAt);
    assert.equal(row.status, "paid");
  });

  it("checkout.session.async_payment_succeeded est traité comme completed", async () => {
    const { env, deps } = setup();
    const row = await pendingRow(env, "dossier-X", 2026);
    await handleStripeWebhook(
      signedRequest(eventBody("checkout.session.async_payment_succeeded", { paymentId: row.id, dossierId: "dossier-X", fiscalYear: 2026 })),
      deps,
    );
    assert.equal(row.status, "paid");
  });

  it("session complétée mais NON payée (paiement asynchrone en attente) → aucun droit accordé", async () => {
    const { env, deps } = setup();
    const row = await pendingRow(env, "dossier-X", 2026);
    const res = await handleStripeWebhook(
      signedRequest(eventBody("checkout.session.completed", { paymentId: row.id, dossierId: "dossier-X", fiscalYear: 2026, payment_status: "unpaid" })),
      deps,
    );
    assert.equal(res.status, 200);
    assert.equal(row.status, "pending");
  });

  it("événements sans rapport (ex. expiration) → 200 ignoré, rien n'est payé", async () => {
    const { env, deps } = setup();
    const row = await pendingRow(env, "dossier-X", 2026);
    const res = await handleStripeWebhook(
      signedRequest(eventBody("checkout.session.expired", { paymentId: row.id, dossierId: "dossier-X", fiscalYear: 2026 })),
      deps,
    );
    assert.equal(res.status, 200);
    assert.equal(row.status, "pending");
  });
});

describe("webhook — un paiement ne débloque que SON dossier/exercice, au montant exact", () => {
  it("montant différent → 422, rien débloqué", async () => {
    const { env, deps } = setup();
    const row = await pendingRow(env, "dossier-X", 2026);
    const res = await handleStripeWebhook(
      signedRequest(eventBody("checkout.session.completed", { paymentId: row.id, dossierId: "dossier-X", fiscalYear: 2026, amount_total: 100 })),
      deps,
    );
    assert.equal(res.status, 422);
    assert.equal(row.status, "pending");
  });

  it("devise différente → 422, rien débloqué", async () => {
    const { env, deps } = setup();
    const row = await pendingRow(env, "dossier-X", 2026);
    const res = await handleStripeWebhook(
      signedRequest(eventBody("checkout.session.completed", { paymentId: row.id, dossierId: "dossier-X", fiscalYear: 2026, currency: "usd" })),
      deps,
    );
    assert.equal(res.status, 422);
    assert.equal(row.status, "pending");
  });

  it("paiement d'un AUTRE dossier/exercice rattaché à la ligne cible → 422, ni la ligne cible ni l'autre ne sont débloquées", async () => {
    const { env, deps } = setup();
    const rowX = await pendingRow(env, "dossier-X", 2026);
    const rowY = await env.store.ensureRow("dossier-Y", 2026);
    // métadonnées du dossier Y, référence de paiement de X
    const wrongDossier = await handleStripeWebhook(
      signedRequest(eventBody("checkout.session.completed", { paymentId: rowX.id, dossierId: "dossier-Y", fiscalYear: 2026 })),
      deps,
    );
    // métadonnées de l'exercice 2027, référence de paiement de 2026
    const wrongYear = await handleStripeWebhook(
      signedRequest(eventBody("checkout.session.completed", { paymentId: rowX.id, dossierId: "dossier-X", fiscalYear: 2027 })),
      deps,
    );
    assert.equal(wrongDossier.status, 422);
    assert.equal(wrongYear.status, 422);
    assert.equal(rowX.status, "pending");
    assert.equal(rowY.status, "pending");
  });

  it("référence de paiement incohérente (client_reference_id ≠ metadata) ou inconnue → ignoré, rien débloqué", async () => {
    const { env, deps } = setup();
    const row = await pendingRow(env, "dossier-X", 2026);
    const inconsistent = await handleStripeWebhook(
      signedRequest(eventBody("checkout.session.completed", { paymentId: row.id, dossierId: "dossier-X", fiscalYear: 2026, client_reference_id: "autre" })),
      deps,
    );
    const unknown = await handleStripeWebhook(
      signedRequest(eventBody("checkout.session.completed", { paymentId: "pay-inconnu", dossierId: "dossier-X", fiscalYear: 2026 })),
      deps,
    );
    assert.equal(inconsistent.status, 200);
    assert.equal(unknown.status, 200);
    assert.equal(row.status, "pending");
    assert.equal(env.markPaidCalls.length, 0);
  });

  it("payer 2026 ne débloque pas 2027 (ligne distincte)", async () => {
    const { env, deps } = setup();
    const row2026 = await pendingRow(env, "dossier-X", 2026);
    const row2027 = await env.store.ensureRow("dossier-X", 2027);
    await handleStripeWebhook(
      signedRequest(eventBody("checkout.session.completed", { paymentId: row2026.id, dossierId: "dossier-X", fiscalYear: 2026 })),
      deps,
    );
    assert.equal(row2026.status, "paid");
    assert.equal(row2027.status, "pending");
  });
});

describe("paiement reçu alors que l'historique externe est déclaré (course résiduelle)", () => {
  it("le droit est enregistré (l'argent a été pris) mais la LIVRAISON reste fermée SANS Opening (403)", async () => {
    const { env, deps } = setup();
    env.addUser("tok", "user-antoine");
    const row = await pendingRow(env, "dossier-X", 2026);
    row.prior_history_status = "EXTERNAL_HISTORY";
    const res = await handleStripeWebhook(
      signedRequest(eventBody("checkout.session.completed", { paymentId: row.id, dossierId: "dossier-X", fiscalYear: 2026 })),
      deps,
    );
    assert.equal(res.status, 200);
    assert.equal(row.status, "paid");
    const access = await resolveDeliveryAccess({ authToken: "tok", dossierId: "dossier-X", fiscalYear: 2026 }, env.deps);
    assert.equal(access.ok, false);
    assert.equal(access.ok === false && access.response.status, 403);
  });

  it("Lot 5.3 — EXTERNAL_HISTORY payé + Opening usable → livraison autorisée", async () => {
    const { env, deps } = setup();
    env.addUser("tok", "user-antoine");
    const row = await pendingRow(env, "dossier-X", 2026);
    row.prior_history_status = "EXTERNAL_HISTORY";
    const res = await handleStripeWebhook(
      signedRequest(eventBody("checkout.session.completed", { paymentId: row.id, dossierId: "dossier-X", fiscalYear: 2026 })),
      deps,
    );
    assert.equal(res.status, 200);
    const opening = {
      revision: 1,
      targetFiscalYear: 2026,
      source: { kind: "external_takeover", takeoverId: "t1", sourceFiscalYear: 2025 },
      validation: {
        status: "validated",
        openingRevision: 1,
        contentHash: "h",
        validatedAt: "2026-01-01T00:00:00.000Z",
        validator: "test",
      },
      stocks: {
        deficits: { status: "available", value: [] },
        amortissementsReportes: { status: "available", value: 0 },
      },
      assets: { status: "unavailable", reason: "n/a" },
      loans: { status: "unavailable", reason: "n/a" },
      identity: { status: "unavailable", reason: "n/a" },
      ran: { status: "unavailable", reason: "n/a" },
      fieldProvenance: {},
    };
    const access = await resolveDeliveryAccess(
      { authToken: "tok", dossierId: "dossier-X", fiscalYear: 2026, fiscalYearOpening: opening },
      env.deps,
    );
    assert.equal(access.ok, true);
  });
});

describe("l'URL de succès ne prouve rien : seul le webhook accorde le droit", () => {
  it("un checkout complet puis un retour « success » sans webhook → toujours non payé", async () => {
    const { env } = setup();
    await env.store.ensureRow("dossier-X", 2026);
    env.rows[0].prior_history_status = "FIRST_REAL_YEAR";
    const res = await handleCheckoutRequest(
      jsonPost("https://app.fiscal-ai.test/api/lmnp/payment/checkout", { authToken: "tok", dossierId: "dossier-X", fiscalYear: 2026 }),
      () => env.deps,
    );
    assert.equal(res.status, 200);
    // Le client « revient » sur l'URL de succès : aucun code serveur n'est exécuté par cette navigation.
    assert.equal(env.rows[0].status, "pending");
    assert.equal(env.markPaidCalls.length, 0);
  });

  it("garde statique : `markPaid(` n'est appelé QUE par le webhook", () => {
    const root = path.join(__dirname, "../../../..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith("payment-fakes.ts")) {
          const rel = path.relative(root, full).split(path.sep).join("/");
          if (/\.markPaid\(/.test(readFileSync(full, "utf-8")) && rel !== "lib/lmnp/services/payment/webhook-handler.ts") {
            offenders.push(rel);
          }
        }
      }
    };
    walk(root);
    assert.deepEqual(offenders, [], "seul le webhook peut marquer un exercice payé");
  });
});
