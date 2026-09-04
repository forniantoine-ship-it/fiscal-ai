import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { FiscalYear, Property } from "../types";

/**
 * P1-4.1 — reducer.ts importe transitivement src/lib/supabase.ts (client créé au
 * chargement du module) : import dynamique après avoir posé des valeurs factices,
 * même pattern que reducer-revenus-removal.test.ts / reducer-upload-documents-id.test.ts.
 */
async function loadReducer() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const mod = await import("./reducer");
  return mod.lmnpReducer;
}

function baseFiscalYear(): FiscalYear {
  return {
    id: "fy-1",
    year: 2026,
    status: "draft",
    regime: "reel",
    propertyIds: ["prop-1"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function baseProperty(): Property {
  return { id: "prop-1", label: "", address: "", city: "", postalCode: "" };
}

function baseWorkspaceState() {
  return {
    fiscalYear: baseFiscalYear(),
    properties: [baseProperty()],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: undefined,
    fileRegistry: new Map(),
  };
}

/**
 * hasSupabaseArtifacts doit venir UNIQUEMENT de isSupabaseDocumentId — jamais de
 * "documentId != null". Chaque cas ci-dessous reproduit exactement la forme de
 * payload envoyée par un producteur réel après P1-4.1.
 */
describe("UPLOAD_DOCUMENTS — hasSupabaseArtifacts dérivé de isSupabaseDocumentId (P1-4.1)", () => {
  it("Activité/Logement/Revenus/Charges/Crédit/Amortissement/Generic — id Supabase réel + isSupabaseDocumentId:true → hasSupabaseArtifacts:true", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseWorkspaceState() as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const file = new File(["contenu"], "bail.pdf", { type: "application/pdf" });
    const next = lmnpReducer(state, {
      type: "UPLOAD_DOCUMENTS",
      files: [
        { file, category: "bail", documentId: "supabase-doc-real-id", isSupabaseDocumentId: true },
      ],
    });

    assert.equal(next.documents[0].id, "supabase-doc-real-id");
    assert.equal(next.documents[0].hasSupabaseArtifacts, true);
  });

  it("F009/F011 — id local remplacé par le vrai id Supabase, isSupabaseDocumentId:true → hasSupabaseArtifacts:true", async () => {
    // Reproduit exactement le nouveau payload de F009ActiviteAssistantPanel /
    // F011FinancementAssistantPanel : le documentId utilisé pour REGISTER_FILE /
    // assistant.handle EST désormais le vrai id Supabase, plus un crypto.randomUUID().
    const lmnpReducer = await loadReducer();
    const state = baseWorkspaceState() as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const file = new File(["contenu"], "carte-inpi.pdf", { type: "application/pdf" });
    const next = lmnpReducer(state, {
      type: "UPLOAD_DOCUMENTS",
      files: [
        { file, category: "autre", documentId: "supabase-doc-f009", isSupabaseDocumentId: true },
      ],
    });

    assert.equal(next.documents[0].id, "supabase-doc-f009");
    assert.equal(next.documents[0].hasSupabaseArtifacts, true);
  });

  it("F010 — documentId local (crypto.randomUUID) SANS isSupabaseDocumentId → hasSupabaseArtifacts:false", async () => {
    // F010 ne fait aucun upload Supabase ; son documentId reste un id local
    // nécessaire à REGISTER_FILE/assistant.handle, mais ne doit plus déclencher
    // à tort le chemin de suppression serveur.
    const lmnpReducer = await loadReducer();
    const state = baseWorkspaceState() as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const file = new File(["contenu"], "acte-notarie.pdf", { type: "application/pdf" });
    const localId = "11111111-1111-4111-8111-111111111111";
    const next = lmnpReducer(state, {
      type: "UPLOAD_DOCUMENTS",
      files: [{ file, category: "autre", documentId: localId }],
    });

    assert.equal(next.documents[0].id, localId, "l'id local nécessaire au câblage synchrone F010 est conservé tel quel");
    assert.equal(next.documents[0].hasSupabaseArtifacts, false, "aucun artefact Supabase — false, pas déduit d'un documentId non nul");
  });

  it("aucun documentId fourni → fallback crypto.randomUUID(), hasSupabaseArtifacts:false", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseWorkspaceState() as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const file = new File(["contenu"], "document-local.pdf", { type: "application/pdf" });
    const next = lmnpReducer(state, {
      type: "UPLOAD_DOCUMENTS",
      files: [{ file, category: "autre" }],
    });

    assert.match(next.documents[0].id, /^[0-9a-f-]{36}$/i);
    assert.equal(next.documents[0].hasSupabaseArtifacts, false);
  });

  it("isSupabaseDocumentId:true mais documentId absent → hasSupabaseArtifacts:true sur un id de secours (payload malformé théorique, ne doit jamais crasher)", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseWorkspaceState() as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const file = new File(["contenu"], "x.pdf", { type: "application/pdf" });
    const next = lmnpReducer(state, {
      type: "UPLOAD_DOCUMENTS",
      files: [{ file, category: "autre", isSupabaseDocumentId: true }],
    });

    assert.match(next.documents[0].id, /^[0-9a-f-]{36}$/i, "aucun producteur réel ne fait ça — vérifie juste l'absence de crash");
    assert.equal(next.documents[0].hasSupabaseArtifacts, true);
  });

  it("mix dans le même appel : un document Supabase réel + un document F010-like local, sans confusion", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseWorkspaceState() as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const fileSupabase = new File(["a"], "facture-supabase.pdf", { type: "application/pdf" });
    const fileLocal = new File(["b"], "acte-local.pdf", { type: "application/pdf" });

    const next = lmnpReducer(state, {
      type: "UPLOAD_DOCUMENTS",
      files: [
        { file: fileSupabase, category: "charges", documentId: "supabase-real-id", isSupabaseDocumentId: true },
        { file: fileLocal, category: "autre", documentId: "local-only-id" },
      ],
    });

    const supabaseDoc = next.documents.find((d) => d.fileName === "facture-supabase.pdf");
    const localDoc = next.documents.find((d) => d.fileName === "acte-local.pdf");

    assert.equal(supabaseDoc?.id, "supabase-real-id");
    assert.equal(supabaseDoc?.hasSupabaseArtifacts, true);
    assert.equal(localDoc?.id, "local-only-id");
    assert.equal(localDoc?.hasSupabaseArtifacts, false);
  });
});
