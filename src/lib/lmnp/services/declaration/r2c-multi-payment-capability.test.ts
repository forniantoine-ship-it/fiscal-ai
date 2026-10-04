/**
 * MB-MULTI-PAYMENT-WIRING-1 — Phase 3 : PAIEMENT seul. Aucun moteur de paiement multi : le checkout MONO existant (dossier + exercice,
 * 149 €, serveur) est atteignable par un dossier multi seulement si l'admission le permet — capacités payment ∧ generation ∧ delivery,
 * domaine ADR-011, aptitude à livrer (preview déterministe du snapshot serveur, 39 C compris) — AVANT toute ligne et toute session.
 * La capacité `payment` n'est jamais un entitlement : `paid` reste exigé par la livraison. Aucun paiement réel (doublures en mémoire).
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/r2c-multi-payment-capability.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { handleCerfaPdfRequest } from "@/app/api/lmnp/declaration/cerfa-pdf/handler";
import {
  MULTI_PROPERTY_CAPABILITIES,
  MULTI_PROPERTY_NEVER_OPEN_CAPABILITIES,
  isMultiPropertyCapabilityOpen,
  isMultiPropertyClosingBlocked,
  isMultiPropertyNextYearBlocked,
  type MultiPropertyCapabilities,
  type MultiPropertyCapability,
} from "@/lib/lmnp/dossier/multi-property-activation";
import { MULTI_PROPERTY_DOMAIN_REASON_CODES as REASON } from "@/lib/lmnp/dossier/multi-property-domain";
import { runDeclarationGenerationFromWorkspace } from "@/lib/lmnp/services/declaration/generation-workspace";
import { handleCheckoutRequest } from "@/lib/lmnp/services/payment/checkout-handler";
import { resolveDeliveryAccess } from "@/lib/lmnp/services/payment/delivery-access";
import { resolveMultiPropertyPaymentAdmission } from "@/lib/lmnp/services/payment/multi-payment-admission";
import { createFakePaymentEnv, jsonPost } from "@/lib/lmnp/services/payment/payment-fakes";
import { handlePriorHistoryRequest } from "@/lib/lmnp/services/payment/prior-history-handler";
import { GENERATION_PRICE_CENTS, GENERATION_PRICE_TTC, PAYMENT_CURRENCY } from "@/lib/lmnp/services/payment/price";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

import { A, B, STOCKS, T, Y, monoWorkspace, multiWorkspace, oracleBien, type BienSpec } from "./multi-property-test-support";
import { callDelivery } from "@/lib/lmnp/services/declaration/delivery-test-support";

const ROOT = process.cwd();
const C = "bien-c";
const D = "bien-d";
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));
const ALL: MultiPropertyCapability[] = ["edition", "generation", "delivery", "payment", "closing", "nextYear"];
const caps = (open: MultiPropertyCapability[]): MultiPropertyCapabilities =>
  Object.fromEntries(ALL.map((capability) => [capability, open.includes(capability)])) as unknown as MultiPropertyCapabilities;
const PAYMENT_ON = caps(["generation", "delivery", "payment"]);
const PAYMENT_OFF = caps(["generation", "delivery"]);
const URL_CHECKOUT = "https://app.fiscal-ai.test/api/lmnp/payment/checkout";

type Spec = [string, BienSpec];
const SPECS = (): Spec[] => [[A, oracleBien(5000, 1000, 1000)], [B, oracleBien(4000, 1000, 1000)], [C, oracleBien(3000, 500, 500)]];
const specsOf = (n: number): Spec[] => [...SPECS(), [D, oracleBien(1000, 0, 0)]].slice(0, n);

/** Dossier complet comme l'écran de validation le présente (confirmations posées) : seul le domaine / le calcul peuvent le refuser. */
function confirmed(workspace: PersistedWorkspace): PersistedWorkspace {
  const ws = clone(workspace);
  const draft = ws.declarationDraft as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  // Réponse d'antériorité persistée comme par l'écran de validation : sans elle l'éligibilité (porte) refuse tout paiement.
  (ws.fiscalYear as { priorHistoryDeclaration?: unknown }).priorHistoryDeclaration = { status: "FIRST_REAL_YEAR", declaredAt: T };
  draft.inpiConfirmedAt = T;
  for (const bien of Object.values<Record<string, unknown>>(draft.biens ?? {})) {
    bien.revenusConfirmedAt ??= T;
    if (bien.financementCharges !== undefined) bien.creditConfirmedAt ??= T;
  }
  return ws;
}
const MULTI = (specs: Spec[] = SPECS(), options: Parameters<typeof multiWorkspace>[0] = {}) => confirmed(multiWorkspace({ specs, ...options }));
const snapshotOf = (workspace: PersistedWorkspace, schemaVersion = 2) => ({ schemaVersion, payload: { schemaVersion, workspace } });

function setup(workspace: PersistedWorkspace | null, options: { year?: number } = {}) {
  const env = createFakePaymentEnv();
  env.addUser("tok", "user-1");
  env.addDossier("dossier-X", "user-1");
  env.addDossier("dossier-Y", "user-1");
  const year = options.year ?? Y;
  if (workspace) env.setSnapshot("dossier-X", year, snapshotOf(workspace, workspace.declarationDraft && (workspace.declarationDraft as { biens?: unknown }).biens ? 2 : 1));
  const declareEligible = (dossierId = "dossier-X") =>
    handlePriorHistoryRequest(
      jsonPost("https://app.fiscal-ai.test/api/lmnp/payment/prior-history", { authToken: "tok", dossierId, fiscalYear: year, status: "FIRST_REAL_YEAR" }),
      () => env.deps,
    );
  const checkout = (capabilities?: MultiPropertyCapabilities, extra: Record<string, unknown> = {}, dossierId = "dossier-X") =>
    handleCheckoutRequest(jsonPost(URL_CHECKOUT, { authToken: "tok", dossierId, fiscalYear: year, ...extra }), () => env.deps, capabilities);
  return { env, declareEligible, checkout, year };
}
const codeOf = async (response: Response) => ((await response.json()) as { code?: string; status?: string; reasons?: string[] });

// ===========================================================================
// 1. ADMISSION AU PAIEMENT — capacité ET domaine ET aptitude à livrer
// ===========================================================================

describe("ADMISSION PAIEMENT — chaque dimension refuse seule, AVANT toute ligne et toute session", () => {
  it("1. payment OFF + dossier supporté → REFUS 409 multi_property_not_enabled ; aucune ligne, aucune session Stripe", async () => {
    const { env, checkout, declareEligible } = setup(MULTI());
    await declareEligible();
    const rowsBefore = env.rows.length;
    const response = await checkout(PAYMENT_OFF);
    assert.equal(response.status, 409);
    assert.equal((await codeOf(response)).code, "multi_property_not_enabled");
    assert.equal(env.created.length, 0);
    assert.equal(env.rows.length, rowsBefore, "aucune ligne de paiement créée");
  });

  it("2. payment ON + supporté → checkout admissible : session Stripe créée par le moteur MONO existant", async () => {
    const { env, checkout, declareEligible } = setup(MULTI());
    await declareEligible();
    const response = await checkout(PAYMENT_ON);
    assert.equal(response.status, 200);
    assert.equal((await codeOf(response)).status, "checkout");
    assert.equal(env.created.length, 1);
  });

  it("payment ON mais génération OU livraison fermée → refus (le multi ne se paie que s'il est livrable de bout en bout)", async () => {
    for (const closed of [caps(["delivery", "payment"]), caps(["generation", "payment"])]) {
      const { env, checkout, declareEligible } = setup(MULTI());
      await declareEligible();
      const response = await checkout(closed);
      assert.equal(response.status, 409);
      assert.equal((await codeOf(response)).code, "multi_property_not_enabled");
      assert.equal(env.created.length, 0);
    }
  });

  it("3. payment ON + HORS DOMAINE (déficit antérieur) → REFUS 409 multi_property_domain_unsupported + motifs stables ; aucun paiement demandé", async () => {
    const outside = MULTI(SPECS(), { fiscalYear: { stocksOuverture: STOCKS } });
    const { env, checkout, declareEligible } = setup(outside);
    await declareEligible();
    const rowsBefore = env.rows.length;
    const response = await checkout(PAYMENT_ON);
    const body = await codeOf(response);
    assert.equal(response.status, 409);
    assert.equal(body.code, "multi_property_domain_unsupported");
    assert.ok(body.reasons?.includes(REASON.priorDeficitNotSupported));
    assert.equal(env.created.length, 0);
    assert.equal(env.rows.length, rowsBefore);
  });

  it("l'admission est pure et se lit sur le snapshot SERVEUR : un booléen/payload client forgé ne la contourne pas", async () => {
    const outside = MULTI(SPECS(), { fiscalYear: { stocksOuverture: STOCKS } });
    const { env, checkout, declareEligible } = setup(outside);
    await declareEligible();
    const forged = await checkout(PAYMENT_ON, { multiProperty: false, isMultiProperty: false, propertyIds: [A], capabilities: PAYMENT_ON });
    assert.equal(forged.status, 409);
    assert.equal(env.created.length, 0);
  });

  it("mono / scoped mono / absence de snapshot : admission = autorisé, aucune règle multi ; comportement historique", async () => {
    const read = async () => null;
    assert.deepEqual(await resolveMultiPropertyPaymentAdmission(read, { dossierId: "d", fiscalYear: Y }, PAYMENT_ON), { allowed: true });
    const mono = monoWorkspace();
    const readMono = async () => snapshotOf(mono, 1);
    for (const capabilities of [PAYMENT_ON, PAYMENT_OFF, undefined]) assert.deepEqual(await resolveMultiPropertyPaymentAdmission(readMono, { dossierId: "d", fiscalYear: Y }, capabilities), { allowed: true });
  });

  it("snapshot multi illisible (schéma plus récent) ou d'un autre exercice → refus fail-closed multi_property_domain_unverifiable (jamais présumé favorable) ; une forme non multi reste le chemin mono historique", async () => {
    const other = clone(MULTI());
    (other.fiscalYear as { year: number }).year = Y - 1;
    for (const row of [snapshotOf(other), { schemaVersion: 99, payload: { schemaVersion: 99, workspace: "x" } }]) {
      const admission = await resolveMultiPropertyPaymentAdmission(async () => row, { dossierId: "d", fiscalYear: Y }, PAYMENT_ON);
      assert.equal(admission.allowed, false);
    }
  });
});

// ===========================================================================
// 2. TARIF — 149 € / dossier / exercice, indépendant du nombre de biens
// ===========================================================================

describe("TARIF — 149 € par dossier et par exercice, 1 achat quel que soit le nombre de biens", () => {
  it("4–7. mono, 2, 3, 4 et 5 biens → un seul achat de 14 900 centimes EUR, une seule session, une seule ligne", async () => {
    const cases: Array<[string, PersistedWorkspace]> = [["mono", confirmed(multiWorkspace({ specs: [SPECS()[0]!] }))], ["2 biens", MULTI(specsOf(2))], ["3 biens", MULTI(specsOf(3))], ["4 biens", MULTI(specsOf(4))]];
    for (const [label, workspace] of cases) {
      const { env, checkout, declareEligible } = setup(workspace);
      await declareEligible();
      const response = await checkout(PAYMENT_ON);
      assert.equal(response.status, 200, label);
      assert.equal(env.created.length, 1, label);
      assert.equal(env.created[0]!.amountCents, 14900, label);
      assert.equal(env.created[0]!.currency, "eur", label);
      assert.equal(env.rows.length, 1, label);
      assert.equal(env.rows[0]!.amount_cents, 14900, label);
    }
    assert.equal(GENERATION_PRICE_TTC, 149);
    assert.equal(GENERATION_PRICE_CENTS, 14900);
    assert.equal(PAYMENT_CURRENCY, "eur");
  });

  it("7. le prix ne dépend d'aucune propriété : aucune référence aux biens dans le prix, le checkout, le magasin de paiement ni le webhook (source)", () => {
    const strip = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const file of ["price.ts", "checkout-handler.ts", "payment-server.ts", "webhook-handler.ts"]) {
      assert.doesNotMatch(strip(`src/lib/lmnp/services/payment/${file}`), /propertyId|propertyIds|properties\b|biens\b|immobilisationsParBien/, file);
    }
    assert.match(strip("src/lib/lmnp/services/payment/checkout-handler.ts"), /amountCents: GENERATION_PRICE_CENTS/);
  });

  it("aucun moteur de paiement parallèle : l'admission multi n'importe ni Stripe, ni le magasin de paiement, ni le prix (elle décide seulement de l'accès au checkout existant)", () => {
    const code = readFileSync(path.join(ROOT, "src/lib/lmnp/services/payment/multi-payment-admission.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, /stripe|PaymentStore|GENERATION_PRICE|createCheckoutSession|ensureRow|markPaid/i);
  });
});

// ===========================================================================
// 3. IDENTITÉ COMMERCIALE — dossier + exercice, jamais un bien ; invariances
// ===========================================================================

describe("IDENTITÉ DU PAIEMENT — (dossier, exercice, utilisateur) ; ni bien actif ni ordre des biens", () => {
  const checkoutParams = async (workspace: PersistedWorkspace, extra: Record<string, unknown> = {}) => {
    const { env, checkout, declareEligible } = setup(workspace);
    await declareEligible();
    const response = await checkout(PAYMENT_ON, extra);
    assert.equal(response.status, 200);
    return { params: env.created[0]!, rows: env.rows };
  };

  it("8–9. identité commerciale = {paymentId, dossierId, fiscalYear, userId} + montant/devise/URLs ; aucune propriété, aucun propertyId dans la session ni la ligne", async () => {
    const { params, rows } = await checkoutParams(MULTI());
    assert.deepEqual(Object.keys(params).sort(), ["amountCents", "cancelUrl", "currency", "dossierId", "fiscalYear", "idempotencyKey", "paymentId", "successUrl", "userId"]);
    assert.equal(params.dossierId, "dossier-X");
    assert.equal(params.fiscalYear, Y);
    assert.doesNotMatch(JSON.stringify(params), new RegExp(`${A}|${B}|${C}|propert`, "i"));
    assert.deepEqual(Object.keys(rows[0]!).filter((key) => /prop|bien/i.test(key)), [], "aucune colonne de bien dans la ligne de paiement");
  });

  it("10/13. BIEN ACTIF A, B, C ou aucun (champs de contexte UI envoyés) : même dossier, même exercice, même montant, même session", async () => {
    const reference = (await checkoutParams(MULTI())).params;
    for (const activePropertyId of [A, B, C, undefined]) {
      const extra = activePropertyId ? { activePropertyId, propertyId: activePropertyId } : {};
      assert.deepEqual((await checkoutParams(MULTI(), extra)).params, reference, String(activePropertyId));
    }
  });

  it("11/14. ORDRE des biens (A+B+C, C+A+B, B+C+A, C+B+A) : même admission, même contrat commercial", async () => {
    const reference = (await checkoutParams(MULTI())).params;
    for (const order of [[2, 0, 1], [1, 2, 0], [2, 1, 0]]) {
      const specs = SPECS();
      assert.deepEqual((await checkoutParams(MULTI(order.map((index) => specs[index]!)))).params, reference, order.join());
    }
  });

  it("17. aucun double entitlement par bien : plusieurs checkouts (biens actifs différents) → UNE ligne, UNE session ouverte réutilisée", async () => {
    const { env, checkout, declareEligible } = setup(MULTI());
    await declareEligible();
    const urls: Array<string | undefined> = [];
    for (const activePropertyId of [A, B, C]) urls.push(((await (await checkout(PAYMENT_ON, { activePropertyId })).json()) as { url?: string }).url);
    assert.equal(new Set(urls).size, 1, "même URL de paiement quel que soit le bien actif : jamais un second paiement");
    assert.equal(env.rows.length, 1);
    assert.equal(env.created.length, 1);
  });
});

// ===========================================================================
// 4. ÉTATS DE PAIEMENT — unpaid / pending / failed / paid : comportement mono conservé
// ===========================================================================

describe("ÉTATS DE PAIEMENT — comportement mono conservé pour un multi admis", () => {
  const monoAndMulti: Array<[string, () => PersistedWorkspace]> = [["mono", () => confirmed(multiWorkspace({ specs: [SPECS()[0]!] }))], ["multi 3", () => MULTI()]];

  it("12. unpaid → checkout autorisé ; ouvrir la capacité ne crée jamais un `paid` (la ligne reste pending, aucun markPaid)", async () => {
    for (const [label, build] of monoAndMulti) {
      const { env, checkout, declareEligible } = setup(build());
      await declareEligible();
      assert.equal((await checkout(PAYMENT_ON)).status, 200, label);
      assert.ok(env.rows.every((row) => row.status === "pending"), label);
      assert.equal(env.markPaidCalls.length, 0, label);
    }
  });

  it("15. PENDING : second clic avec une session ouverte → même URL, une seule session (identique au mono)", async () => {
    for (const [label, build] of monoAndMulti) {
      const { env, checkout, declareEligible } = setup(build());
      await declareEligible();
      const first = (await (await checkout(PAYMENT_ON)).json()) as { url: string };
      const second = (await (await checkout(PAYMENT_ON)).json()) as { url: string };
      assert.equal(second.url, first.url, label);
      assert.equal(env.created.length, 1, label);
    }
  });

  it("15b. session payée côté Stripe, webhook pas encore reçu → payment_processing, jamais un second paiement (identique au mono)", async () => {
    for (const [label, build] of monoAndMulti) {
      const { env, checkout, declareEligible } = setup(build());
      await declareEligible();
      await checkout(PAYMENT_ON);
      const [id, state] = [...env.sessionStates.entries()][0]!;
      env.sessionStates.set(id, { ...state, status: "complete", paymentStatus: "paid" });
      const response = await checkout(PAYMENT_ON);
      assert.equal((await codeOf(response)).status, "payment_processing", label);
      assert.equal(env.created.length, 1, label);
    }
  });

  it("16. FAILED / session expirée → une NOUVELLE session, la ligne reste unique (identique au mono)", async () => {
    for (const [label, build] of monoAndMulti) {
      const { env, checkout, declareEligible } = setup(build());
      await declareEligible();
      await checkout(PAYMENT_ON);
      const [id, state] = [...env.sessionStates.entries()][0]!;
      env.sessionStates.set(id, { ...state, url: null, status: "expired" });
      const response = await checkout(PAYMENT_ON);
      assert.equal(response.status, 200, label);
      assert.equal(env.created.length, 2, label);
      assert.equal(env.rows.length, 1, label);
    }
  });

  it("14/21. PAID → already_paid (aucun nouveau paiement, aucune nouvelle session) ; l'entitlement est reconnu par la livraison", async () => {
    for (const [label, build] of monoAndMulti) {
      const { env, checkout, declareEligible } = setup(build());
      await declareEligible();
      await env.seedPaid("dossier-X", Y);
      const response = await checkout(PAYMENT_ON);
      assert.equal((await codeOf(response)).status, "already_paid", label);
      assert.equal(env.created.length, 0, label);
      const access = await resolveDeliveryAccess({ authToken: "tok", dossierId: "dossier-X", fiscalYear: Y }, env.deps);
      assert.equal(access.ok, true, label);
    }
  });
});

// ===========================================================================
// 5. ENTITLEMENT, ISOLATION, LIVRAISON APRÈS PAIEMENT
// ===========================================================================

describe("ENTITLEMENT — la capacité n'est pas `paid` ; isolation exercice / dossier ; chaînage paiement → livraison", () => {
  const generatedRfs = () => {
    const result = runDeclarationGenerationFromWorkspace(MULTI());
    assert.equal(result.status, "generated");
    if (result.status !== "generated") throw new Error("unreachable");
    return result.rfs;
  };
  const deliver = (env: ReturnType<typeof setup>["env"], rfs: unknown, dossierId = "dossier-X", fiscalYear = Y) =>
    callDelivery(
      handleCerfaPdfRequest,
      new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rfs, declarationVersionId: "v1", forms: ["2031-SD"], authToken: "tok", dossierId, fiscalYear }) }),
      (async (input: unknown) => resolveDeliveryAccess(input as never, env.deps)) as never,
      caps(["generation", "delivery", "payment"]),
    );

  it("13/18/20. payment ON ne vaut JAMAIS entitlement : multi supporté + generation + delivery + payment ouverts mais NON PAYÉ → 402 payment_required, aucun PDF", async () => {
    const { env } = setup(MULTI());
    for (const row of [null, "pending"] as const) {
      if (row === "pending") await env.store.ensureRow("dossier-X", Y);
      const response = await deliver(env, generatedRfs());
      assert.equal(response.status, 402);
      assert.equal((await codeOf(response)).code, "payment_required");
      assert.notEqual(response.headers.get("content-type"), "application/pdf");
    }
  });

  it("14/21. CHAÎNAGE : checkout → paiement confirmé (webhook simulé) → livraison autorisée (PDF) ; une seule ligne payée", async () => {
    const { env, checkout, declareEligible } = setup(MULTI());
    await declareEligible();
    assert.equal((await checkout(PAYMENT_ON)).status, 200);
    assert.equal((await deliver(env, generatedRfs())).status, 402, "avant confirmation serveur : toujours refusé");
    const row = env.rows[0]!;
    await env.store.markPaid(row.id, { sessionId: "cs_test_1", paymentIntentId: "pi_test_1" });
    const response = await deliver(env, generatedRfs());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(env.rows.length, 1);
  });

  it("18. EXERCICE : le paiement de 2025 ne débloque pas 2026 (livraison 402 pour 2026)", async () => {
    const { env } = setup(MULTI());
    await env.seedPaid("dossier-X", 2025);
    assert.equal((await resolveDeliveryAccess({ authToken: "tok", dossierId: "dossier-X", fiscalYear: 2025 }, env.deps)).ok, true);
    const other = await resolveDeliveryAccess({ authToken: "tok", dossierId: "dossier-X", fiscalYear: 2026 }, env.deps);
    assert.equal(other.ok, false);
    if (!other.ok) assert.equal(other.response.status, 402);
  });

  it("19. DOSSIER : le paiement du dossier X ne débloque pas le dossier Y", async () => {
    const { env } = setup(MULTI());
    await env.seedPaid("dossier-X", Y);
    const other = await resolveDeliveryAccess({ authToken: "tok", dossierId: "dossier-Y", fiscalYear: Y }, env.deps);
    assert.equal(other.ok, false);
    if (!other.ok) assert.equal(other.response.status, 402);
    const { checkout: checkoutY, env: envY, declareEligible } = setup(MULTI());
    envY.setSnapshot("dossier-Y", Y, snapshotOf(MULTI()));
    await declareEligible("dossier-Y");
    await envY.seedPaid("dossier-X", Y);
    assert.equal((await codeOf(await checkoutY(PAYMENT_ON, {}, "dossier-Y"))).status, "checkout", "Y reste payable : X payé ne le couvre pas");
  });
});

// ===========================================================================
// 6. MATRICE FAIL-CLOSED — avec payment = true, jamais encaisser un dossier connu non livrable
// ===========================================================================

describe("FAIL-CLOSED AU CHECKOUT — payment ON : aucun dossier hors ADR-011 ou non livrable ne peut payer", () => {
  const attestations = (kind: string, answer?: string) => {
    const at = "2026-01-01T00:00:00.000Z";
    const base = { ssi: { answer: "confirmed", at, wordingVersion: "test" }, directHolding: { answer: "confirmed", at, wordingVersion: "test" }, noCommonCharges: { answer: "confirmed", at, wordingVersion: "test" } } as Record<string, unknown>;
    if (answer === undefined) delete base[kind]; else base[kind] = { answer, at, wordingVersion: "test" };
    return base;
  };
  const withRoot = (root: Record<string, unknown>) => MULTI(SPECS(), { root });
  const withYear = (fiscalYear: Record<string, unknown>) => MULTI(SPECS(), { fiscalYear });
  const matrix: Array<[string, () => PersistedWorkspace, string]> = [
    ["déficit antérieur", () => withYear({ stocksOuverture: STOCKS }), REASON.priorDeficitNotSupported],
    ["ARD historique", () => withYear({ stocksOuverture: { ...STOCKS, stocks: { deficits: [], amortissementsReportes: 500, deficitsExpires: [] } } }), REASON.historicalArdNotSupported],
    ["reprise", () => withYear({ repriseHistoriqueEnContinuite: true }), REASON.takeoverNotSupported],
    ["exercice non initial", () => withYear({ previousFiscalYearId: "fy-2025" }), REASON.notFirstYear],
    ["stock d'ouverture", () => withYear({ stocksOuverture: { ...STOCKS, stocks: { deficits: [{ millesime: 2025, montant: 10 }], amortissementsReportes: 0, deficitsExpires: [] } } }), REASON.priorDeficitNotSupported],
    ["LMP", () => withRoot({ activityType: "LMP" }), REASON.lmpNotSupported],
    ["SSI non attesté", () => withRoot({ multiPropertyAttestations: attestations("ssi") }), REASON.ssiAttestationMissing],
    ["SSI hors domaine", () => withRoot({ multiPropertyAttestations: attestations("ssi", "declared_out_of_domain") }), REASON.ssiNotSupported],
    ["détention directe non attestée", () => withRoot({ multiPropertyAttestations: attestations("directHolding") }), REASON.directHoldingAttestationMissing],
    ["détention indirecte", () => withRoot({ multiPropertyAttestations: attestations("directHolding", "declared_out_of_domain") }), REASON.indirectHoldingNotSupported],
    ["charges communes non attestées", () => withRoot({ multiPropertyAttestations: attestations("noCommonCharges") }), REASON.commonChargesAttestationMissing],
    ["charges communes hors domaine", () => withRoot({ multiPropertyAttestations: attestations("noCommonCharges", "declared_out_of_domain") }), REASON.commonChargesNotSupported],
    ["document property non attribué", () => { const ws = MULTI(); ws.documents = [{ id: "doc-x", fiscalYearId: "fy-2026", fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 1, category: "charges", documentType: "unknown", status: "analyzed", uploadedAt: T } as never]; return ws; }, REASON.unattributedDocument],
  ];
  for (const [label, build, code] of matrix) {
    it(`${label} → 409 domain_unsupported (${code}) ; aucune ligne, aucune session, aucun paiement`, async () => {
      const { env, checkout, declareEligible } = setup(build());
      await declareEligible();
      const rowsBefore = env.rows.length;
      const response = await checkout(PAYMENT_ON);
      const body = await codeOf(response);
      assert.equal(response.status, 409);
      assert.equal(body.code, "multi_property_domain_unsupported");
      assert.ok(body.reasons?.includes(code), `${code} ∈ ${body.reasons}`);
      assert.equal(env.created.length, 0);
      assert.equal(env.rows.length, rowsBefore);
    });
  }

  const nonPayable: Array<[string, () => PersistedWorkspace, string]> = [
    ["date de mise en service manquante (motif de consolidation)", () => { const [a, b, c] = SPECS(); return MULTI([a!, b!, [c![0], { ...c![1], date: undefined }]]); }, REASON.serviceDateMissing],
    ["prêt partagé", () => { const loan = (spec: BienSpec): BienSpec => ({ ...spec, creditDocumentId: "doc-pret", credit: "present" }); const [a, b, c] = SPECS(); return MULTI([[a![0], loan(a![1])], [b![0], { ...loan(b![1]), pretIds: ["loan-2"] }], c!]); }, REASON.sharedLoanNotSupported],
    ["39 C inter-biens : ARD généré, connu par le preview du snapshot AVANT paiement", () => MULTI([[A, oracleBien(2000, 3000, 500)], [B, oracleBien(1000, 3000, 500)], [C, oracleBien(500, 500, 100)]]), REASON.allocation39cNotSupported],
  ];
  for (const [label, build, code] of nonPayable) {
    it(`${label} → 409 refus avant paiement (${code}) ; 149 € n'est jamais encaissé pour un dossier déjà connu comme non livrable`, async () => {
      const { env, checkout, declareEligible } = setup(build());
      await declareEligible();
      const rowsBefore = env.rows.length;
      const response = await checkout(PAYMENT_ON);
      const body = await codeOf(response);
      assert.equal(response.status, 409);
      assert.ok(["multi_property_not_payable", "multi_property_domain_unsupported"].includes(body.code ?? ""), String(body.code));
      assert.ok(body.reasons?.includes(code), `${code} ∈ ${body.reasons}`);
      assert.equal(env.created.length, 0);
      assert.equal(env.rows.length, rowsBefore);
    });
  }

  it("antériorité non répondue dans le snapshot → refus avant paiement (prior_history_not_eligible) : la porte exige l'éligibilité, jamais de fail-open", async () => {
    const unanswered = clone(MULTI());
    delete (unanswered.fiscalYear as { priorHistoryDeclaration?: unknown }).priorHistoryDeclaration;
    const { env, checkout, declareEligible } = setup(unanswered);
    await declareEligible();
    const response = await checkout(PAYMENT_ON);
    const body = await codeOf(response);
    assert.equal(response.status, 409);
    assert.equal(body.code, "multi_property_not_payable");
    assert.ok(body.reasons?.includes("prior_history_not_eligible"));
    assert.equal(env.created.length, 0);
  });

  it("dossier incomplet (activité non confirmée) → refus avant paiement : on ne vend que ce qui est livrable", async () => {
    const incomplete = clone(MULTI());
    delete (incomplete.declarationDraft as unknown as Record<string, unknown>).inpiConfirmedAt;
    const { env, checkout, declareEligible } = setup(incomplete);
    await declareEligible();
    const response = await checkout(PAYMENT_ON);
    assert.equal(response.status, 409);
    assert.equal(env.created.length, 0);
  });
});

// ===========================================================================
// 7. CAPACITÉS FINALES ET MONO
// ===========================================================================

describe("CAPACITÉS FINALES — payment ouvert avec generation et delivery ; edition, closing, nextYear fermés", () => {
  it("22–26. valeurs finales : edition false, generation true, delivery true, payment true, closing false, nextYear false", () => {
    assert.deepEqual(MULTI_PROPERTY_CAPABILITIES, { edition: true, generation: true, delivery: true, payment: true, closing: false, nextYear: false });
  });

  it("25/26. CLÔTURE et N+1 : bloqués structurellement, même avec les six capacités à true", () => {
    const everything = caps(ALL);
    assert.equal(isMultiPropertyCapabilityOpen("closing", everything), false);
    assert.equal(isMultiPropertyCapabilityOpen("nextYear", everything), false);
    assert.deepEqual([...MULTI_PROPERTY_NEVER_OPEN_CAPABILITIES].sort(), ["closing", "nextYear"]);
    for (const capabilities of [undefined, PAYMENT_ON, everything]) {
      assert.equal(isMultiPropertyClosingBlocked(MULTI(), capabilities), true);
      assert.equal(isMultiPropertyNextYearBlocked(MULTI(), capabilities), true);
    }
  });

  it("l'ÉDITION est ouverte (MB-MULTI-EDITION-FLIP-1) ; clôture et N+1 restent fermés", () => {
    assert.equal(isMultiPropertyCapabilityOpen("edition"), true);
    assert.equal(isMultiPropertyCapabilityOpen("closing"), false);
    assert.equal(isMultiPropertyCapabilityOpen("nextYear"), false);
  });
});

describe("MONO — checkout, tarif, entitlement et livraison inchangés", () => {
  it("un dossier mono : mêmes réponses et même session, quelles que soient les capacités multi injectées ; sans snapshot serveur, refus identique AVANT tout paiement (MB-MULTI-SERVER-TRUST-2)", async () => {
    for (const [workspace, expectedStatus] of [[monoWorkspace(), 200], [null, 409]] as const) {
      const outcomes: unknown[] = [];
      for (const capabilities of [PAYMENT_ON, PAYMENT_OFF, caps([]), undefined]) {
        const { env, checkout, declareEligible } = setup(workspace);
        await declareEligible();
        const response = await checkout(capabilities);
        outcomes.push({ status: response.status, body: await response.json(), session: env.created[0] && { ...env.created[0], successUrl: undefined, cancelUrl: undefined } });
      }
      for (const outcome of outcomes) assert.deepEqual(outcome, outcomes[0]);
      assert.equal((outcomes[0] as { status: number }).status, expectedStatus);
      if (workspace) assert.equal((outcomes[0] as { session: { amountCents: number } }).session.amountCents, 14900);
      else assert.equal((outcomes[0] as { body: { code: string } }).body.code, "workspace_snapshot_missing");
    }
  });

  it("l'antériorité non éligible est refusée avant tout, mono comme multi (ordre historique)", async () => {
    for (const workspace of [monoWorkspace(), MULTI()]) {
      const { env, checkout } = setup(workspace);
      const response = await checkout(PAYMENT_ON);
      assert.equal(response.status, 403);
      assert.equal((await codeOf(response)).code, "prior_history_not_eligible");
      assert.equal(env.created.length, 0);
    }
  });
});

// Garde de source : un seul checkout, une seule admission paiement, branchée avant toute ligne.
describe("ARCHITECTURE — une seule admission paiement, avant toute ligne ou session", () => {
  const strip = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("le checkout appelle l'admission multi AVANT rejectUnclosedFiscalYear / ensureRow / createCheckoutSession ; aucun second handler de paiement", () => {
    const code = strip("src/lib/lmnp/services/payment/checkout-handler.ts");
    const admission = code.indexOf("resolveMultiPropertyPaymentAdmission(");
    assert.ok(admission > 0);
    for (const later of ["rejectUnclosedFiscalYear(deps", "ensureRow(", "createCheckoutSession("]) assert.ok(code.indexOf(later) > admission, later);
    assert.equal((code.match(/createCheckoutSession\(/g) ?? []).length, 1);
  });
});
