/**
 * Lot 5.4-B — route API vision registre PDF : validations + fail closed.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot54b-depreciation-register-vision-route.test.ts
 *
 * Teste directement le handler POST exporté par la route (Web Request/
 * FormData standard, aucun serveur Next.js démarré).
 *
 * `depreciationRegisterVisionRouteDeps.extractDepreciationRegisterVisionRows`
 * est surchargé en test — le fichier serveur réel
 * (depreciation-register-vision-server.ts) porte une garde `server-only`
 * qui lève systématiquement hors contexte react-server (donc aussi sous
 * Node/tsx, y compris via l'import dynamique de la route) : elle ne peut
 * pas être exercée par un test Node classique, seulement par un build/
 * exécution Next.js réels. Même limite que le pattern déjà en place pour
 * inpiCompanionChatRouteDeps (src/app/api/lmnp/inpi-companion/chat/route.ts) :
 * ce test prouve le routage/la validation/le mapping d'erreurs de la route,
 * PAS la fiabilité d'un appel OpenAI réel.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { depreciationRegisterVisionRouteDeps, POST } from "@/app/api/lmnp/takeover/depreciation-register-vision/route";

function tinyPngBlob(): Blob {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

function makeRequest(formData: FormData): Request {
  return new Request("http://localhost/api/lmnp/takeover/depreciation-register-vision", {
    method: "POST",
    body: formData,
  });
}

describe("Lot 5.4-B — POST /api/lmnp/takeover/depreciation-register-vision", () => {
  it("documentId/pageNumber manquants → 400 (avant tout appel Vision)", async () => {
    const fd = new FormData();
    fd.append("image", tinyPngBlob(), "p.png");
    const res = await POST(makeRequest(fd));
    assert.equal(res.status, 400);
  });

  it("image manquante → 400", async () => {
    const fd = new FormData();
    fd.append("documentId", "doc-1");
    fd.append("pageNumber", "1");
    const res = await POST(makeRequest(fd));
    assert.equal(res.status, 400);
  });

  it("pageNumber invalide (0, négatif, non numérique) → 400", async () => {
    for (const pageNumber of ["0", "-1", "abc"]) {
      const fd = new FormData();
      fd.append("documentId", "doc-1");
      fd.append("pageNumber", pageNumber);
      fd.append("image", tinyPngBlob(), "p.png");
      const res = await POST(makeRequest(fd));
      assert.equal(res.status, 400, `pageNumber=${pageNumber} devrait être 400`);
    }
  });

  describe("chemin Vision (deps surchargées)", () => {
    const original = depreciationRegisterVisionRouteDeps.extractDepreciationRegisterVisionRows;
    after(() => {
      depreciationRegisterVisionRouteDeps.extractDepreciationRegisterVisionRows = original;
    });

    it("succès → 200 + lignes", async () => {
      depreciationRegisterVisionRouteDeps.extractDepreciationRegisterVisionRows = async () => [
        { rowType: "asset", pageNumber: 1, assetRef: "A1", rawSnippet: "A1" },
      ];
      const fd = new FormData();
      fd.append("documentId", "doc-1");
      fd.append("pageNumber", "1");
      fd.append("image", tinyPngBlob(), "p.png");

      const res = await POST(makeRequest(fd));
      assert.equal(res.status, 200);
      const body = (await res.json()) as { rows?: unknown[] };
      assert.equal(body.rows?.length, 1);
    });

    it("clé API absente (erreur remontée par le module serveur) → 503, jamais un succès", async () => {
      depreciationRegisterVisionRouteDeps.extractDepreciationRegisterVisionRows = async () => {
        throw new Error("OPENAI_API_KEY non configurée.");
      };
      const fd = new FormData();
      fd.append("documentId", "doc-1");
      fd.append("pageNumber", "1");
      fd.append("image", tinyPngBlob(), "p.png");

      const res = await POST(makeRequest(fd));
      assert.equal(res.status, 503);
      const body = (await res.json()) as { error?: string };
      assert.ok(body.error?.includes("OPENAI_API_KEY"));
    });

    it("erreur provider générique (timeout/panne) → 500, jamais un succès ni des lignes inventées", async () => {
      depreciationRegisterVisionRouteDeps.extractDepreciationRegisterVisionRows = async () => {
        throw new Error("Request timed out.");
      };
      const fd = new FormData();
      fd.append("documentId", "doc-1");
      fd.append("pageNumber", "1");
      fd.append("image", tinyPngBlob(), "p.png");

      const res = await POST(makeRequest(fd));
      assert.equal(res.status, 500);
    });
  });
});
