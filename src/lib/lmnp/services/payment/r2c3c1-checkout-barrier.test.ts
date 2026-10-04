/**
 * R2C.3c1 — barrière multi-bien du checkout serveur : refus AVANT Stripe, sur la foi du snapshot serveur
 * (jamais d'un booléen client). Mono / scoped mono / absence de snapshot : comportement historique.
 *
 * Run: npx tsx --test src/lib/lmnp/services/payment/r2c3c1-checkout-barrier.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MultiPropertyCapabilities } from "@/lib/lmnp/dossier/multi-property-activation";
import { handleCheckoutRequest } from "./checkout-handler";
import { handlePriorHistoryRequest } from "./prior-history-handler";
import { createFakePaymentEnv, jsonPost } from "./payment-fakes";

const URL_CHECKOUT = "https://app.fiscal-ai.test/api/lmnp/payment/checkout";
/** Capacité de paiement FERMÉE (injectée) : le multi reste bloqué par la capacité, indépendamment du domaine. */
const PAYMENT_CLOSED = { edition: false, generation: true, delivery: true, payment: false, closing: false, nextYear: false } as MultiPropertyCapabilities;
const prop = (id: string) => ({ id, label: id });
const workspace = (ids: string[], scoped: boolean) => ({
  fiscalYear: { id: "fy", year: 2026, propertyIds: ids },
  properties: ids.map(prop),
  documents: [], extractions: [], validationItems: [], ledgerEntries: [],
  declarationDraft: scoped ? { completedSteps: [], biens: Object.fromEntries(ids.map((id) => [id, { propertyId: id, completedSteps: [] }])) } : { completedSteps: [] },
});
const snapshot = (ids: string[], scoped: boolean) => ({ schemaVersion: scoped ? 2 : 1, payload: { schemaVersion: scoped ? 2 : 1, workspace: workspace(ids, scoped) } });

function setup() {
  const env = createFakePaymentEnv({ defaultSnapshot: true });
  env.addUser("tok", "user-1");
  env.addDossier("dossier-X", "user-1");
  const declareEligible = (fiscalYear = 2026) =>
    handlePriorHistoryRequest(
      jsonPost("https://app.fiscal-ai.test/api/lmnp/payment/prior-history", { authToken: "tok", dossierId: "dossier-X", fiscalYear, status: "FIRST_REAL_YEAR" }),
      () => env.deps,
    );
  const post = (body: unknown = { authToken: "tok", dossierId: "dossier-X", fiscalYear: 2026 }, capabilities?: MultiPropertyCapabilities) =>
    handleCheckoutRequest(jsonPost(URL_CHECKOUT, body), () => env.deps, capabilities);
  return { env, post, declareEligible };
}

describe("R2C.3c1 — checkout : barrière multi-bien serveur", () => {
  it("S6/S7 — snapshot multi + capacité de paiement FERMÉE → 409 multi_property_not_enabled, AUCUN appel createCheckoutSession, aucune ligne ; capacité ouverte mais dossier non livrable (snapshot minimal sans attestations) → 409 multi_property_domain_unsupported", async () => {
    const { env, post, declareEligible } = setup();
    env.setSnapshot("dossier-X", 2026, snapshot(["A", "B"], true));
    await declareEligible();
    const open = await post();
    assert.equal(open.status, 409);
    assert.equal(((await open.json()) as { code: string }).code, "multi_property_domain_unsupported", "défaut de production (payment ouvert) : snapshot minimal sans attestations, jamais encaissé tant que non livrable");
    assert.equal(env.created.length, 0);
    const res = await post(undefined, PAYMENT_CLOSED);
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { code: string }).code, "multi_property_not_enabled");
    assert.equal(env.created.length, 0);
    // La seule ligne possible est celle de la déclaration d'antériorité : jamais de session, jamais payée.
    assert.ok(env.rows.every((row) => row.stripe_checkout_session_id === null && row.status === "pending"));
  });

  it("le booléen/le payload client ne décide jamais : continuity forgée sur un dossier multi → refus ; sur un mono → inchangé", async () => {
    const { env, post } = setup();
    env.setSnapshot("dossier-X", 2026, snapshot(["A", "B"], true));
    const forged = await post({ authToken: "tok", dossierId: "dossier-X", fiscalYear: 2026, multiProperty: false, isMultiProperty: false }, PAYMENT_CLOSED);
    assert.equal(forged.status, 409);
    assert.equal(env.created.length, 0);
  });

  it("S4 — checkout mono (snapshot v1 mono) : comportement historique (403 antériorité, puis Stripe si éligible)", async () => {
    const { env, post, declareEligible } = setup();
    env.setSnapshot("dossier-X", 2026, snapshot(["A"], false));
    const blocked = await post();
    assert.equal(blocked.status, 403);
    assert.equal(((await blocked.json()) as { code: string }).code, "prior_history_not_eligible");
    await declareEligible();
    const ok = await post();
    assert.equal(ok.status, 200);
    assert.equal(env.created.length, 1);
  });

  it("S5 — checkout scoped mono (snapshot v2, un seul bien) : historique, jamais bloqué comme multi", async () => {
    const { env, post, declareEligible } = setup();
    env.setSnapshot("dossier-X", 2026, snapshot(["A"], true));
    await declareEligible();
    const ok = await post();
    assert.equal(ok.status, 200);
    assert.equal(env.created.length, 1);
  });

  it("absence de snapshot : jamais une règle bloquante nouvelle pour le mono historique", async () => {
    const { env, post, declareEligible } = setup();
    await declareEligible();
    const ok = await post();
    assert.equal(ok.status, 200);
    assert.equal(env.created.length, 1);
  });

  it("l'ordre historique est préservé : non authentifié → 401 et dossier d'autrui → 403 AVANT toute lecture de snapshot", async () => {
    const { env, post } = setup();
    env.setSnapshot("dossier-X", 2026, snapshot(["A", "B"], true));
    assert.equal((await post({ dossierId: "dossier-X", fiscalYear: 2026 })).status, 401);
    env.addUser("tok-eve", "user-eve");
    assert.equal((await post({ authToken: "tok-eve", dossierId: "dossier-X", fiscalYear: 2026 })).status, 403);
    assert.equal(env.snapshotReads(), 0);
  });

  it("webhook : un checkout multi bloqué ne crée aucune session ni ligne pending que le webhook pourrait confirmer", async () => {
    const { env, post } = setup();
    env.setSnapshot("dossier-X", 2026, snapshot(["A", "B"], true));
    await post();
    assert.equal(env.sessionStates.size, 0);
    assert.equal(env.rows.length, 0);
    assert.equal(env.markPaidCalls.length, 0);
  });
});
