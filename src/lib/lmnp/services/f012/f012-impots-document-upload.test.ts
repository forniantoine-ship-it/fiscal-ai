import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { analyzeImpotsDocument as AnalyzeImpotsDocumentFn } from "./f012-impots-document-upload";

/**
 * `f012-impots-document-upload.ts` importe `@/lib/supabase` (client créé au
 * chargement du module) pour sa dépendance par défaut `getAuthenticatedUserId`
 * — même contrainte que `reducer-confirmation-invalidation.test.ts` : import
 * dynamique après avoir posé des valeurs factices, jamais un contournement
 * du vrai module.
 */
async function loadAnalyzeImpotsDocument(): Promise<typeof AnalyzeImpotsDocumentFn> {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const mod = await import("./f012-impots-document-upload");
  return mod.analyzeImpotsDocument;
}

const AVIS_1100 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 100,00 EUR
Payé le 12/03/2024
`;

function fakeFile(name = "avis.txt"): File {
  return new File(["contenu"], name, { type: "text/plain" });
}

describe("analyzeImpotsDocument — F012 V2 Phase 2, boundary UI réel (mock réseau uniquement)", () => {
  it("File → upload réel (mocké au boundary réseau) → Expense.documentId === le vrai documentId renvoyé par l'upload", async () => {
    const analyzeImpotsDocument = await loadAnalyzeImpotsDocument();
    const result = await analyzeImpotsDocument(fakeFile(), 2024, {
      getAuthenticatedUserId: async () => "user-1",
      uploadFiles: async (files) => ({ files, documentIds: ["real-supabase-id-777"] }),
      extractText: async () => AVIS_1100,
    });
    assert.equal(result.status, "success");
    if (result.status !== "success") return;
    assert.equal(result.documentId, "real-supabase-id-777");
    assert.equal(result.expenses[0]?.documentId, "real-supabase-id-777", "le vrai documentId traverse jusqu'à l'Expense");
    assert.equal(result.expenses[0]?.montantExtrait, 1100);
    assert.equal(result.expenses[0]?.decision, "pending", "jamais confirmée automatiquement à l'extraction");
  });

  it("A — pas d'utilisateur authentifié → aucune Expense, aucune tentative d'upload", async () => {
    let uploadCalled = false;
    const analyzeImpotsDocument = await loadAnalyzeImpotsDocument();
    const result = await analyzeImpotsDocument(fakeFile(), 2024, {
      getAuthenticatedUserId: async () => null,
      uploadFiles: async (files) => {
        uploadCalled = true;
        return { files, documentIds: ["should-not-happen"] };
      },
      extractText: async () => AVIS_1100,
    });
    assert.equal(result.status, "not_authenticated");
    assert.equal(uploadCalled, false, "jamais d'upload sans utilisateur authentifié");
  });

  it("A — upload échoue (aucun fichier réellement stocké) → aucune Expense prétendument liée à un vrai document", async () => {
    const analyzeImpotsDocument = await loadAnalyzeImpotsDocument();
    const result = await analyzeImpotsDocument(fakeFile(), 2024, {
      getAuthenticatedUserId: async () => "user-1",
      uploadFiles: async () => ({ files: [], documentIds: [] }),
      extractText: async () => AVIS_1100,
    });
    assert.equal(result.status, "upload_failed");
    assert.ok(!("documentId" in result));
  });

  it("B — upload réussit mais l'extraction échoue → le document réel existe (documentId renvoyé), mais aucune Expense n'est fabriquée", async () => {
    const analyzeImpotsDocument = await loadAnalyzeImpotsDocument();
    const result = await analyzeImpotsDocument(fakeFile(), 2024, {
      getAuthenticatedUserId: async () => "user-1",
      uploadFiles: async (files) => ({ files, documentIds: ["real-id-after-upload"] }),
      extractText: async () => {
        throw new Error("extraction crash");
      },
    });
    assert.equal(result.status, "extraction_failed");
    if (result.status !== "extraction_failed") return;
    // Le document réel doit rester traçable même si aucune Expense n'existe.
    assert.equal(result.documentId, "real-id-after-upload");
  });

  it("C — extraction réussit mais ne trouve aucun montant → Expense pending/review, jamais confirmed à 0", async () => {
    const analyzeImpotsDocument = await loadAnalyzeImpotsDocument();
    const result = await analyzeImpotsDocument(fakeFile(), 2024, {
      getAuthenticatedUserId: async () => "user-1",
      uploadFiles: async (files) => ({ files, documentIds: ["real-id-no-amount"] }),
      extractText: async () => "Avis de taxe foncière — Année 2024\nCommune : Lyon\n",
    });
    assert.equal(result.status, "success");
    if (result.status !== "success") return;
    const [expense] = result.expenses;
    assert.equal(expense?.montantExtrait, undefined);
    assert.equal(expense?.decision, "pending");
    assert.equal(expense?.reviewNeeded, true);
    assert.notEqual(expense?.decision, "confirmed", "jamais confirmée automatiquement sans montant réel");
  });
});
