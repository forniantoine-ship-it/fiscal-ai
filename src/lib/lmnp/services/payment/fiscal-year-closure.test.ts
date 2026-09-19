/**
 * Payment V1 — verrou de clôture : un exercice civil N n'est finalisable/payable
 * qu'à partir du 1er janvier N+1 (heure de Paris). Horloge injectée ; Stripe doublé.
 * Run: npx tsx --test src/lib/lmnp/services/payment/fiscal-year-closure.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { handleCheckoutRequest } from "./checkout-handler";
import { handlePriorHistoryRequest } from "./prior-history-handler";
import {
  FISCAL_YEAR_NOT_CLOSED_CODE,
  fiscalYearNotClosedMessage,
  isFiscalYearClosed,
} from "./fiscal-year-closure";
import { createFakePaymentEnv, jsonPost } from "./payment-fakes";

const URL_CHECKOUT = "https://app.fiscal-ai.test/api/lmnp/payment/checkout";
const URL_PRIOR = "https://app.fiscal-ai.test/api/lmnp/payment/prior-history";

// Dates de référence (heure de Paris = UTC+1 en hiver).
const TODAY = new Date("2026-09-19T10:00:00Z");
const DEC_31_2026_23H59_PARIS = new Date("2026-12-31T22:59:59Z");
const JAN_01_2027_00H00_PARIS = new Date("2026-12-31T23:00:00Z");

describe("isFiscalYearClosed — helper pur, horloge injectée", () => {
  it("l'année en cours est refusée (19/09/2026 → 2026 non clos)", () => {
    assert.equal(isFiscalYearClosed(2026, TODAY), false);
  });

  it("N-1 est acceptée (19/09/2026 → 2025 clos)", () => {
    assert.equal(isFiscalYearClosed(2025, TODAY), true);
  });

  it("une année future est refusée", () => {
    assert.equal(isFiscalYearClosed(2027, TODAY), false);
  });

  it("31/12/N 23h59 Paris est refusé", () => {
    assert.equal(isFiscalYearClosed(2026, DEC_31_2026_23H59_PARIS), false);
  });

  it("01/01/N+1 00h00 Paris est accepté", () => {
    assert.equal(isFiscalYearClosed(2026, JAN_01_2027_00H00_PARIS), true);
  });

  it("la bascule suit l'heure de Paris, pas l'UTC du serveur (été : UTC+2)", () => {
    assert.equal(isFiscalYearClosed(2026, new Date("2026-12-31T21:59:59Z")), false);
    assert.equal(isFiscalYearClosed(2026, new Date("2027-01-01T00:00:00Z")), true);
  });

  it("le message dit quand finaliser et que rien n'est facturé", () => {
    const message = fiscalYearNotClosedMessage(2026);
    assert.match(message, /exercice 2026/);
    assert.match(message, /1er janvier 2027/);
    assert.match(message, /rien n'est facturé/);
  });
});

function setup(now: Date) {
  const env = createFakePaymentEnv();
  env.setNow(now);
  env.addUser("tok-antoine", "user-antoine");
  env.addDossier("dossier-X", "user-antoine");
  const checkout = (fiscalYear: number) =>
    handleCheckoutRequest(
      jsonPost(URL_CHECKOUT, { authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear }),
      () => env.deps,
    );
  const declare = (fiscalYear: number) =>
    handlePriorHistoryRequest(
      jsonPost(URL_PRIOR, { authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear, status: "FIRST_REAL_YEAR" }),
      () => env.deps,
    );
  return { env, checkout, declare };
}

describe("checkout — exercice non terminé", () => {
  it("année courante → 409 fiscal_year_not_closed, AUCUNE session Stripe, AUCUNE ligne payment", async () => {
    const { env, checkout } = setup(TODAY);
    const res = await checkout(2026);
    assert.equal(res.status, 409);
    const body = (await res.json()) as { code?: string; error?: string; url?: string };
    assert.equal(body.code, FISCAL_YEAR_NOT_CLOSED_CODE);
    assert.equal(body.code, "fiscal_year_not_closed");
    assert.match(body.error ?? "", /1er janvier 2027/);
    assert.equal(body.url, undefined);
    assert.equal(env.created.length, 0);
    assert.equal(env.rows.length, 0);
  });

  it("le refus ne dépend pas d'un aveu prior-history antérieur : rien n'est créé non plus", async () => {
    const { env, checkout } = setup(TODAY);
    await env.seedPaid("dossier-X", 2025); // 2025 payé n'ouvre jamais 2026
    const rowsBefore = env.rows.length;
    const res = await checkout(2026);
    assert.equal(res.status, 409);
    assert.equal(env.created.length, 0);
    assert.equal(env.rows.length, rowsBefore);
  });

  it("31/12/N 23h59 Paris → refusé (409), aucune session, aucune ligne", async () => {
    const { env, checkout } = setup(DEC_31_2026_23H59_PARIS);
    const res = await checkout(2026);
    assert.equal(res.status, 409);
    assert.equal(env.created.length, 0);
    assert.equal(env.rows.length, 0);
  });

  it("01/01/N+1 00h00 Paris → accepté : session Stripe créée à 149 €", async () => {
    const { env, declare, checkout } = setup(JAN_01_2027_00H00_PARIS);
    assert.equal((await declare(2026)).status, 200);
    const res = await checkout(2026);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { status?: string; url?: string };
    assert.equal(body.status, "checkout");
    assert.equal(env.created.length, 1);
    assert.equal(env.created[0].fiscalYear, 2026);
    assert.equal(env.created[0].amountCents, 14900);
  });

  it("N-1 (2025, le 19/09/2026) → accepté : session Stripe créée", async () => {
    const { env, declare, checkout } = setup(TODAY);
    assert.equal((await declare(2025)).status, 200);
    const res = await checkout(2025);
    assert.equal(res.status, 200);
    assert.equal(env.created.length, 1);
    assert.equal(env.created[0].fiscalYear, 2025);
  });

  it("une année future (2027) est refusée aussi : aucune session", async () => {
    const { env, checkout } = setup(TODAY);
    assert.equal((await checkout(2027)).status, 409);
    assert.equal(env.created.length, 0);
    assert.equal(env.rows.length, 0);
  });

  it("l'authentification et la propriété passent AVANT le verrou (pas de fuite d'information)", async () => {
    const { env } = setup(TODAY);
    env.addUser("tok-eve", "user-eve");
    const anon = await handleCheckoutRequest(
      jsonPost(URL_CHECKOUT, { dossierId: "dossier-X", fiscalYear: 2026 }),
      () => env.deps,
    );
    assert.equal(anon.status, 401);
    const stranger = await handleCheckoutRequest(
      jsonPost(URL_CHECKOUT, { authToken: "tok-eve", dossierId: "dossier-X", fiscalYear: 2026 }),
      () => env.deps,
    );
    assert.equal(stranger.status, 403);
  });
});

describe("prior-history — même verrou : aucune ligne payment pour un exercice non terminé", () => {
  it("année courante → 409 fiscal_year_not_closed, aucune ligne créée", async () => {
    const { env, declare } = setup(TODAY);
    const res = await declare(2026);
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { code?: string }).code, "fiscal_year_not_closed");
    assert.equal(env.rows.length, 0);
    assert.equal(env.created.length, 0);
  });

  it("N-1 → 200 et ligne pending enregistrée avec l'aveu", async () => {
    const { env, declare } = setup(TODAY);
    assert.equal((await declare(2025)).status, 200);
    assert.equal(env.rows.length, 1);
    assert.equal(env.rows[0].status, "pending");
    assert.equal(env.rows[0].prior_history_status, "FIRST_REAL_YEAR");
  });
});
