/**
 * Lot 2 — upload origin + UPLOAD_DOCUMENTS fiscal year + durable ref + lazy restore.
 * Run: npx tsx --test src/lib/lmnp/store/lot2-document-fiscal-isolation.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

async function loadModules() {
  const reducerMod = await import("./reducer");
  const resolveMod = await import("../services/resolve-document-file");
  const originMod = await import("../dossier/document-fiscal-origin");
  const deletionMod = await import("../dossier/document-deletion-plan");
  const snapshotMod = await import("./workspace-snapshot");
  return { ...reducerMod, ...resolveMod, ...originMod, ...deletionMod, ...snapshotMod };
}

function baseState(year = 2025) {
  return {
    fiscalYear: {
      id: `fy-${year}`,
      year,
      propertyIds: ["prop-1"] as string[],
      status: "draft" as const,
      regime: "reel" as const,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      dossierId: "dossier-d",
    },
    properties: [
      {
        id: "prop-1",
        label: "Bien",
        address: "1 rue Test",
        city: "Lyon",
        postalCode: "69001",
      },
    ],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [] as string[] },
    fileRegistry: new Map<string, File>(),
  };
}

describe("Lot 2 — UPLOAD_DOCUMENTS carries fiscal origin", () => {
  it("13/14 — annual upload persists fiscalYear + annual_evidence (cannot silently drop year)", async () => {
    const { lmnpReducer } = await loadModules();
    const file = new File([new Uint8Array([1, 2, 3])], "quittance.pdf", {
      type: "application/pdf",
    });
    const next = lmnpReducer(baseState(2025) as never, {
      type: "UPLOAD_DOCUMENTS",
      files: [
        {
          file,
          category: "revenus",
          documentId: "doc-q",
          isSupabaseDocumentId: true,
          storagePath: "user/quittance.pdf",
          fiscalYear: 2025,
          documentRole: "annual_evidence",
        },
      ],
    });
    assert.equal(next.documents[0].fiscalYear, 2025);
    assert.equal(next.documents[0].documentRole, "annual_evidence");
    assert.equal(next.documents[0].storagePath, "user/quittance.pdf");
    assert.equal(next.documents[0].propertyId, "prop-1");
  });

  it("defaults fiscalYear to workspace year when omitted (local producers)", async () => {
    const { lmnpReducer } = await loadModules();
    const file = new File([new Uint8Array([1])], "x.pdf", { type: "application/pdf" });
    const next = lmnpReducer(baseState(2026) as never, {
      type: "UPLOAD_DOCUMENTS",
      files: [{ file, category: "charges" }],
    });
    assert.equal(next.documents[0].fiscalYear, 2026);
    assert.equal(next.documents[0].documentRole, "annual_evidence");
  });
});

describe("Lot 2 — durable reference same blob + lazy restore", () => {
  it("7-11 — durable ref keeps id/path; lazy resolve uses same storagePath; no blob duplication", async () => {
    const { toDurableHistoricalReference, resolveDocumentFile } = await loadModules();
    const storagePath = "user-a/acte-2025.pdf";
    const documentId = "doc-acte-stable";
    const bytes = new Uint8Array([10, 20, 30, 40]);

    const ref = toDurableHistoricalReference({
      documentId,
      storagePath,
      fileName: "acte-2025.pdf",
      mimeType: "application/pdf",
      originFiscalYear: 2025,
      propertyId: "prop-1",
    });
    assert.equal(ref.documentId, documentId);
    assert.equal(ref.storagePath, storagePath);
    assert.equal(ref.propertyId, "prop-1");

    let downloadCount = 0;
    const file = await resolveDocumentFile(
      {
        id: ref.documentId,
        fiscalYearId: "fy-2025",
        fiscalYear: 2025,
        documentRole: "durable_reference",
        propertyId: ref.propertyId,
        fileName: ref.fileName,
        mimeType: ref.mimeType,
        sizeBytes: bytes.byteLength,
        category: "amortissement",
        documentType: "notary_deed",
        status: "uploaded",
        uploadedAt: "2025-06-01T00:00:00.000Z",
        storagePath: ref.storagePath,
        hasSupabaseArtifacts: true,
      },
      () => undefined,
      {
        loadFromIndexedDb: async () => null,
        downloadFromStorage: async (path) => {
          downloadCount += 1;
          assert.equal(path, storagePath);
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        },
        persistToIndexedDb: async () => {},
      },
    );

    assert.equal(file.name, "acte-2025.pdf");
    assert.equal(file.size, bytes.byteLength);
    assert.equal(downloadCount, 1);

    // Second resolve with cache — still the same storagePath identity, no second Storage object.
    const cached = await resolveDocumentFile(
      {
        id: ref.documentId,
        fiscalYearId: "fy-2025",
        fileName: ref.fileName,
        mimeType: ref.mimeType,
        sizeBytes: bytes.byteLength,
        category: "amortissement",
        documentType: "notary_deed",
        status: "uploaded",
        uploadedAt: "2025-06-01T00:00:00.000Z",
        storagePath: ref.storagePath,
      },
      () => file,
      {
        downloadFromStorage: async () => {
          downloadCount += 1;
          return bytes.buffer;
        },
      },
    );
    assert.equal(cached, file);
    assert.equal(downloadCount, 1, "same blob reused — no duplicated Storage download");
  });
});

describe("Lot 2 — delete/replace guarantees", () => {
  it("15/16 — removing durable ref from N+1 is local-only (does not destroy N history)", async () => {
    const { resolveDocumentDeletionPlan } = await loadModules();
    const plan = resolveDocumentDeletionPlan({
      hasSupabaseArtifacts: true,
      dossierId: "dossier-A",
      documentRole: "durable_reference",
      originFiscalYear: 2025,
      activeFiscalYear: 2026,
    });
    assert.equal(plan.kind, "local-only");
  });

  it("replace in N+1 uses a new document id — historical N row untouched by plan", async () => {
    const { lmnpReducer, resolveDocumentDeletionPlan } = await loadModules();
    const fileN = new File([new Uint8Array([1])], "n.pdf", { type: "application/pdf" });
    const fileN1 = new File([new Uint8Array([2])], "n1.pdf", { type: "application/pdf" });

    const stateN = lmnpReducer(baseState(2025) as never, {
      type: "UPLOAD_DOCUMENTS",
      files: [
        {
          file: fileN,
          category: "charges",
          documentId: "doc-n",
          isSupabaseDocumentId: true,
          storagePath: "user/n.pdf",
          fiscalYear: 2025,
        },
      ],
    });
    assert.equal(stateN.documents[0].id, "doc-n");

    const stateN1 = lmnpReducer(baseState(2026) as never, {
      type: "UPLOAD_DOCUMENTS",
      files: [
        {
          file: fileN1,
          category: "charges",
          documentId: "doc-n1-replacement",
          isSupabaseDocumentId: true,
          storagePath: "user/n1.pdf",
          fiscalYear: 2026,
        },
      ],
    });
    assert.equal(stateN1.documents[0].id, "doc-n1-replacement");
    assert.notEqual(stateN1.documents[0].id, stateN.documents[0].id);
    assert.notEqual(stateN1.documents[0].storagePath, stateN.documents[0].storagePath);

    const destroyN = resolveDocumentDeletionPlan({
      hasSupabaseArtifacts: true,
      dossierId: "dossier-A",
      documentRole: "annual_evidence",
      originFiscalYear: 2025,
      activeFiscalYear: 2026,
    });
    assert.equal(destroyN.kind, "local-only", "must not destroy N server artifacts from N+1");
  });
});

describe("Lot 2 — upload call sites transmit fiscal year", () => {
  it("13 — principal annual producers pass fiscalYear into uploadFilesForUser / upload options", () => {
    const roots: Array<{ rel: string; pattern: RegExp }> = [
      {
        rel: "src/components/lmnp/assistants/F009ActiviteAssistantPanel.tsx",
        pattern: /uploadFilesForUser\(\[file\], user\.id, \{[\s\S]*fiscalYear:/,
      },
      {
        rel: "src/components/lmnp/assistants/F011FinancementAssistantPanel.tsx",
        pattern: /uploadFilesForUser\(\[file\], user\.id, \{[\s\S]*fiscalYear:/,
      },
      {
        rel: "src/components/lmnp/documents/ChargesDocumentStep.tsx",
        pattern: /uploadFilesForUser\(files, user\.id, \{[\s\S]*fiscalYear:/,
      },
      {
        rel: "src/components/lmnp/documents/RevenusDocumentStep.tsx",
        pattern: /uploadFilesForUser\(files, user\.id, \{[\s\S]*fiscalYear:/,
      },
      {
        rel: "src/components/lmnp/documents/CreditDocumentStep.tsx",
        pattern: /uploadFilesForUser\(files, user\.id, \{[\s\S]*fiscalYear:/,
      },
      {
        rel: "src/components/lmnp/activite/ActiviteDocumentStep.tsx",
        pattern: /uploadFilesForUser\(files, user\.id, \{[\s\S]*fiscalYear:/,
      },
      {
        rel: "src/lib/lmnp/services/f012/f012-impots-document-upload.ts",
        pattern: /uploadFiles\(\[file\], userId, \{[\s\S]*fiscalYear/,
      },
      {
        rel: "src/lib/lmnp/services/f012/f012-documentary-review-upload.ts",
        pattern: /uploadFiles\(\[file\], userId, \{[\s\S]*fiscalYear/,
      },
      {
        rel: "src/components/lmnp/assistants/F012ChargesAssistantPanel.tsx",
        pattern: /documentRole:\s*"annual_evidence"/,
      },
    ];
    for (const { rel, pattern } of roots) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      assert.match(src, pattern, `${rel} must transmit fiscalYear / origin`);
    }

    const f010 = readFileSync(
      path.join(process.cwd(), "src/components/lmnp/assistants/F010LogementAssistantPanel.tsx"),
      "utf8",
    );
    assert.match(f010, /documentRole:\s*"durable_reference"/);
    assert.match(f010, /fiscalYear:\s*workspace\.fiscalYear\.year/);
  });

  it("14 — uploadDocument requires fiscalYear (throws on invalid)", async () => {
    const uploadMod = await import("@/lib/uploadDocument");
    await assert.rejects(
      () => uploadMod.uploadFilesForUser([], "user", { fiscalYear: 1999 }),
      /fiscalYear invalide/,
    );
  });
});

describe("Lot 2 — cross-device A/B with fiscal isolation", () => {
  it("18/19/20 — Browser B on N restores doc N; on N+1 does not; lazy cache still works", async () => {
    const { lmnpReducer, toPersistedWorkspace, resolveDocumentFile } = await loadModules();
    const { reconcileWorkspaceDocuments } = await import("../dossier/reconcile-workspace-documents");

    const bytes = new Uint8Array([7, 7, 7]);
    const file = new File([bytes], "quittance-n.pdf", { type: "application/pdf" });
    const documentId = "doc-n-cross";
    const storagePath = "user/quittance-n.pdf";

    const uploaded = lmnpReducer(baseState(2025) as never, {
      type: "UPLOAD_DOCUMENTS",
      files: [
        {
          file,
          category: "revenus",
          documentId,
          isSupabaseDocumentId: true,
          storagePath,
          fiscalYear: 2025,
          documentRole: "annual_evidence",
        },
      ],
    });
    const snapshotN = toPersistedWorkspace(uploaded);
    assert.equal(snapshotN.documents[0]?.id, documentId);
    assert.equal(snapshotN.documents[0]?.fiscalYear, 2025);

    const remoteRows = [
      {
        id: documentId,
        user_id: "user-A",
        dossier_id: "dossier-d",
        file_name: "quittance-n.pdf",
        file_path: storagePath,
        extraction_status: "pending",
        created_at: "2025-06-01T00:00:00.000Z",
        fiscal_year: 2025,
        document_role: "annual_evidence" as const,
        property_id: "prop-1",
      },
    ];

    const browserBOnN = reconcileWorkspaceDocuments({
      localDocuments: snapshotN.documents,
      supabaseDocuments: remoteRows,
      fiscalYearId: "fy-2025",
      fiscalYear: 2025,
      localBlobDocumentIds: new Set(),
      localExtractedDocumentIds: new Set(),
    });
    assert.equal(browserBOnN.documents.some((d) => d.id === documentId), true);

    let downloads = 0;
    const registry = new Map<string, File>();
    const idb = new Map<string, File>();
    const restored = await resolveDocumentFile(browserBOnN.documents[0]!, (id) => registry.get(id), {
      loadFromIndexedDb: async (id) => idb.get(id) ?? null,
      downloadFromStorage: async (path) => {
        downloads += 1;
        assert.equal(path, storagePath);
        return bytes.buffer.slice(0);
      },
      persistToIndexedDb: async (doc, f) => {
        idb.set(doc.id, f);
      },
      onCached: (id, f) => registry.set(id, f),
    });
    assert.equal(restored.size, bytes.byteLength);
    assert.equal(downloads, 1);

    const second = await resolveDocumentFile(browserBOnN.documents[0]!, (id) => registry.get(id), {
      loadFromIndexedDb: async (id) => idb.get(id) ?? null,
      downloadFromStorage: async () => {
        downloads += 1;
        return bytes.buffer.slice(0);
      },
    });
    assert.equal(second, restored);
    assert.equal(downloads, 1);

    const browserBOnN1 = reconcileWorkspaceDocuments({
      localDocuments: [],
      supabaseDocuments: remoteRows,
      fiscalYearId: "fy-2026",
      fiscalYear: 2026,
      localBlobDocumentIds: new Set(),
      localExtractedDocumentIds: new Set(),
    });
    assert.equal(browserBOnN1.documents.length, 0);
    assert.ok(browserBOnN1.skippedForeignYear >= 1);
  });
});
