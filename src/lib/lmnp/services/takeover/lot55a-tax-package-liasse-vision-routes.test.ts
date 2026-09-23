/**
 * Lot 5.5-A — routes API vision liasse N-1 (classification de page +
 * extraction structurée) : validations + fail closed.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot55a-tax-package-liasse-vision-routes.test.ts
 *
 * Teste directement les handlers POST exportés par les routes (Web Request/
 * FormData standard, aucun serveur Next.js démarré).
 *
 * `taxPackageLiasseVisionRouteDeps` / `taxPackageLiassePageClassifyRouteDeps`
 * sont surchargés en test — tax-package-liasse-vision-server.ts porte une
 * garde `server-only` qui lève systématiquement hors contexte react-server
 * (donc aussi sous Node/tsx, y compris via l'import dynamique de la route) :
 * elle ne peut pas être exercée par un test Node classique, seulement par un
 * build/exécution Next.js réels. Même limite que le pattern déjà en place
 * pour depreciationRegisterVisionRouteDeps. Ce test prouve le routage/la
 * validation/le mapping d'erreurs des routes, PAS la fiabilité d'un appel
 * OpenAI réel.
 */

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  taxPackageLiasseVisionRouteDeps,
  POST as visionPOST,
} from "@/app/api/lmnp/takeover/tax-package-liasse-vision/route";
import {
  taxPackageLiassePageClassifyRouteDeps,
  POST as classifyPOST,
} from "@/app/api/lmnp/takeover/tax-package-liasse-page-classify/route";

function tinyPngBlob(): Blob {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

function makeRequest(url: string, formData: FormData): Request {
  return new Request(url, { method: "POST", body: formData });
}

describe("Lot 5.5-A — POST /api/lmnp/takeover/tax-package-liasse-vision", () => {
  const URL = "http://localhost/api/lmnp/takeover/tax-package-liasse-vision";

  it("formType invalide/absent → 400 (avant tout appel Vision)", async () => {
    const fd = new FormData();
    fd.append("sourceCases", JSON.stringify(["028"]));
    fd.append("image", tinyPngBlob(), "p.png");
    const res = await visionPOST(makeRequest(URL, fd));
    assert.equal(res.status, 400);
  });

  it("sourceCases manquant/invalide → 400", async () => {
    for (const sourceCases of [undefined, "not json", JSON.stringify([]), JSON.stringify([1, 2])]) {
      const fd = new FormData();
      fd.append("formType", "2033A");
      if (sourceCases !== undefined) fd.append("sourceCases", sourceCases);
      fd.append("image", tinyPngBlob(), "p.png");
      const res = await visionPOST(makeRequest(URL, fd));
      assert.equal(res.status, 400, `sourceCases=${sourceCases} devrait être 400`);
    }
  });

  it("image manquante → 400", async () => {
    const fd = new FormData();
    fd.append("formType", "2033A");
    fd.append("sourceCases", JSON.stringify(["028"]));
    const res = await visionPOST(makeRequest(URL, fd));
    assert.equal(res.status, 400);
  });

  describe("chemin Vision (deps surchargées)", () => {
    const original = taxPackageLiasseVisionRouteDeps.requestVisionCases;
    after(() => {
      taxPackageLiasseVisionRouteDeps.requestVisionCases = original;
    });

    it("succès → 200 + payload", async () => {
      taxPackageLiasseVisionRouteDeps.requestVisionCases = async (input) => ({
        formType: input.formType,
        cases: input.sourceCases.map((sourceCase) => ({
          sourceCase,
          status: "present" as const,
          value: 42,
        })),
      });
      const fd = new FormData();
      fd.append("formType", "2033A");
      fd.append("sourceCases", JSON.stringify(["028", "030"]));
      fd.append("pageNumber", "1");
      fd.append("image", tinyPngBlob(), "p.png");

      const res = await visionPOST(makeRequest(URL, fd));
      assert.equal(res.status, 200);
      const body = (await res.json()) as { formType?: string; cases?: unknown[] };
      assert.equal(body.formType, "2033A");
      assert.equal(body.cases?.length, 2);
    });

    it("clé API absente (erreur remontée par le module serveur) → 503, jamais un succès", async () => {
      taxPackageLiasseVisionRouteDeps.requestVisionCases = async () => {
        throw new Error("OPENAI_API_KEY non configurée.");
      };
      const fd = new FormData();
      fd.append("formType", "2033A");
      fd.append("sourceCases", JSON.stringify(["028"]));
      fd.append("image", tinyPngBlob(), "p.png");

      const res = await visionPOST(makeRequest(URL, fd));
      assert.equal(res.status, 503);
      const body = (await res.json()) as { error?: string };
      assert.ok(body.error?.includes("OPENAI_API_KEY"));
    });

    it("erreur provider générique → 500, jamais un succès ni une case inventée", async () => {
      taxPackageLiasseVisionRouteDeps.requestVisionCases = async () => {
        throw new Error("Request timed out.");
      };
      const fd = new FormData();
      fd.append("formType", "2033A");
      fd.append("sourceCases", JSON.stringify(["028"]));
      fd.append("image", tinyPngBlob(), "p.png");

      const res = await visionPOST(makeRequest(URL, fd));
      assert.equal(res.status, 500);
    });
  });
});

describe("Lot 5.5-A — POST /api/lmnp/takeover/tax-package-liasse-page-classify", () => {
  const URL = "http://localhost/api/lmnp/takeover/tax-package-liasse-page-classify";

  it("pageNumber invalide (0, négatif, non numérique) → 400", async () => {
    for (const pageNumber of ["0", "-1", "abc"]) {
      const fd = new FormData();
      fd.append("pageNumber", pageNumber);
      fd.append("image", tinyPngBlob(), "p.png");
      const res = await classifyPOST(makeRequest(URL, fd));
      assert.equal(res.status, 400, `pageNumber=${pageNumber} devrait être 400`);
    }
  });

  it("image manquante → 400", async () => {
    const fd = new FormData();
    fd.append("pageNumber", "1");
    const res = await classifyPOST(makeRequest(URL, fd));
    assert.equal(res.status, 400);
  });

  describe("chemin classification (deps surchargées)", () => {
    const original = taxPackageLiassePageClassifyRouteDeps.classifyPage;
    after(() => {
      taxPackageLiassePageClassifyRouteDeps.classifyPage = original;
    });

    it("succès → 200 + classification", async () => {
      taxPackageLiassePageClassifyRouteDeps.classifyPage = async ({ pageNumber }) => ({
        pageNumber,
        formType: "2033A",
        formYear: 2026,
      });
      const fd = new FormData();
      fd.append("pageNumber", "3");
      fd.append("image", tinyPngBlob(), "p.png");

      const res = await classifyPOST(makeRequest(URL, fd));
      assert.equal(res.status, 200);
      const body = (await res.json()) as { pageNumber?: number; formType?: string };
      assert.equal(body.pageNumber, 3);
      assert.equal(body.formType, "2033A");
    });

    it("clé API absente → 503", async () => {
      taxPackageLiassePageClassifyRouteDeps.classifyPage = async () => {
        throw new Error("OPENAI_API_KEY non configurée.");
      };
      const fd = new FormData();
      fd.append("pageNumber", "1");
      fd.append("image", tinyPngBlob(), "p.png");

      const res = await classifyPOST(makeRequest(URL, fd));
      assert.equal(res.status, 503);
    });

    it("erreur provider générique → 500, jamais un formType inventé", async () => {
      taxPackageLiassePageClassifyRouteDeps.classifyPage = async () => {
        throw new Error("Request timed out.");
      };
      const fd = new FormData();
      fd.append("pageNumber", "1");
      fd.append("image", tinyPngBlob(), "p.png");

      const res = await classifyPOST(makeRequest(URL, fd));
      assert.equal(res.status, 500);
    });
  });
});
