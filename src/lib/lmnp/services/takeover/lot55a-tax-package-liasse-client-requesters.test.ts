/**
 * Lot 5.5-A — wrappers client (fetch) vers les routes vision liasse N-1.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot55a-tax-package-liasse-client-requesters.test.ts
 *
 * Preuve client/server (section 7.F du lot) : ces fichiers n'importent
 * jamais tax-package-liasse-vision-server.ts (aucune clé OpenAI, aucun
 * import du module `server-only`) — uniquement `fetch` vers la route API
 * dédiée. Ce test mocke global.fetch pour prouver la forme exacte de
 * l'appel HTTP (URL, méthode, champs FormData) sans démarrer de serveur.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { requestTaxPackageLiasseVisionCases, TaxPackageLiasseVisionError } from "./request-tax-package-liasse-vision";
import {
  requestTaxPackageLiassePageClassification,
  TaxPackageLiassePageClassifyError,
} from "./request-tax-package-liasse-page-classify";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("Lot 5.5-A — requestTaxPackageLiasseVisionCases (client)", () => {
  it("appelle POST /api/lmnp/takeover/tax-package-liasse-vision avec formType/sourceCases/pageNumber/image", async () => {
    let capturedUrl: string | undefined;
    let capturedMethod: string | undefined;
    let capturedFormData: FormData | undefined;

    global.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method;
      capturedFormData = init?.body as FormData;
      return new Response(
        JSON.stringify({
          formType: "2033A",
          cases: [{ sourceCase: "028", status: "present", value: 150000 }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const result = await requestTaxPackageLiasseVisionCases({
      formType: "2033A",
      sourceCases: ["028", "030"],
      pageNumber: 1,
      pageImage: { mimeType: "image/png", base64: "AAAA" },
    });

    assert.equal(capturedUrl, "/api/lmnp/takeover/tax-package-liasse-vision");
    assert.equal(capturedMethod, "POST");
    assert.equal(capturedFormData?.get("formType"), "2033A");
    assert.equal(capturedFormData?.get("sourceCases"), JSON.stringify(["028", "030"]));
    assert.equal(capturedFormData?.get("pageNumber"), "1");
    assert.ok(capturedFormData?.get("image") instanceof Blob);
    assert.equal(result.formType, "2033A");
    assert.equal(result.cases[0]?.value, 150000);
  });

  it("réponse HTTP non-ok → lève TaxPackageLiasseVisionError (fail closed, jamais une case inventée)", async () => {
    global.fetch = (async () =>
      new Response(JSON.stringify({ error: "OPENAI_API_KEY non configurée." }), { status: 503 })) as typeof fetch;

    await assert.rejects(
      () =>
        requestTaxPackageLiasseVisionCases({
          formType: "2033A",
          sourceCases: ["028"],
          pageNumber: 1,
          pageImage: { mimeType: "image/png", base64: "AAAA" },
        }),
      TaxPackageLiasseVisionError,
    );
  });

  it("JSON réponse invalide (cases absentes) → lève, jamais une valeur par défaut", async () => {
    global.fetch = (async () => new Response(JSON.stringify({ formType: "2033A" }), { status: 200 })) as typeof fetch;

    await assert.rejects(
      () =>
        requestTaxPackageLiasseVisionCases({
          formType: "2033A",
          sourceCases: ["028"],
          pageNumber: 1,
          pageImage: { mimeType: "image/png", base64: "AAAA" },
        }),
      TaxPackageLiasseVisionError,
    );
  });

  it("erreur réseau (fetch rejette) → propage l'erreur, jamais silencieusement absorbée", async () => {
    global.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    await assert.rejects(() =>
      requestTaxPackageLiasseVisionCases({
        formType: "2033A",
        sourceCases: ["028"],
        pageNumber: 1,
        pageImage: { mimeType: "image/png", base64: "AAAA" },
      }),
    );
  });
});

describe("Lot 5.5-A — requestTaxPackageLiassePageClassification (client)", () => {
  it("appelle POST /api/lmnp/takeover/tax-package-liasse-page-classify avec pageNumber/image", async () => {
    let capturedUrl: string | undefined;
    let capturedFormData: FormData | undefined;

    global.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedFormData = init?.body as FormData;
      return new Response(JSON.stringify({ pageNumber: 2, formType: "2033C", formYear: 2026 }), { status: 200 });
    }) as typeof fetch;

    const result = await requestTaxPackageLiassePageClassification({
      pageImage: { pageNumber: 2, mimeType: "image/png", base64: "AAAA" },
    });

    assert.equal(capturedUrl, "/api/lmnp/takeover/tax-package-liasse-page-classify");
    assert.equal(capturedFormData?.get("pageNumber"), "2");
    assert.ok(capturedFormData?.get("image") instanceof Blob);
    assert.deepEqual(result, { pageNumber: 2, formType: "2033C", formYear: 2026 });
  });

  it("réponse HTTP non-ok → lève TaxPackageLiassePageClassifyError, jamais un formType forcé", async () => {
    global.fetch = (async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 })) as typeof fetch;

    await assert.rejects(
      () =>
        requestTaxPackageLiassePageClassification({
          pageImage: { pageNumber: 1, mimeType: "image/png", base64: "AAAA" },
        }),
      TaxPackageLiassePageClassifyError,
    );
  });
});
