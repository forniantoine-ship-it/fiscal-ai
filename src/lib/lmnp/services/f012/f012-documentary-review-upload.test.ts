import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { analyzeDocumentaryReview as AnalyzeDocumentaryReviewFn } from "./f012-documentary-review-upload";

/**
 * Même contrainte que `f012-impots-document-upload.test.ts` : le module
 * importe `@/lib/supabase` (client créé au chargement) pour sa dépendance
 * par défaut `getAuthenticatedUserId` — import dynamique après avoir posé
 * des valeurs factices, jamais un contournement du vrai module.
 */
async function loadAnalyzeDocumentaryReview(): Promise<typeof AnalyzeDocumentaryReviewFn> {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const mod = await import("./f012-documentary-review-upload");
  return mod.analyzeDocumentaryReview;
}

const CONTRAT_ASSURANCE = `
AXA ASSURANCE
Contrat Multirisque Habitation
Période du 01/01/2024 au 31/12/2024
Prime annuelle TTC : 300,00 €
Payé le 15/03/2024
`;

function fakeFile(name = "contrat.txt"): File {
  return new File(["contenu"], name, { type: "text/plain" });
}

describe("analyzeDocumentaryReview — F012 V2 Phase 3, boundary UI réel (mock réseau uniquement)", () => {
  it("File → upload réel (mocké au boundary réseau) → proposals[].documentId === le vrai documentId renvoyé par l'upload", async () => {
    const analyzeDocumentaryReview = await loadAnalyzeDocumentaryReview();
    const result = await analyzeDocumentaryReview(fakeFile(), "assurances", 2024, {
      getAuthenticatedUserId: async () => "user-1",
      uploadFiles: async (files) => ({ files, documentIds: ["real-supabase-id-999"], filePaths: ["user/real-supabase-id-999.pdf"] }),
      extractText: async () => CONTRAT_ASSURANCE,
    });
    assert.equal(result.status, "success");
    if (result.status !== "success") return;
    assert.equal(result.documentId, "real-supabase-id-999");
    assert.equal(result.storagePath, "user/real-supabase-id-999.pdf");
    assert.ok(result.proposals.length > 0);
    assert.ok(
      result.proposals.every((proposal) => proposal.documentId === "real-supabase-id-999"),
      "le vrai documentId traverse jusqu'à chaque ChargeProposal — jamais l'id synthétique f012-doc-*",
    );
  });

  it("A — pas d'utilisateur authentifié → aucune proposition, aucune tentative d'upload", async () => {
    let uploadCalled = false;
    const analyzeDocumentaryReview = await loadAnalyzeDocumentaryReview();
    const result = await analyzeDocumentaryReview(fakeFile(), "gestion", 2024, {
      getAuthenticatedUserId: async () => null,
      uploadFiles: async (files) => {
        uploadCalled = true;
        return { files, documentIds: ["should-not-happen"], filePaths: ["user/should-not-happen.pdf"] };
      },
      extractText: async () => CONTRAT_ASSURANCE,
    });
    assert.equal(result.status, "not_authenticated");
    assert.equal(uploadCalled, false);
  });

  it("A — upload échoue → aucun document réellement stocké, aucune proposition prétendument liée", async () => {
    const analyzeDocumentaryReview = await loadAnalyzeDocumentaryReview();
    const result = await analyzeDocumentaryReview(fakeFile(), "syndic", 2024, {
      getAuthenticatedUserId: async () => "user-1",
      uploadFiles: async () => ({ files: [], documentIds: [], filePaths: [] }),
      extractText: async () => CONTRAT_ASSURANCE,
    });
    assert.equal(result.status, "upload_failed");
  });

  it("B — upload réussit mais l'extraction échoue → document réel traçable (documentId renvoyé), aucune proposition fabriquée", async () => {
    const analyzeDocumentaryReview = await loadAnalyzeDocumentaryReview();
    const result = await analyzeDocumentaryReview(fakeFile(), "assurances", 2024, {
      getAuthenticatedUserId: async () => "user-1",
      uploadFiles: async (files) => ({ files, documentIds: ["real-id-after-upload"], filePaths: ["user/real-id-after-upload.pdf"] }),
      extractText: async () => {
        throw new Error("extraction crash");
      },
    });
    assert.equal(result.status, "extraction_failed");
    if (result.status !== "extraction_failed") return;
    assert.equal(result.documentId, "real-id-after-upload");
  });

  it("C — trois familles routées vers leurs extracteurs respectifs (aucun nouveau parseur)", async () => {
    const analyzeDocumentaryReview = await loadAnalyzeDocumentaryReview();
    const deps = {
      getAuthenticatedUserId: async () => "user-1",
      uploadFiles: async (files: File[]) => ({ files, documentIds: ["doc-family-test"], filePaths: ["user/doc-family-test.pdf"] }),
    };
    const gestion = await analyzeDocumentaryReview(fakeFile(), "gestion", 2024, {
      ...deps,
      extractText: async () => "Honoraires de gestion : 480,00 €\nPayé le 15/03/2024\n",
    });
    assert.equal(gestion.status, "success");
    if (gestion.status === "success") {
      assert.ok(gestion.proposals.some((p) => p.gestionKind !== undefined));
    }
    const syndic = await analyzeDocumentaryReview(fakeFile(), "syndic", 2024, {
      ...deps,
      extractText: async () => "Provisions sur charges communes : 200,00 €\n",
    });
    assert.equal(syndic.status, "success");
  });
});
