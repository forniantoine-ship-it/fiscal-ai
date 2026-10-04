/**
 * MB-MULTI-CHECKOUT-FLUSH-1 — le checkout n'évalue que l'état persisté le plus récent : l'autosave en attente est vidé
 * (et confirmé) AVANT tout appel réseau de paiement ; un échec de vidage n'ouvre ni ligne de paiement ni session Stripe.
 *
 * Run: npx tsx --test src/lib/lmnp/services/payment/checkout-flush.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import type { MultiPropertyCapabilities } from "@/lib/lmnp/dossier/multi-property-activation";
import { DELIVERY_REVISION_UNAVAILABLE_MESSAGE } from "@/lib/lmnp/services/declaration/resolve-delivery-revision";
import { requestCheckout } from "./entitlement-client";
import { handleCheckoutRequest } from "./checkout-handler";
import { handlePriorHistoryRequest } from "./prior-history-handler";
import { createFakePaymentEnv, jsonPost } from "./payment-fakes";
import { startCheckoutAfterFlush } from "./checkout-flush";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(join(here, relative), "utf-8");

type Resolve = Parameters<typeof startCheckoutAfterFlush>[0]["resolveDeliveryRevision"];

const prop = (id: string) => ({ id, label: id });
const workspace = (ids: string[], scoped: boolean) => ({
  fiscalYear: { id: "fy", year: 2026, propertyIds: ids },
  properties: ids.map(prop),
  documents: [], extractions: [], validationItems: [], ledgerEntries: [],
  declarationDraft: scoped ? { completedSteps: [], biens: Object.fromEntries(ids.map((id) => [id, { propertyId: id, completedSteps: [] }])) } : { completedSteps: [] },
});
const snapshot = (ids: string[], scoped: boolean, revision = 1) => ({
  schemaVersion: scoped ? 2 : 1,
  revision,
  payload: { schemaVersion: scoped ? 2 : 1, workspace: workspace(ids, scoped) },
});

describe("startCheckoutAfterFlush — ordre et échec fermé", () => {
  it("A/B — l'autosave en attente est vidé avant le checkout, qui ne démarre qu'après succès du vidage", async () => {
    const log: string[] = [];
    const resolveDeliveryRevision: Resolve = async () => {
      log.push("flush:start");
      await Promise.resolve();
      log.push("flush:done");
      return { status: "ok", revision: 4 };
    };
    const result = await startCheckoutAfterFlush({
      resolveDeliveryRevision,
      start: async (revision) => {
        log.push(`checkout:${revision}`);
        return "started";
      },
    });
    assert.equal(result, "started");
    assert.deepEqual(log, ["flush:start", "flush:done", "checkout:4"]);
  });

  it("C/D — échec du vidage : le checkout n'est pas démarré, aucune requête de paiement, erreur récupérable existante", async () => {
    let checkoutCalls = 0;
    const resolveDeliveryRevision: Resolve = async () => ({ status: "failed", reason: "network" });
    await assert.rejects(
      startCheckoutAfterFlush({
        resolveDeliveryRevision,
        start: async () => {
          checkoutCalls += 1;
        },
      }),
      (err: Error) => err.message === DELIVERY_REVISION_UNAVAILABLE_MESSAGE,
    );
    assert.equal(checkoutCalls, 0);
  });

  it("un rejet du vidage (exception) est traité comme un échec : jamais de checkout", async () => {
    let checkoutCalls = 0;
    await assert.rejects(
      startCheckoutAfterFlush({
        resolveDeliveryRevision: async () => {
          throw new Error("boom");
        },
        start: async () => {
          checkoutCalls += 1;
        },
      }),
      (err: Error) => err.message === DELIVERY_REVISION_UNAVAILABLE_MESSAGE,
    );
    assert.equal(checkoutCalls, 0);
  });

  it("une révision invalide (non entière ≥ 1) n'est jamais une confirmation", async () => {
    let checkoutCalls = 0;
    await assert.rejects(
      startCheckoutAfterFlush({
        resolveDeliveryRevision: async () => ({ status: "ok", revision: 0 }),
        start: async () => {
          checkoutCalls += 1;
        },
      }),
    );
    assert.equal(checkoutCalls, 0);
  });
});

describe("checkout après vidage — l'admission serveur voit l'état fraîchement persisté", () => {
  const URL_CHECKOUT = "https://app.fiscal-ai.test/api/lmnp/payment/checkout";
  const PAYMENT_OPEN = { edition: false, generation: true, delivery: true, payment: true, closing: false, nextYear: false } as MultiPropertyCapabilities;

  function setup() {
    const env = createFakePaymentEnv({ defaultSnapshot: true });
    env.addUser("tok", "user-1");
    env.addDossier("dossier-X", "user-1");
    return env;
  }
  const declareEligible = (env: ReturnType<typeof setup>) =>
    handlePriorHistoryRequest(
      jsonPost("https://app.fiscal-ai.test/api/lmnp/payment/prior-history", { authToken: "tok", dossierId: "dossier-X", fiscalYear: 2026, status: "FIRST_REAL_YEAR" }),
      () => env.deps,
    );
  const post = (env: ReturnType<typeof setup>) =>
    handleCheckoutRequest(jsonPost(URL_CHECKOUT, { authToken: "tok", dossierId: "dossier-X", fiscalYear: 2026 }), () => env.deps, PAYMENT_OPEN);

  it("E/F — édition rapide (bien ajouté → multi) puis checkout immédiat : le serveur évalue l'état vidé et refuse, sans Stripe", async () => {
    const env = setup();
    env.setSnapshot("dossier-X", 2026, snapshot(["A"], false) as never);
    await declareEligible(env);

    // Un seul écrivain simulé : l'édition est « en attente » côté client, le serveur ne la connaît pas encore.
    let pending: ReturnType<typeof snapshot> | null = snapshot(["A", "B"], true, 2);
    const flush: Resolve = async () => {
      if (pending) env.setSnapshot("dossier-X", 2026, pending as never);
      pending = null;
      return { status: "ok", revision: 2 };
    };

    const response = await startCheckoutAfterFlush({ resolveDeliveryRevision: flush, start: () => post(env) });
    assert.equal(response.status, 409);
    assert.equal(((await response.json()) as { code: string }).code, "multi_property_domain_unsupported");
    assert.equal(env.created.length, 0, "aucune session Stripe");
    assert.ok(env.rows.every((row) => row.stripe_checkout_session_id === null));
  });

  it("sans vidage (contre-épreuve), le serveur évalue l'état périmé : c'est précisément le défaut corrigé", async () => {
    const env = setup();
    env.setSnapshot("dossier-X", 2026, snapshot(["A"], false) as never);
    await declareEligible(env);
    const stale = await post(env); // l'édition en attente n'a jamais été vidée
    assert.equal(stale.status, 200, "état périmé accepté → Stripe : le vidage préalable est donc indispensable");
  });

  it("G — mono : checkout inchangé après vidage réussi", async () => {
    const env = setup();
    env.setSnapshot("dossier-X", 2026, snapshot(["A"], false) as never);
    await declareEligible(env);
    const response = await startCheckoutAfterFlush({
      resolveDeliveryRevision: async () => ({ status: "ok", revision: 1 }),
      start: () => post(env),
    });
    assert.equal(response.status, 200);
    assert.equal(env.created.length, 1);
  });

  it("D — échec du vidage : aucune ligne de paiement, aucune session Stripe, aucune lecture de snapshot", async () => {
    const env = setup();
    env.setSnapshot("dossier-X", 2026, snapshot(["A"], false) as never);
    const rowsBefore = env.rows.length;
    await assert.rejects(
      startCheckoutAfterFlush({ resolveDeliveryRevision: async () => ({ status: "failed", reason: "offline" }), start: () => post(env) }),
    );
    assert.equal(env.created.length, 0);
    assert.equal(env.rows.length, rowsBefore);
    assert.equal(env.snapshotReads(), 0);
  });
});

describe("invariants de confiance et de paiement", () => {
  it("H/I — le corps du checkout n'embarque ni RFS ni révision : le paiement reste dossier/année", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ status: "already_paid" }), { status: 200 });
    }) as unknown as typeof fetch;
    await requestCheckout(2026, undefined, {
      context: { authToken: "t", dossierId: "d", fiscalYear: 2026 },
      fetchImpl,
    });
    for (const key of Object.keys(body)) assert.ok(["authToken", "dossierId", "fiscalYear", "continuity"].includes(key), `clé inattendue : ${key}`);
    assert.equal("expectedRevision" in body, false);
    assert.equal("rfs" in body, false);
  });

  it("I — le handler de checkout et l'admission de paiement ne lisent ni expectedRevision ni RFS", () => {
    for (const file of ["checkout-handler.ts", "multi-payment-admission.ts"]) {
      const source = read(file);
      assert.equal(/expectedRevision/.test(source), false, `${file} : paiement non lié à une révision`);
      assert.equal(/\brfs\b/i.test(source), false, `${file} : aucune RFS dans le checkout`);
    }
  });

  it("toute entrée de production du checkout passe par startCheckoutAfterFlush, sans seconde implémentation d'autosave", () => {
    const step = readFileSync(join(here, "../../../../components/lmnp/documents/ValidationDocumentStep.tsx"), "utf-8");
    const start = step.indexOf("const handleStartCheckout");
    const end = step.indexOf("// G1-P0 — écrit directement", start);
    const body = step.slice(start, end);
    assert.ok(body.includes("startCheckoutAfterFlush("), "handleStartCheckout vide l'autosave d'abord");
    assert.ok(body.indexOf("startCheckoutAfterFlush(") < body.indexOf("declarePriorHistoryOnServer("), "vidage avant toute requête serveur");
    assert.ok(body.indexOf("startCheckoutAfterFlush(") < body.indexOf("requestCheckout("), "vidage avant requestCheckout");
    assert.ok(body.includes("resolveDeliveryRevision"), "primitive de livraison réutilisée");
    assert.equal(/\bsetTimeout\b|debounce|saveWorkspace\(/.test(body), false, "aucun second mécanisme de persistance");
  });

  it("requestCheckout n'a qu'un seul appelant de production", () => {
    const srcRoot = join(here, "../../../..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) && /\brequestCheckout\(/.test(readFileSync(full, "utf-8"))) hits.push(entry.name);
      }
    };
    walk(srcRoot);
    assert.deepEqual(hits.sort(), ["ValidationDocumentStep.tsx", "entitlement-client.ts"]);
  });
});
