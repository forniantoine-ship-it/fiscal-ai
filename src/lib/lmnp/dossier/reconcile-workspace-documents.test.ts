/**
 * Lot 2 — reconcile isolation N / N+1.
 * Run: npx tsx --test src/lib/lmnp/dossier/reconcile-workspace-documents.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { reconcileWorkspaceDocuments } from "./reconcile-workspace-documents";
import type { SupabaseDocumentRow } from "./supabase-dossier";
import type { LmnpDocument } from "@/lib/lmnp/types";

function remoteRow(overrides: Partial<SupabaseDocumentRow> = {}): SupabaseDocumentRow {
  return {
    id: "doc-remote-1",
    user_id: "user-A",
    dossier_id: "dossier-A",
    file_name: "facture-mobilier.pdf",
    file_path: "user-A/facture-mobilier.pdf",
    extraction_status: "completed",
    created_at: "2026-01-01T00:00:00Z",
    fiscal_year: 2025,
    document_role: "annual_evidence",
    property_id: "prop-1",
    ...overrides,
  };
}

function localDoc(overrides: Partial<LmnpDocument> = {}): LmnpDocument {
  return {
    id: "doc-local-1",
    fiscalYearId: "fy-1",
    fiscalYear: 2025,
    documentRole: "annual_evidence",
    fileName: "note-perso.pdf",
    mimeType: "application/pdf",
    sizeBytes: 50,
    category: "autre",
    documentType: "unknown",
    status: "uploaded",
    uploadedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("reconcileWorkspaceDocuments — hasSupabaseArtifacts (P1-4.1)", () => {
  it("document Supabase sans correspondance locale → reconstruit avec hasSupabaseArtifacts:true", () => {
    const result = reconcileWorkspaceDocuments({
      localDocuments: [],
      supabaseDocuments: [remoteRow()],
      fiscalYearId: "fy-1",
      fiscalYear: 2025,
      propertyId: "prop-1",
      localBlobDocumentIds: new Set(),
      localExtractedDocumentIds: new Set(),
    });

    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, "doc-remote-1");
    assert.equal(result.documents[0].hasSupabaseArtifacts, true);
    assert.equal(result.documents[0].fiscalYear, 2025);
  });

  it("document local déjà correctement suivi (même id, hasSupabaseArtifacts déjà true) → préservé", () => {
    const result = reconcileWorkspaceDocuments({
      localDocuments: [
        {
          id: "doc-remote-1",
          fiscalYearId: "fy-1",
          fiscalYear: 2025,
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
      fiscalYear: 2025,
      propertyId: "prop-1",
      localBlobDocumentIds: new Set(["doc-remote-1"]),
      localExtractedDocumentIds: new Set(),
    });

    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].hasSupabaseArtifacts, true);
  });

  it("document purement local, aucune ligne Supabase correspondante → hasSupabaseArtifacts non affecté", () => {
    const result = reconcileWorkspaceDocuments({
      localDocuments: [localDoc()],
      supabaseDocuments: [],
      fiscalYearId: "fy-1",
      fiscalYear: 2025,
      propertyId: "prop-1",
      localBlobDocumentIds: new Set(["doc-local-1"]),
      localExtractedDocumentIds: new Set(),
    });

    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].hasSupabaseArtifacts, undefined);
  });
});

describe("reconcileWorkspaceDocuments — Lot 2 fiscal isolation", () => {
  it("2/3 — reload N keeps annual doc N; reload N+1 never reinjects it", () => {
    const annualN = remoteRow({ id: "doc-n", fiscal_year: 2025, file_name: "quittance-2025.pdf" });

    const onN = reconcileWorkspaceDocuments({
      localDocuments: [],
      supabaseDocuments: [annualN],
      fiscalYearId: "fy-2025",
      fiscalYear: 2025,
      localBlobDocumentIds: new Set(),
      localExtractedDocumentIds: new Set(),
    });
    assert.equal(onN.documents.length, 1);
    assert.equal(onN.documents[0].id, "doc-n");
    assert.equal(onN.documents[0].fiscalYear, 2025);

    const onN1 = reconcileWorkspaceDocuments({
      localDocuments: [],
      supabaseDocuments: [annualN, remoteRow({ id: "doc-legacy", fiscal_year: null })],
      fiscalYearId: "fy-2026",
      fiscalYear: 2026,
      localBlobDocumentIds: new Set(),
      localExtractedDocumentIds: new Set(),
    });
    assert.equal(onN1.documents.length, 0);
    assert.ok(onN1.skippedForeignYear >= 1);
    assert.ok(onN1.skippedLegacyUnresolved >= 1);
  });

  it("4 — document N never becomes N+1 via active-year fallback", () => {
    const result = reconcileWorkspaceDocuments({
      localDocuments: [],
      supabaseDocuments: [remoteRow({ fiscal_year: 2025 })],
      fiscalYearId: "fy-2026",
      fiscalYear: 2026,
      localBlobDocumentIds: new Set(),
      localExtractedDocumentIds: new Set(),
    });
    assert.equal(result.documents.length, 0);
    assert.equal(result.restored, 0);
  });

  it("5 — legacy null year + snapshot proof for N injects only into N", () => {
    const legacy = remoteRow({ id: "doc-legacy", fiscal_year: null, document_role: null });
    const snapshots = [{ fiscalYear: 2025, documentIds: ["doc-legacy"] }];

    const onN = reconcileWorkspaceDocuments({
      localDocuments: [],
      supabaseDocuments: [legacy],
      fiscalYearId: "fy-2025",
      fiscalYear: 2025,
      localBlobDocumentIds: new Set(),
      localExtractedDocumentIds: new Set(),
      legacySnapshots: snapshots,
    });
    assert.equal(onN.documents.length, 1);
    assert.equal(onN.documents[0].id, "doc-legacy");

    const onN1 = reconcileWorkspaceDocuments({
      localDocuments: [],
      supabaseDocuments: [legacy],
      fiscalYearId: "fy-2026",
      fiscalYear: 2026,
      localBlobDocumentIds: new Set(),
      localExtractedDocumentIds: new Set(),
      legacySnapshots: snapshots,
    });
    assert.equal(onN1.documents.length, 0);
  });

  it("6 — ambiguous legacy never attributed to N+1", () => {
    const legacy = remoteRow({ id: "doc-amb", fiscal_year: null, document_role: null });
    const result = reconcileWorkspaceDocuments({
      localDocuments: [],
      supabaseDocuments: [legacy],
      fiscalYearId: "fy-2026",
      fiscalYear: 2026,
      localBlobDocumentIds: new Set(),
      localExtractedDocumentIds: new Set(),
      legacySnapshots: [
        { fiscalYear: 2025, documentIds: ["doc-amb"] },
        { fiscalYear: 2026, documentIds: ["doc-amb"] },
      ],
    });
    assert.equal(result.documents.length, 0);
    assert.equal(result.skippedLegacyUnresolved, 1);
  });

  it("7-10 — durable reference keeps id/path/propertyId and is not annual evidence of N+1", () => {
    const durable = remoteRow({
      id: "doc-acte",
      file_name: "acte-notarie.pdf",
      file_path: "user-A/acte-notarie.pdf",
      fiscal_year: 2025,
      document_role: "durable_reference",
      property_id: "prop-42",
    });

    const onN1 = reconcileWorkspaceDocuments({
      localDocuments: [],
      supabaseDocuments: [durable],
      fiscalYearId: "fy-2026",
      fiscalYear: 2026,
      localBlobDocumentIds: new Set(),
      localExtractedDocumentIds: new Set(),
    });
    assert.equal(onN1.documents.length, 0);

    const onN = reconcileWorkspaceDocuments({
      localDocuments: [],
      supabaseDocuments: [durable],
      fiscalYearId: "fy-2025",
      fiscalYear: 2025,
      localBlobDocumentIds: new Set(),
      localExtractedDocumentIds: new Set(),
    });
    assert.equal(onN.documents.length, 1);
    assert.equal(onN.documents[0].id, "doc-acte");
    assert.equal(onN.documents[0].storagePath, "user-A/acte-notarie.pdf");
    assert.equal(onN.documents[0].propertyId, "prop-42");
    assert.equal(onN.documents[0].documentRole, "durable_reference");
  });

  it("17 — reconcile does not resurrect annual evidence of another year alongside local N+1 docs", () => {
    const localN1 = localDoc({
      id: "doc-n1",
      fiscalYearId: "fy-2026",
      fiscalYear: 2026,
      fileName: "facture-2026.pdf",
    });
    const result = reconcileWorkspaceDocuments({
      localDocuments: [localN1],
      supabaseDocuments: [
        remoteRow({ id: "doc-n", fiscal_year: 2025, file_name: "facture-2025.pdf" }),
        remoteRow({
          id: "doc-n1",
          fiscal_year: 2026,
          file_name: "facture-2026.pdf",
          file_path: "user-A/facture-2026.pdf",
        }),
      ],
      fiscalYearId: "fy-2026",
      fiscalYear: 2026,
      localBlobDocumentIds: new Set(["doc-n1"]),
      localExtractedDocumentIds: new Set(),
    });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, "doc-n1");
    assert.ok(result.skippedForeignYear >= 1);
  });
});
