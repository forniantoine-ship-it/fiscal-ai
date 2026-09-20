/**
 * Lot 3 — documents + blobs cross-device.
 *
 * Proves the full chain without network:
 * upload metadata (documentId + storagePath) → snapshot → hydrate browser B
 * (empty FileRegistry/IndexedDB) → lazy Storage download → identical bytes →
 * local cache → second resolve uses cache.
 *
 * Run: npx tsx --test src/lib/lmnp/store/documents-cross-device.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

async function loadModules() {
  const reducerMod = await import("./reducer");
  const snapshotMod = await import("./workspace-snapshot");
  const resolveMod = await import("../services/resolve-document-file");
  const sanitizeMod = await import("@/lib/storage/sanitize-storage-filename");
  return { ...reducerMod, ...snapshotMod, ...resolveMod, ...sanitizeMod };
}

function baseState() {
  return {
    fiscalYear: {
      id: "fy-2024",
      year: 2024,
      propertyIds: ["prop-1"] as string[],
      status: "draft" as const,
      regime: "reel" as const,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
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

describe("Lot 3 — storagePath immédiat + identité durable", () => {
  it("UPLOAD_DOCUMENTS porte storagePath immédiatement (F009/F010/F011/F012)", async () => {
    const { lmnpReducer } = await loadModules();
    const file = new File([new Uint8Array([1, 2, 3])], "doc.pdf", { type: "application/pdf" });
    const path = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/1710000000-doc.pdf";

    for (const category of ["autre", "emprunt", "charges"] as const) {
      const next = lmnpReducer(baseState() as never, {
        type: "UPLOAD_DOCUMENTS",
        files: [
          {
            file,
            category,
            documentId: `doc-${category}`,
            isSupabaseDocumentId: true,
            storagePath: path,
          },
        ],
      });
      assert.equal(next.documents[0].id, `doc-${category}`);
      assert.equal(next.documents[0].storagePath, path);
      assert.equal(next.documents[0].hasSupabaseArtifacts, true);
      assert.equal(next.fileRegistry.get(`doc-${category}`), file);
    }
  });

  it("F010 owner path convention reste {userId}/…", async () => {
    const { buildStorageObjectPath } = await loadModules();
    const userId = "11111111-2222-4333-8444-555555555555";
    const { storagePath } = buildStorageObjectPath(userId, "Acte Notarié.pdf");
    assert.ok(storagePath.startsWith(`${userId}/`));
    assert.doesNotMatch(storagePath, /\.\./);
  });
});

describe("Lot 3 — snapshot metadata round-trip", () => {
  it("documentId + filename + storagePath survivent toPersistedWorkspace → serialize → parse", async () => {
    const { lmnpReducer, toPersistedWorkspace, serializeWorkspaceSnapshot, parseWorkspaceSnapshot } =
      await loadModules();
    const bytes = new Uint8Array([9, 8, 7, 6]);
    const file = new File([bytes], "acte.pdf", { type: "application/pdf" });
    const storagePath = "user-a/999-acte.pdf";
    const documentId = "doc-stable-uuid";

    const uploaded = lmnpReducer(baseState() as never, {
      type: "UPLOAD_DOCUMENTS",
      files: [
        {
          file,
          category: "autre",
          documentId,
          isSupabaseDocumentId: true,
          storagePath,
        },
      ],
    });

    const persisted = toPersistedWorkspace(uploaded);
    assert.equal(persisted.documents[0].id, documentId);
    assert.equal(persisted.documents[0].fileName, "acte.pdf");
    assert.equal(persisted.documents[0].storagePath, storagePath);
    assert.equal(persisted.documents[0].mimeType, "application/pdf");
    assert.equal(persisted.documents[0].sizeBytes, bytes.byteLength);

    const serialized = serializeWorkspaceSnapshot(persisted);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;

    const parsed = parseWorkspaceSnapshot(serialized.envelope);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const doc = parsed.envelope.workspace.documents[0];
    assert.equal(doc.id, documentId);
    assert.equal(doc.fileName, "acte.pdf");
    assert.equal(doc.storagePath, storagePath);
  });
});

describe("Lot 3 — cross-device A→B lazy restore", () => {
  it("navigateur B hydrate metadata, blob absent, download Storage, cache, second resolve sans re-download", async () => {
    const {
      lmnpReducer,
      toPersistedWorkspace,
      serializeWorkspaceSnapshot,
      parseWorkspaceSnapshot,
      resolveDocumentFile,
    } = await loadModules();

    const originalBytes = new Uint8Array([10, 20, 30, 40, 50]);
    const fileA = new File([originalBytes], "piece.pdf", { type: "application/pdf" });
    const documentId = "doc-cross-device-1";
    const storagePath = "user-u/1000-piece.pdf";

    // CLIENT A — upload metadata + local registry
    const clientA = lmnpReducer(baseState() as never, {
      type: "UPLOAD_DOCUMENTS",
      files: [
        {
          file: fileA,
          category: "autre",
          documentId,
          isSupabaseDocumentId: true,
          storagePath,
        },
      ],
    });
    assert.equal(clientA.fileRegistry.has(documentId), true);

    const persisted = toPersistedWorkspace(clientA);
    const serialized = serializeWorkspaceSnapshot(persisted);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    const parsed = parseWorkspaceSnapshot(serialized.envelope);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    // CLIENT B — empty caches, hydrate snapshot only
    const hydratedDoc = parsed.envelope.workspace.documents[0];
    assert.equal(hydratedDoc.id, documentId);
    assert.equal(hydratedDoc.storagePath, storagePath);

    const registryB = new Map<string, File>();
    const idbB = new Map<string, File>();
    let downloadCount = 0;

    const getFileB = (id: string) => registryB.get(id);

    // Blob absent before resolve
    assert.equal(getFileB(documentId), undefined);
    assert.equal(idbB.has(documentId), false);

    const fileFromStorage = await resolveDocumentFile(hydratedDoc, getFileB, {
      loadFromIndexedDb: async (id) => idbB.get(id) ?? null,
      downloadFromStorage: async (path) => {
        downloadCount += 1;
        assert.equal(path, storagePath);
        return originalBytes.buffer.slice(
          originalBytes.byteOffset,
          originalBytes.byteOffset + originalBytes.byteLength,
        );
      },
      persistToIndexedDb: async (doc, file) => {
        idbB.set(doc.id, file);
      },
      onCached: (id, file) => {
        registryB.set(id, file);
      },
    });

    assert.equal(downloadCount, 1);
    assert.equal(fileFromStorage.name, "piece.pdf");
    assert.equal(fileFromStorage.type, "application/pdf");
    const restoredBytes = new Uint8Array(await fileFromStorage.arrayBuffer());
    assert.deepEqual([...restoredBytes], [...originalBytes]);
    assert.equal(registryB.get(documentId), fileFromStorage);
    assert.equal(idbB.has(documentId), true);

    // Second resolve — local registry, no second download
    const second = await resolveDocumentFile(hydratedDoc, getFileB, {
      loadFromIndexedDb: async (id) => idbB.get(id) ?? null,
      downloadFromStorage: async () => {
        downloadCount += 1;
        return originalBytes.buffer;
      },
      persistToIndexedDb: async () => {},
      onCached: (id, file) => registryB.set(id, file),
    });
    assert.equal(downloadCount, 1, "second resolve must not re-download");
    assert.equal(second, fileFromStorage);
  });

  it("download Storage échoue → erreur explicite, metadata inchangée, aucun faux blob", async () => {
    const { resolveDocumentFile } = await loadModules();
    const doc = {
      id: "doc-fail",
      fiscalYearId: "fy",
      fileName: "x.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3,
      category: "autre" as const,
      documentType: "unknown" as const,
      status: "uploaded" as const,
      uploadedAt: "2024-01-01T00:00:00.000Z",
      storagePath: "user/x.pdf",
      hasSupabaseArtifacts: true,
    };
    const registry = new Map<string, File>();
    await assert.rejects(
      () =>
        resolveDocumentFile(doc, (id) => registry.get(id), {
          loadFromIndexedDb: async () => null,
          downloadFromStorage: async () => {
            throw new Error("storage denied");
          },
          persistToIndexedDb: async () => {
            throw new Error("should not persist");
          },
          onCached: () => {
            throw new Error("should not cache");
          },
        }),
      /storage denied/,
    );
    assert.equal(registry.size, 0);
    assert.equal(doc.storagePath, "user/x.pdf");
  });

  it("sans storagePath et sans blob local → fail explicite, jamais inventer un fichier", async () => {
    const { resolveDocumentFile } = await loadModules();
    const doc = {
      id: "doc-orphan",
      fiscalYearId: "fy",
      fileName: "orphan.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      category: "autre" as const,
      documentType: "unknown" as const,
      status: "uploaded" as const,
      uploadedAt: "2024-01-01T00:00:00.000Z",
    };
    await assert.rejects(
      () =>
        resolveDocumentFile(doc, () => undefined, {
          loadFromIndexedDb: async () => null,
          downloadFromStorage: async () => {
            throw new Error("should not download");
          },
        }),
      /aucune copie locale et aucun chemin Storage/i,
    );
  });
});

describe("Lot 3 — delete / replace reload via snapshot", () => {
  it("DELETE retire le document du snapshot suivant", async () => {
    const { lmnpReducer, toPersistedWorkspace, serializeWorkspaceSnapshot, parseWorkspaceSnapshot } =
      await loadModules();
    const file = new File([new Uint8Array([1])], "a.pdf", { type: "application/pdf" });
    let state = lmnpReducer(baseState() as never, {
      type: "UPLOAD_DOCUMENTS",
      files: [
        {
          file,
          category: "autre",
          documentId: "doc-del",
          isSupabaseDocumentId: true,
          storagePath: "u/1-a.pdf",
        },
      ],
    });
    state = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-del" });
    const serialized = serializeWorkspaceSnapshot(toPersistedWorkspace(state));
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    const parsed = parseWorkspaceSnapshot(serialized.envelope);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.envelope.workspace.documents.length, 0);
  });

  it("REPLACE pointe le snapshot vers le nouveau storagePath", async () => {
    const { lmnpReducer, toPersistedWorkspace, serializeWorkspaceSnapshot, parseWorkspaceSnapshot } =
      await loadModules();
    const file1 = new File([new Uint8Array([1])], "old.pdf", { type: "application/pdf" });
    const file2 = new File([new Uint8Array([2, 2])], "new.pdf", { type: "application/pdf" });
    let state = lmnpReducer(baseState() as never, {
      type: "UPLOAD_DOCUMENTS",
      files: [
        {
          file: file1,
          category: "emprunt",
          documentId: "doc-old",
          isSupabaseDocumentId: true,
          storagePath: "u/1-old.pdf",
        },
      ],
    });
    state = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-old" });
    state = lmnpReducer(state, {
      type: "UPLOAD_DOCUMENTS",
      files: [
        {
          file: file2,
          category: "emprunt",
          documentId: "doc-new",
          isSupabaseDocumentId: true,
          storagePath: "u/2-new.pdf",
        },
      ],
    });
    const serialized = serializeWorkspaceSnapshot(toPersistedWorkspace(state));
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    const parsed = parseWorkspaceSnapshot(serialized.envelope);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.envelope.workspace.documents.length, 1);
    assert.equal(parsed.envelope.workspace.documents[0].id, "doc-new");
    assert.equal(parsed.envelope.workspace.documents[0].storagePath, "u/2-new.pdf");
    assert.equal(parsed.envelope.workspace.documents[0].fileName, "new.pdf");
  });
});
