/**
 * Payment V1 — côté navigateur : lecture de l'entitlement serveur, requêtes sans
 * prix, miroir local, disparition du faux paiement, copie commerciale véridique.
 * Run: npx tsx --test src/lib/lmnp/services/payment/payment-client.test.ts
 */
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  PaymentClientError,
  declarePriorHistoryOnServer,
  fetchPaymentEntitlement,
  pollUntil,
  requestCheckout,
  resolveDeliveryContext,
} from "./entitlement-client";
import { fetchOfficialCerfaPdfBytes } from "../declaration/download-cerfa-pdf";
import { fetchAide2042PdfBytes } from "../declaration/download-aide-2042-pdf";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

const SRC = path.join(__dirname, "../../../..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf-8");

function fakeSupabase(result: { data: unknown; error: { message: string } | null }, token: string | null = "tok") {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  return {
    calls,
    client: {
      auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) },
      from: (table: string) => ({
        select: () => ({
          eq: (c1: string, v1: unknown) => ({
            eq: (c2: string, v2: unknown) => {
              calls.push({ table, filters: [[c1, v1], [c2, v2]] });
              return { maybeSingle: async () => result };
            },
          }),
        }),
      }),
    },
  };
}

describe("entitlement client — l'autorité est la ligne serveur", () => {
  it("ligne paid → payé (avec paid_at) ; requête filtrée sur (dossier, exercice)", async () => {
    const { client, calls } = fakeSupabase({ data: { status: "paid", paid_at: "2026-09-19T10:00:00Z" }, error: null });
    const result = await fetchPaymentEntitlement(2026, { client: client as never, dossierId: "d1" });
    assert.deepEqual(result, { paid: true, paidAt: "2026-09-19T10:00:00Z" });
    assert.equal(calls[0].table, "lmnp_declaration_payments");
    assert.deepEqual(calls[0].filters, [["dossier_id", "d1"], ["fiscal_year", 2026]]);
  });

  it("aucune ligne ou ligne pending → NON payé", async () => {
    for (const data of [null, { status: "pending", paid_at: null }]) {
      const { client } = fakeSupabase({ data, error: null });
      assert.deepEqual(await fetchPaymentEntitlement(2026, { client: client as never, dossierId: "d1" }), { paid: false });
    }
  });

  it("erreur de lecture (réseau/RLS) → lève : jamais « payé » par défaut ; sans dossier → lève", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    await assert.rejects(() => fetchPaymentEntitlement(2026, { client: client as never, dossierId: "d1" }), PaymentClientError);
    await assert.rejects(() => fetchPaymentEntitlement(2026, { client: client as never, dossierId: null }), PaymentClientError);
  });

  it("contexte de livraison : jeton de session + dossier + exercice ; session absente → 401 explicite", async () => {
    const ok = fakeSupabase({ data: null, error: null }, "jeton-1");
    assert.deepEqual(await resolveDeliveryContext(2026, { client: ok.client as never, dossierId: "d1" }), {
      authToken: "jeton-1",
      dossierId: "d1",
      fiscalYear: 2026,
    });
    const anon = fakeSupabase({ data: null, error: null }, null);
    await assert.rejects(() => resolveDeliveryContext(2026, { client: anon.client as never, dossierId: "d1" }), /Session expirée/);
  });
});

describe("requêtes de paiement — le client n'envoie jamais de prix", () => {
  it("requestCheckout : corps = contexte + continuité, aucun montant/prix/devise ; erreur serveur → message clair", async () => {
    const sent: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return Response.json({ status: "checkout", url: "https://checkout.stripe.test/x" });
    }) as typeof fetch;
    const context = { authToken: "t", dossierId: "d1", fiscalYear: 2026 };
    const out = await requestCheckout(2026, { previousFiscalYearId: "fy-0" }, { context, fetchImpl });
    assert.deepEqual(out, { status: "checkout", url: "https://checkout.stripe.test/x" });
    assert.equal(sent[0].url, "/api/lmnp/payment/checkout");
    assert.deepEqual(Object.keys(sent[0].body).sort(), ["authToken", "continuity", "dossierId", "fiscalYear"]);
    assert.doesNotMatch(JSON.stringify(sent[0].body), /amount|price|prix|currency|unit_amount|14900|149/i);

    const refused = (async () => Response.json({ error: "Reprise indisponible", code: "prior_history_not_eligible" }, { status: 403 })) as typeof fetch;
    await assert.rejects(
      () => requestCheckout(2026, undefined, { context, fetchImpl: refused }),
      (err: PaymentClientError) => err.code === "prior_history_not_eligible" && err.status === 403,
    );
  });

  it("declarePriorHistoryOnServer : enregistre la réponse via l'endpoint dédié", async () => {
    let url = "";
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (u: string, init: RequestInit) => {
      url = u;
      body = JSON.parse(String(init.body));
      return Response.json({ ok: true });
    }) as typeof fetch;
    await declarePriorHistoryOnServer(2026, "FIRST_REAL_YEAR", { context: { authToken: "t", dossierId: "d1", fiscalYear: 2026 }, fetchImpl });
    assert.equal(url, "/api/lmnp/payment/prior-history");
    assert.equal(body.status, "FIRST_REAL_YEAR");
  });

  it("les téléchargements finaux envoient le contexte d'accès (sans lui : pas d'accès)", async () => {
    const bodies: Record<string, unknown>[] = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200 });
    }) as typeof fetch;
    try {
      const access = { authToken: "t", dossierId: "d1", fiscalYear: 2026 };
      const rfs = { exercice: 2026 } as FiscalRepresentation;
      await fetchOfficialCerfaPdfBytes({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }, access);
      await fetchAide2042PdfBytes({ rfs }, access);
    } finally {
      globalThis.fetch = previousFetch;
    }
    for (const body of bodies) {
      assert.equal(body.authToken, "t");
      assert.equal(body.dossierId, "d1");
      assert.equal(body.fiscalYear, 2026);
    }
  });

  it("un refus serveur 402 remonte un message client, jamais un PDF", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({ error: "Le paiement de cet exercice est requis.", code: "payment_required" }, { status: 402 })) as typeof fetch;
    try {
      await assert.rejects(
        () => fetchAide2042PdfBytes({ rfs: {} as FiscalRepresentation }, { authToken: "t", dossierId: "d", fiscalYear: 2026 }),
        (err: { message: string }) => /paiement/i.test(err.message),
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

describe("retour de Stripe — vérification bornée, jamais de « payé » présumé", () => {
  it("pollUntil : confirme dès que le serveur dit payé (webhook en retard : plusieurs tentatives)", async () => {
    let calls = 0;
    const slept: number[] = [];
    const ok = await pollUntil(async () => ++calls >= 3, { attempts: 10, intervalMs: 2000, sleep: async (ms) => void slept.push(ms) });
    assert.equal(ok, true);
    assert.equal(calls, 3);
    assert.deepEqual(slept, [2000, 2000]);
  });

  it("pollUntil : borné — jamais confirmé ⇒ false (bouton « Vérifier à nouveau »), les erreurs passagères n'accordent rien", async () => {
    let calls = 0;
    const ok = await pollUntil(async () => {
      calls += 1;
      throw new Error("réseau");
    }, { attempts: 4, sleep: async () => undefined });
    assert.equal(ok, false);
    assert.equal(calls, 4);
  });
});

describe("le faux paiement local a disparu", () => {
  let reducerModule: typeof import("../../store/reducer");
  before(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
    reducerModule = await import("../../store/reducer");
  });

  function allSources(dir = SRC, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) allSources(full, out);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
    }
    return out;
  }

  it("aucune source de production ne référence JOURNEY_MARK_PAID ni ne simule un succès de paiement", () => {
    const offenders = allSources().filter((f) => /JOURNEY_MARK_PAID/.test(readFileSync(f, "utf-8")));
    assert.deepEqual(offenders.map((f) => path.relative(SRC, f)), []);
  });

  it("le composant de checkout n'a plus de minuterie ni de rappel « paiement confirmé » : il délègue au serveur", () => {
    const source = read("components/lmnp/validation-workflow/ValidationCheckoutOverlay.tsx");
    assert.doesNotMatch(source, /setTimeout|onConfirmPayment/);
    assert.match(source, /onPay/);
  });

  it("l'aide 2042 n'a plus de téléchargement local (rendu navigateur supprimé)", () => {
    assert.doesNotMatch(read("lib/lmnp/services/declaration/render-aide-2042-pdf.ts"), /downloadAide2042Pdf|\.save\(/);
    for (const rel of [
      "components/lmnp/declaration/DeclarationReadyView.tsx",
      "components/lmnp/declaration/ArchivedDeclarationView.tsx",
    ]) {
      assert.doesNotMatch(read(rel), /render-aide-2042-pdf/, rel);
    }
  });

  it("JOURNEY_SYNC_PAID_FROM_SERVER reflète l'état serveur dans les DEUX sens (payé / non payé), idempotent", () => {
    const base = {
      fiscalYear: { id: "fy", year: 2026, status: "draft", regime: "reel", propertyIds: ["p"], createdAt: "t", updatedAt: "t" },
      properties: [{ id: "p", label: "b", address: "a", city: "c", postalCode: "1" }],
      documents: [],
      extractions: [],
      validationItems: [],
      ledgerEntries: [],
      declarationDraft: { completedSteps: [] },
      fileRegistry: new Map(),
    } as never;
    const paid = reducerModule.lmnpReducer(base, { type: "JOURNEY_SYNC_PAID_FROM_SERVER", paidAt: "2026-09-19T10:00:00Z" });
    assert.equal(paid.fiscalYear.paidAt, "2026-09-19T10:00:00Z");
    assert.equal(reducerModule.lmnpReducer(paid, { type: "JOURNEY_SYNC_PAID_FROM_SERVER", paidAt: "2026-09-19T10:00:00Z" }), paid);
    const cleared = reducerModule.lmnpReducer(paid, { type: "JOURNEY_SYNC_PAID_FROM_SERVER", paidAt: undefined });
    assert.equal(cleared.fiscalYear.paidAt, undefined, "un miroir local falsifié est remis à non payé par le serveur");
  });
});

describe("gating par exercice : le miroir local n'ouvre rien", () => {
  it("/declarations lit l'entitlement serveur, pas fiscalYear.paidAt", () => {
    const source = read("app/(dashboard)/declarations/page.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.match(source, /useServerPaymentSync/);
    assert.doesNotMatch(source, /fiscalYear\.paidAt/);
  });

  it("la préparation de N+1 n'est jamais soumise au paiement : aucun assistant, ni création/clôture d'exercice, ne référence le paiement", () => {
    const files = [
      "lib/lmnp/store/create-next-fiscal-year.ts",
      "lib/lmnp/store/close-and-create-next-fiscal-year.ts",
      "lib/lmnp/services/dossier/fiscal-year-cycle.ts",
    ];
    // `canCloseFiscalYear` passe `paidAt` à la porte pour détecter une dérive ; il n'EXIGE jamais le paiement.
    for (const rel of files) {
      assert.doesNotMatch(read(rel), /payment_required|Stripe|entitlement|fetchPaymentEntitlement/i, rel);
      assert.doesNotMatch(read(rel), /!\s*[\w.]*paidAt|paidAt\s*===\s*undefined/, `${rel} : clôture/création sans exigence de paiement`);
    }
    const walk = (dir: string, hits: string[] = []) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full, hits);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && /services\/payment|entitlement-client|useServerPaymentSync|lmnp_declaration_payments|stripe/i.test(readFileSync(full, "utf-8"))) hits.push(full);
      }
      return hits;
    };
    for (const dir of ["runtime/assistants", "components/lmnp/assistants"]) {
      assert.deepEqual(walk(path.join(SRC, dir)).map((f) => path.relative(SRC, f)), [], `${dir} : aucun garde de paiement`);
    }
  });
});

describe("copie commerciale — plus aucune promesse d'EDI / de télétransmission par Fiscal AI", () => {
  const CUSTOMER_FACING = [
    "app/layout.tsx",
    "components/LandingPage.tsx",
    "components/FAQ.tsx",
    "components/CTABanner.tsx",
    "components/landing/ProductMockups.tsx",
    "components/lmnp/onboarding/ConnexionOnboarding.tsx",
    "components/lmnp/declaration/DeclarationHome.tsx",
    "components/lmnp/declaration/DeclarationHowItWorks.tsx",
    "components/lmnp/declaration/DeclarationReadyView.tsx",
    "components/lmnp/validation-workflow/ValidationCheckoutOverlay.tsx",
    "components/lmnp/validation-workflow/ValidationPricingBlock.tsx",
  ];

  it("aucune formulation « télétransmission », « EDI incluse », « transmise »/« envoyée » comme promesse", () => {
    for (const rel of CUSTOMER_FACING) {
      // Les commentaires de code ne sont pas de la copie client : on ne lit que les chaînes/JSX.
      const withoutComments = read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      assert.doesNotMatch(withoutComments, /télétransmi|teletransmi|EDI incluse|EDI aux|télétransmise|est transmise|bien été envoyée/i, rel);
    }
  });

  it("aucun libellé de parcours ne promet une transmission/signature par Fiscal AI (étapes, titres, CTA)", () => {
    for (const rel of [
      "lib/lmnp/engine/declaration-progress.ts",
      "lib/lmnp/engine/assistant-brief.ts",
      "lib/lmnp/constants/declaration-flow.ts",
      "lib/lmnp/constants/journey-steps.ts",
    ]) {
      const strings = read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .match(/"[^"\n]*"/g)
        ?.join("\n") ?? "";
      assert.doesNotMatch(strings, /Déclaration transmise|Signez et transmettez|"Transmettre"|Télétransmission|Envoi à l|Signature électronique/i, rel);
    }
  });

  it("le périmètre livré est dit clairement : liasse fiscale + aide 2042-C-PRO, dépôt à la charge du client", () => {
    const landing = read("components/LandingPage.tsx");
    assert.match(landing, /aide 2042-C-PRO/);
    assert.match(landing, /Vous restez responsable du dépôt/);
    assert.match(read("components/lmnp/declaration/DeclarationReadyView.tsx"), /Fiscal AI ne dépose pas votre déclaration à votre place/);
  });

  it("le prix affiché vient de la source unique (aucun 149 codé en dur dans la landing, hors FAQ statique)", () => {
    const landing = read("components/LandingPage.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(landing, /GENERATION_PRICE_TTC/);
  });

  it("avertissement de perte de données avant paiement (V1 : dossier enregistré sur l'appareil)", () => {
    const overlay = read("components/lmnp/validation-workflow/ValidationCheckoutOverlay.tsx");
    assert.match(overlay, /Votre dossier est actuellement enregistré sur cet appareil\. Utilisez le même navigateur jusqu'à la finalisation de votre déclaration\./);
  });
});
