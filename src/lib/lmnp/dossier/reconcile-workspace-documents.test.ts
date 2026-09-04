import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { reconcileWorkspaceDocuments } from "./reconcile-workspace-documents";
import type { SupabaseDocumentRow } from "./supabase-dossier";

function remoteRow(overrides: Partial<SupabaseDocumentRow> = {}): SupabaseDocumentRow {
  return {
    id: "doc-remote-1",
    user_id: "user-A",
    dossier_id: "dossier-A",
    file_name: "facture-mobilier.pdf",
    file_path: "user-A/facture-mobilier.pdf",
    extraction_status: "completed",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("reconcileWorkspaceDocuments — hasSupabaseArtifacts (P1-4.1)", () => {
  it("document Supabase sans correspondance locale → reconstruit avec hasSupabaseArtifacts:true", () => {
    const result = reconcileWorkspaceDocuments({
      localDocuments: [],
      supabaseDocuments: [remoteRow()],
      fiscalYearId: "fy-1",
      propertyId: "prop-1",
      localBlobDocumentIds: new Set(),
      localExtractedDocumentIds: new Set(),
    });

    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, "doc-remote-1");
    assert.equal(result.documents[0].hasSupabaseArtifacts, true, "reconstruit depuis une ligne Supabase confirmée — l'origine est certaine");
  });

  it("document local déjà correctement suivi (même id, hasSupabaseArtifacts déjà true) → préservé via le spread existant", () => {
    const result = reconcileWorkspaceDocuments({
      localDocuments: [
        {
          id: "doc-remote-1",
          fiscalYearId: "fy-1",
          fileName: "facture-mobilier.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          category: "amortissement",
          documentType: "unknown",
          status: "analyzed",
          uploadedAt: "2026-01-01T00:00:00Z",
          hasSupabaseArtifacts: true,
        },
      ],
      supabaseDocuments: [remoteRow()],
      fiscalYearId: "fy-1",
      propertyId: "prop-1",
      localBlobDocumentIds: new Set(["doc-remote-1"]),
      localExtractedDocumentIds: new Set(),
    });

    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].hasSupabaseArtifacts, true, "le spread ...existing préserve déjà correctement le signal");
  });

  it("document purement local, aucune ligne Supabase correspondante → hasSupabaseArtifacts non affecté (reste absent/false)", () => {
    const result = reconcileWorkspaceDocuments({
      localDocuments: [
        {
          id: "doc-local-1",
          fiscalYearId: "fy-1",
          fileName: "note-perso.pdf",
          mimeType: "application/pdf",
          sizeBytes: 50,
          category: "autre",
          documentType: "unknown",
          status: "uploaded",
          uploadedAt: "2026-01-01T00:00:00Z",
        },
      ],
      supabaseDocuments: [],
      fiscalYearId: "fy-1",
      propertyId: "prop-1",
      localBlobDocumentIds: new Set(["doc-local-1"]),
      localExtractedDocumentIds: new Set(),
    });

    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].hasSupabaseArtifacts, undefined);
  });
});
