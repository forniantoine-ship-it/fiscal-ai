/**
 * MB-MULTI-STRIPE-RETURN-CONTEXT-1 — le retour Stripe identifie le dossier ET l'exercice qui ont initié le checkout, pour un utilisateur
 * qui possède plusieurs dossiers. L'URL est un contexte de NAVIGATION : elle n'est jamais une autorité de paiement ni d'accès (propriété
 * revérifiée par la porte d'entrée, entitlement et livraison par le serveur). Aucun bien, aucune révision dans l'URL.
 *
 * Run: npx tsx --test src/lib/lmnp/services/payment/stripe-return-context.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { resolveDeliveryAccess } from "./delivery-access";
import { A, B, T, Y, multiWorkspace, oracleBien, type BienSpec } from "@/lib/lmnp/services/declaration/multi-property-test-support";
import type { MultiPropertyCapabilities } from "@/lib/lmnp/dossier/multi-property-activation";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { handleCheckoutRequest } from "./checkout-handler";
import { createFakePaymentEnv, jsonPost } from "./payment-fakes";
import { handlePriorHistoryRequest } from "./prior-history-handler";
import { buildStripeReturnUrls, readStripeReturnContext } from "./stripe-return-context";

const read = (relative: string) => readFileSync(path.join(process.cwd(), relative), "utf8");
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));
const DOSSIER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOSSIER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DOSSIER_EVE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const URL_CHECKOUT = "https://app.fiscal-ai.test/api/lmnp/payment/checkout";
const PAYMENT_ON = { edition: false, generation: true, delivery: true, payment: true, closing: false, nextYear: false } as MultiPropertyCapabilities;

type Spec = [string, BienSpec];
const SUPPORTED = (): Spec[] => [[A, oracleBien(5000, 1000, 1000)], [B, oracleBien(4000, 1000, 1000)], ["bien-c", oracleBien(3000, 500, 500)]];
function confirmedMulti(): PersistedWorkspace {
  const ws = clone(multiWorkspace({ specs: SUPPORTED() }));
  const draft = ws.declarationDraft as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  (ws.fiscalYear as { priorHistoryDeclaration?: unknown }).priorHistoryDeclaration = { status: "FIRST_REAL_YEAR", declaredAt: T };
  draft.inpiConfirmedAt = T;
  for (const bien of Object.values<Record<string, unknown>>(draft.biens ?? {})) {
    bien.revenusConfirmedAt ??= T;
    if (bien.financementCharges !== undefined) bien.creditConfirmedAt ??= T;
  }
  return ws;
}

/** Un utilisateur (user-1) qui possède DEUX dossiers ; un tiers (user-eve) en possède un. */
function setup() {
  const env = createFakePaymentEnv({ defaultSnapshot: true });
  env.addUser("tok", "user-1");
  env.addUser("tok-eve", "user-eve");
  env.addDossier(DOSSIER_A, "user-1");
  env.addDossier(DOSSIER_B, "user-1");
  env.addDossier(DOSSIER_EVE, "user-eve");
  const declareEligible = (dossierId: string) =>
    handlePriorHistoryRequest(
      jsonPost("https://app.fiscal-ai.test/api/lmnp/payment/prior-history", { authToken: "tok", dossierId, fiscalYear: Y, status: "FIRST_REAL_YEAR" }),
      () => env.deps,
    );
  const checkout = (dossierId: string, token = "tok") =>
    handleCheckoutRequest(jsonPost(URL_CHECKOUT, { authToken: token, dossierId, fiscalYear: Y }), () => env.deps, PAYMENT_ON);
  return { env, declareEligible, checkout };
}

describe("le retour Stripe identifie le dossier d'origine (utilisateur à deux dossiers)", () => {
  for (const [label, dossier, other] of [["A", DOSSIER_A, DOSSIER_B], ["B", DOSSIER_B, DOSSIER_A]] as const) {
    it(`${label} — le checkout lancé depuis le dossier ${label} revient sur le dossier ${label}, jamais sur l'autre ni sur un défaut`, async () => {
      const { env, declareEligible, checkout } = setup();
      await declareEligible(dossier);
      assert.equal((await checkout(dossier)).status, 200);
      const { successUrl, cancelUrl } = env.created[0]!;
      for (const url of [successUrl, cancelUrl]) {
        const context = readStripeReturnContext(new URL(url).searchParams);
        assert.deepEqual(context.dossier, { kind: "explicit", id: dossier }, url);
        assert.notEqual((context.dossier as { id?: string }).id, other);
        assert.equal(context.fiscalYear, Y, "D — l'exercice est conservé");
      }
      assert.equal(readStripeReturnContext(new URL(successUrl).searchParams).checkout, "success");
      assert.equal(readStripeReturnContext(new URL(cancelUrl).searchParams).checkout, "cancelled");
    });
  }

  it("C — l'URL de retour porte l'identifiant que la porte d'entrée sait vérifier : la page de production le consomme avant de charger le dossier", () => {
    const gate = read("src/components/lmnp/app-shell/ExplicitDossierScopeGate.tsx");
    assert.match(gate, /readExplicitDossierId/);
    assert.match(gate, /fetchOwnedDossierById\(data\.user\.id, id!\)/, "propriété vérifiée AVANT de charger le dossier demandé");
    const shell = read("src/app/(dashboard)/DashboardShell.tsx");
    assert.ok(shell.indexOf("ExplicitDossierScopeGate") < shell.indexOf("<LmnpProvider"), "la porte précède le fournisseur");
  });

  it("C — l'écran de validation lit le contexte de retour par l'unique lecteur et refuse un dossier différent de celui chargé", () => {
    const step = read("src/components/lmnp/documents/ValidationDocumentStep.tsx");
    assert.match(step, /readStripeReturnContext\(/);
    assert.match(step, /fiscalYear\.dossierId/);
  });
});

describe("contrat du retour : (dossier, exercice) seulement", () => {
  it("E/F — aucune clé de bien, de révision ni de capacité : exactement step, fy, checkout, dossierId", async () => {
    const { env, declareEligible, checkout } = setup();
    await declareEligible(DOSSIER_B);
    await checkout(DOSSIER_B);
    for (const url of [env.created[0]!.successUrl, env.created[0]!.cancelUrl]) {
      const parsed = new URL(url);
      assert.equal(parsed.pathname, "/documents");
      assert.deepEqual([...parsed.searchParams.keys()].sort(), ["checkout", "dossierId", "fy", "step"]);
      assert.equal(/propertyId|revision|expectedRevision|rfs|v3Correction/i.test(url), false, url);
    }
  });

  it("G — la ligne et la session de paiement restent (dossier, exercice) : mêmes champs qu'avant, 149 € EUR, aucune métadonnée de bien", async () => {
    const { env, declareEligible, checkout } = setup();
    await declareEligible(DOSSIER_B);
    await checkout(DOSSIER_B);
    const session = env.created[0]!;
    assert.deepEqual(Object.keys(session).sort(), ["amountCents", "cancelUrl", "currency", "dossierId", "fiscalYear", "idempotencyKey", "paymentId", "successUrl", "userId"]);
    assert.equal(session.dossierId, DOSSIER_B);
    assert.equal(session.fiscalYear, Y);
    assert.equal(session.amountCents, 14900);
    assert.equal(session.currency, "eur");
    assert.match(session.idempotencyKey, /^lmnp-checkout-/);
    assert.ok(env.rows.every((row) => ["dossier_id", "fiscal_year"].every((key) => key in row)));
  });

  it("construction pure : jamais d'identifiant de dossier invalide dans l'URL (repli hérité sans dossierId)", () => {
    const withId = buildStripeReturnUrls({ origin: "https://x.test", fiscalYear: 2026, dossierId: DOSSIER_A });
    assert.match(withId.successUrl, new RegExp(`dossierId=${DOSSIER_A}`));
    const legacy = buildStripeReturnUrls({ origin: "https://x.test", fiscalYear: 2026, dossierId: "pas-un-uuid" });
    assert.equal(new URL(legacy.successUrl).searchParams.has("dossierId"), false);
    assert.equal(new URL(legacy.successUrl).searchParams.get("fy"), "2026");
  });
});

describe("repli hérité et sécurité : l'URL n'autorise rien", () => {
  it("repli — un retour SANS dossierId (ancien lien) reste « hérité » : aucun dossier n'est désigné, donc aucun dossier non autorisé ne peut être choisi", () => {
    const context = readStripeReturnContext(new URLSearchParams("step=validation&fy=2026&checkout=success"));
    assert.deepEqual(context.dossier, { kind: "legacy" });
    assert.equal(context.fiscalYear, 2026);
  });

  it("H — un dossierId mal formé ou répété est refusé (invalid), jamais ignoré ni corrigé", () => {
    assert.deepEqual(readStripeReturnContext(new URLSearchParams("fy=2026&checkout=success&dossierId=abc")).dossier, { kind: "invalid" });
    assert.deepEqual(readStripeReturnContext(new URLSearchParams(`fy=2026&checkout=success&dossierId=${DOSSIER_A}&dossierId=${DOSSIER_B}`)).dossier, { kind: "invalid" });
    assert.equal(readStripeReturnContext(new URLSearchParams("fy=20x6&checkout=success")).fiscalYear, null);
    assert.equal(readStripeReturnContext(new URLSearchParams("fy=2026&checkout=hacked")).checkout, null);
  });

  it("H — le retour n'accorde aucun droit : un dossier d'autrui dans l'URL ne permet ni paiement ni livraison (propriété serveur)", async () => {
    const { env, checkout } = setup();
    const denied = await checkout(DOSSIER_EVE);
    assert.equal(denied.status, 403);
    assert.equal(env.created.length, 0);
    await env.seedPaid(DOSSIER_EVE, Y);
    const access = await resolveDeliveryAccess({ authToken: "tok", dossierId: DOSSIER_EVE, fiscalYear: Y }, env.deps);
    assert.equal(access.ok, false, "payé pour Eve ≠ accessible à user-1");
  });

  it("I — le paiement du dossier A ne débloque pas le dossier B (même exercice) ; B peut encore démarrer son propre checkout", async () => {
    const { env, declareEligible, checkout } = setup();
    await env.seedPaid(DOSSIER_A, Y);
    assert.equal((await resolveDeliveryAccess({ authToken: "tok", dossierId: DOSSIER_A, fiscalYear: Y }, env.deps)).ok, true);
    const other = await resolveDeliveryAccess({ authToken: "tok", dossierId: DOSSIER_B, fiscalYear: Y }, env.deps);
    assert.equal(other.ok, false);
    await declareEligible(DOSSIER_B);
    assert.equal((await checkout(DOSSIER_B)).status, 200);
  });

  it("l'écran de retour ne déclare jamais « payé » à partir de l'URL : l'entitlement vient du serveur (poll)", () => {
    const step = read("src/components/lmnp/documents/ValidationDocumentStep.tsx");
    assert.match(step, /serverPayment\.refetch\(\)\) === "paid"/);
    assert.doesNotMatch(step, /setPaid|paidAt:\s*new Date/);
  });
});

describe("mono et multi : le même contrat", () => {
  it("J — mono : le retour porte (dossier, exercice) comme pour tout dossier", async () => {
    const { env, declareEligible, checkout } = setup();
    await declareEligible(DOSSIER_A);
    await checkout(DOSSIER_A);
    const context = readStripeReturnContext(new URL(env.created[0]!.successUrl).searchParams);
    assert.deepEqual(context.dossier, { kind: "explicit", id: DOSSIER_A });
  });

  it("K — multi supporté : le retour porte (dossier, exercice), jamais un bien", async () => {
    const env = createFakePaymentEnv();
    env.addUser("tok", "user-1");
    env.addDossier(DOSSIER_A, "user-1");
    env.addDossier(DOSSIER_B, "user-1");
    env.setSnapshot(DOSSIER_B, Y, { schemaVersion: 2, payload: { schemaVersion: 2, workspace: confirmedMulti() } });
    await handlePriorHistoryRequest(
      jsonPost("https://app.fiscal-ai.test/api/lmnp/payment/prior-history", { authToken: "tok", dossierId: DOSSIER_B, fiscalYear: Y, status: "FIRST_REAL_YEAR" }),
      () => env.deps,
    );
    const response = await handleCheckoutRequest(jsonPost(URL_CHECKOUT, { authToken: "tok", dossierId: DOSSIER_B, fiscalYear: Y }), () => env.deps, PAYMENT_ON);
    assert.equal(response.status, 200);
    const url = env.created[0]!.successUrl;
    assert.deepEqual(readStripeReturnContext(new URL(url).searchParams).dossier, { kind: "explicit", id: DOSSIER_B });
    assert.equal(/propertyId|bien/i.test(url), false);
  });
});
