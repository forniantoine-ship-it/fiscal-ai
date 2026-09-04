import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { FiscalYear, Property } from "../types";

/**
 * P1-3.1 — reducer.ts importe transitivement src/lib/supabase.ts (client créé au
 * chargement du module) : import dynamique après avoir posé des valeurs factices,
 * même pattern que reducer-revenus-removal.test.ts.
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("UPLOAD_DOCUMENTS — LmnpDocument.id suit le documentId Supabase quand il est fourni (P1-3.1)", () => {
  it("un document avec documentId Supabase : LmnpDocument.id === documents.id Supabase", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseWorkspaceState() as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const file = new File(["contenu"], "facture-mobilier.pdf", { type: "application/pdf" });
    const next = lmnpReducer(state, {
      type: "UPLOAD_DOCUMENTS",
      files: [{ file, category: "amortissement", documentId: "supabase-doc-id-A" }],
    });

    assert.equal(next.documents.length, 1);
    assert.equal(next.documents[0].id, "supabase-doc-id-A", "l'id local doit être exactement le documents.id Supabase");
    assert.equal(next.documents[0].fileName, "facture-mobilier.pdf");
    assert.equal(next.documents[0].category, "amortissement");
    assert.equal(next.documents[0].status, "uploaded", "pas de régression sur le statut initial");
  });

  it("deux documents uploadés ensemble : chacun reçoit son propre documents.id, sans confusion d'index", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseWorkspaceState() as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const fileA = new File(["a"], "facture-A.pdf", { type: "application/pdf" });
    const fileB = new File(["b"], "facture-B.pdf", { type: "application/pdf" });

    const next = lmnpReducer(state, {
      type: "UPLOAD_DOCUMENTS",
      files: [
        { file: fileA, category: "amortissement", documentId: "supabase-doc-id-A" },
        { file: fileB, category: "amortissement", documentId: "supabase-doc-id-B" },
      ],
    });

    assert.equal(next.documents.length, 2);
    const docA = next.documents.find((d) => d.fileName === "facture-A.pdf");
    const docB = next.documents.find((d) => d.fileName === "facture-B.pdf");
    assert.equal(docA?.id, "supabase-doc-id-A", "le premier fichier reçoit le premier documentId, pas le second");
    assert.equal(docB?.id, "supabase-doc-id-B", "le second fichier reçoit le second documentId, pas le premier");
  });

  it("document sans supabaseDocumentId : fallback crypto.randomUUID() inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseWorkspaceState() as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const file = new File(["contenu"], "document-local.pdf", { type: "application/pdf" });
    const next = lmnpReducer(state, {
      type: "UPLOAD_DOCUMENTS",
      files: [{ file, category: "autre", documentId: undefined }],
    });

    assert.equal(next.documents.length, 1);
    assert.match(next.documents[0].id, UUID_RE, "sans documentId fourni, l'id doit rester un UUID généré localement");
  });

  it("mix dans le même appel : un document avec documentId, un sans — chacun suit sa propre règle", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseWorkspaceState() as unknown as Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

    const fileWithId = new File(["a"], "avec-id.pdf", { type: "application/pdf" });
    const fileWithoutId = new File(["b"], "sans-id.pdf", { type: "application/pdf" });

    const next = lmnpReducer(state, {
      type: "UPLOAD_DOCUMENTS",
      files: [
        { file: fileWithId, category: "amortissement", documentId: "supabase-doc-id-C" },
        { file: fileWithoutId, category: "amortissement" },
      ],
    });

    const withId = next.documents.find((d) => d.fileName === "avec-id.pdf");
    const withoutId = next.documents.find((d) => d.fileName === "sans-id.pdf");
    assert.equal(withId?.id, "supabase-doc-id-C");
    assert.match(withoutId!.id, UUID_RE, "le document sans documentId garde un UUID local, indépendant du premier");
  });
});
