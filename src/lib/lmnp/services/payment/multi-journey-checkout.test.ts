/**
 * MB-MULTI-JOURNEY-COMPLETION-2 — paiement et livraison d'un dossier multi-bien par le chemin serveur EXISTANT : aucun second chemin de
 * paiement, aucune interdiction de portée côté client, retour Stripe par (dossier, exercice) sans bien ni révision, livraison serveur
 * autoritative après paiement. L'édition reste fermée ; aucun paiement réel (doublures en mémoire).
 *
 * Run: npx tsx --test src/lib/lmnp/services/payment/multi-journey-checkout.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { readV3CorrectionQuery } from "@/lab/v2-dossier/correction-scope";
import { resolveV3FinalizationCta, type V3FinalizationReadModel } from "@/lab/v2-dossier/finalization-read-model";
import {
  MULTI_PROPERTY_CAPABILITIES,
  isMultiPropertyDeliveryBlocked,
  isMultiPropertyWorkspace,
  type MultiPropertyCapabilities,
} from "@/lib/lmnp/dossier/multi-property-activation";
import { resolveMultiPropertyDomainReadiness } from "@/lib/lmnp/dossier/multi-property-readiness";
import { PRODUCTION_VALIDATION_HREF } from "@/lib/lmnp/dossier/production-dossier-scope";
import { resolveAuthoritativeDelivery } from "@/lib/lmnp/services/declaration/authoritative-delivery";
import { snapshotRowOf } from "@/lib/lmnp/services/declaration/delivery-test-support";
import { A, B, T, Y, monoWorkspace, multiWorkspace, oracleBien, type BienSpec } from "@/lib/lmnp/services/declaration/multi-property-test-support";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { handleCheckoutRequest } from "./checkout-handler";
import { startCheckoutAfterFlush } from "./checkout-flush";
import { resolveDeliveryAccess } from "./delivery-access";
import { createFakePaymentEnv, jsonPost } from "./payment-fakes";
import { handlePriorHistoryRequest } from "./prior-history-handler";

const ROOT = process.cwd();
const read = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));
const C = "bien-c";
const URL_CHECKOUT = "https://app.fiscal-ai.test/api/lmnp/payment/checkout";
const PAYMENT_ON = { edition: false, generation: true, delivery: true, payment: true, closing: false, nextYear: false } as MultiPropertyCapabilities;

type Spec = [string, BienSpec];
const SUPPORTED = (): Spec[] => [[A, oracleBien(5000, 1000, 1000)], [B, oracleBien(4000, 1000, 1000)], [C, oracleBien(3000, 500, 500)]];
const UNSUPPORTED_ARD = (): Spec[] => [[A, oracleBien(2000, 3000, 500)], [B, oracleBien(1000, 3000, 500)], [C, oracleBien(500, 500, 100)]];

function confirmed(workspace: PersistedWorkspace): PersistedWorkspace {
  const ws = clone(workspace);
  const draft = ws.declarationDraft as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  (ws.fiscalYear as { priorHistoryDeclaration?: unknown }).priorHistoryDeclaration = { status: "FIRST_REAL_YEAR", declaredAt: T };
  draft.inpiConfirmedAt = T;
  for (const bien of Object.values<Record<string, unknown>>(draft.biens ?? {})) {
    bien.revenusConfirmedAt ??= T;
    if (bien.financementCharges !== undefined) bien.creditConfirmedAt ??= T;
  }
  return ws;
}
const MULTI = (specs: Spec[]) => confirmed(multiWorkspace({ specs }));
const snapshotOf = (workspace: PersistedWorkspace, schemaVersion = 2) => ({ schemaVersion, payload: { schemaVersion, workspace } });

function setup(workspace: PersistedWorkspace, schemaVersion = 2) {
  const env = createFakePaymentEnv();
  env.addUser("tok", "user-1");
  env.addDossier("dossier-X", "user-1");
  env.setSnapshot("dossier-X", Y, snapshotOf(workspace, schemaVersion));
  const declareEligible = () =>
    handlePriorHistoryRequest(
      jsonPost("https://app.fiscal-ai.test/api/lmnp/payment/prior-history", { authToken: "tok", dossierId: "dossier-X", fiscalYear: Y, status: "FIRST_REAL_YEAR" }),
      () => env.deps,
    );
  const checkout = () => handleCheckoutRequest(jsonPost(URL_CHECKOUT, { authToken: "tok", dossierId: "dossier-X", fiscalYear: Y }), () => env.deps, PAYMENT_ON);
  return { env, declareEligible, checkout };
}

describe("checkout multi : le chemin serveur existant, sans interdiction de portée côté client", () => {
  it("G — un dossier multi supporté, complet et non payé atteint le checkout : une ligne, une session Stripe, 149 €", async () => {
    const { env, declareEligible, checkout } = setup(MULTI(SUPPORTED()));
    await declareEligible();
    const response = await checkout();
    const body = (await response.json()) as { status?: string; url?: string };
    assert.equal(response.status, 200);
    assert.equal(body.status, "checkout");
    assert.equal(env.created.length, 1);
    assert.equal(env.created[0]!.amountCents, 14900);
  });

  it("H — un dossier multi non supporté (ARD généré) ne crée NI ligne NI session Stripe", async () => {
    const { env, declareEligible, checkout } = setup(MULTI(UNSUPPORTED_ARD()));
    await declareEligible();
    const rowsBefore = env.rows.length;
    const response = await checkout();
    assert.equal(response.status, 409);
    assert.equal(env.created.length, 0);
    assert.equal(env.rows.length, rowsBefore);
  });

  it("P — mono : checkout inchangé", async () => {
    const mono = confirmed(monoWorkspace());
    const { env, declareEligible, checkout } = setup(mono, 1);
    await declareEligible();
    assert.equal((await checkout()).status, 200);
    assert.equal(env.created.length, 1);
  });

  it("G — la prohibition de portée côté client est levée ; l'écran ne contient aucun second chemin de paiement", () => {
    const step = read("src/components/lmnp/documents/ValidationDocumentStep.tsx");
    const start = step.indexOf("const handleStartCheckout");
    const end = step.indexOf("// G1-P0 — écrit directement", start);
    const body = step.slice(start, end);
    assert.doesNotMatch(body, /correctionScope/);
    assert.doesNotMatch(step, /parcours multi-dossier n'est pas encore disponible/);
    assert.equal((step.match(/requestCheckout\(/g) ?? []).length, 1, "un seul appel de checkout");
    assert.equal((step.match(/\bfetch\(/g) ?? []).length, 0, "aucun paiement parallèle");
  });

  it("I — le checkout multi vide d'abord l'autosave : vidage → persistance confirmée → requête de paiement", async () => {
    const log: string[] = [];
    await startCheckoutAfterFlush({
      resolveDeliveryRevision: async () => { log.push("flush"); return { status: "ok", revision: 2 }; },
      start: async () => { log.push("checkout"); },
    });
    assert.deepEqual(log, ["flush", "checkout"]);
    const step = read("src/components/lmnp/documents/ValidationDocumentStep.tsx");
    assert.ok(step.indexOf("startCheckoutAfterFlush(") < step.indexOf("requestCheckout("));
  });
});

describe("retour Stripe : (dossier, exercice), jamais un bien ni une révision ; le contexte multi vient de l'état persisté", () => {
  it("J — l'URL de retour porte l'exercice (et le dossier s'il est un identifiant valide, voir stripe-return-context.test.ts) ; aucun bien, aucune révision, aucune capacité", async () => {
    const { env, declareEligible, checkout } = setup(MULTI(SUPPORTED()));
    await declareEligible();
    await checkout();
    const { successUrl, cancelUrl } = env.created[0]!;
    for (const url of [successUrl, cancelUrl]) {
      const parsed = new URL(url);
      assert.equal(parsed.pathname, "/documents");
      assert.deepEqual([...parsed.searchParams.keys()].sort(), ["checkout", "fy", "step"]);
      assert.equal(parsed.searchParams.get("fy"), String(Y));
    }
  });

  it("J — l'URL de retour n'est pas un scope de bien : la page de production se charge sans drapeau LAB et reconstruit le multi depuis l'état persisté", async () => {
    const { env, declareEligible, checkout } = setup(MULTI(SUPPORTED()));
    await declareEligible();
    await checkout();
    const parsed = new URL(env.created[0]!.successUrl);
    assert.equal(readV3CorrectionQuery(parsed.pathname, parsed.searchParams).kind, "none");
    const persisted = MULTI(SUPPORTED());
    assert.equal(isMultiPropertyWorkspace(persisted), true);
    assert.equal(resolveMultiPropertyDomainReadiness(persisted).status, "supported");
    const step = read("src/components/lmnp/documents/ValidationDocumentStep.tsx");
    // Le contexte de retour est lu par l'unique lecteur (dossier + exercice) — voir stripe-return-context.test.ts.
    assert.match(step, /readStripeReturnContext\(params\)/);
    assert.match(step, /context\.fiscalYear === fiscalYear\.year/);
  });

  it("K — payé : l'accès à la livraison est ouvert pour (dossier, exercice) et le serveur livre depuis son snapshot recalculé (un seul F-006)", async () => {
    const workspace = MULTI(SUPPORTED());
    const { env } = setup(workspace);
    await env.seedPaid("dossier-X", Y);
    const access = await resolveDeliveryAccess({ authToken: "tok", dossierId: "dossier-X", fiscalYear: Y }, env.deps);
    assert.equal(access.ok, true);
    let generations = 0;
    const real = (await import("@/lib/lmnp/services/declaration/generation-workspace")).runDeclarationGenerationFromWorkspace;
    const authority = await resolveAuthoritativeDelivery(
      { dossierId: "dossier-X", fiscalYear: Y, expectedRevision: 1 },
      { readSnapshot: async () => snapshotRowOf(workspace, 1) as never, capabilities: PAYMENT_ON, generate: ((...args: Parameters<typeof real>) => { generations += 1; return real(...args); }) as typeof real },
    );
    assert.equal(authority.ok, true);
    assert.equal(generations, 1);
    assert.equal(isMultiPropertyDeliveryBlocked(workspace), false);
  });

  it("K — le paiement reste lié (dossier, exercice) : un autre exercice n'est pas livré", async () => {
    const { env } = setup(MULTI(SUPPORTED()));
    await env.seedPaid("dossier-X", Y);
    const other = await resolveDeliveryAccess({ authToken: "tok", dossierId: "dossier-X", fiscalYear: Y + 1 }, env.deps);
    assert.equal(other.ok, false);
  });
});

describe("modèle de finalisation : le multi reflète l'état réel, jamais une barrière historique inconditionnelle", () => {
  const model = (patch: Partial<V3FinalizationReadModel>): V3FinalizationReadModel => ({
    dossierComplete: true,
    multiProperty: true,
    multiPropertyDomain: "supported",
    blockers: [],
    priorHistory: { eligible: true } as V3FinalizationReadModel["priorHistory"],
    generationState: "never_generated",
    lastGeneration: null,
    priceLabel: "149 €",
    finalizeHref: PRODUCTION_VALIDATION_HREF,
    payment: { state: "unknown", source: "server", reason: "not_loaded" } as V3FinalizationReadModel["payment"],
    ...patch,
  });

  it("B — multi supporté, complet, non généré : l'accès à la finalisation est proposé (route de production)", () => {
    const cta = resolveV3FinalizationCta(model({}), undefined);
    assert.equal(cta.kind, "ready_to_finalize");
    assert.equal(cta.actionHref, PRODUCTION_VALIDATION_HREF);
  });

  it("B — multi hors domaine : aucun accès à la finalisation", () => {
    const cta = resolveV3FinalizationCta(model({ multiPropertyDomain: "unsupported" }), undefined);
    assert.equal(cta.kind, "multi_property");
    assert.equal(cta.actionHref, null);
  });

  it("B — multi incomplet : le premier pas manquant est proposé, pas la finalisation", () => {
    const cta = resolveV3FinalizationCta(model({ dossierComplete: false }), { label: "Compléter le logement", href: "/assistants/logement" });
    assert.equal(cta.kind, "dossier_incomplete");
  });

  it("N — l'édition reste fermée en production", () => {
    assert.equal(MULTI_PROPERTY_CAPABILITIES.edition, false);
  });
});
