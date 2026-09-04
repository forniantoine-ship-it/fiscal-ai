import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { deleteDocumentArtifacts } from "./delete-document";
import { OwnershipError } from "@/lib/supabase-server";

type Row = Record<string, unknown>;
type CallLog = Array<{ op: string; table?: string; path?: string }>;

/**
 * Stub Supabase client modeling exactly the query/storage shape used by
 * deleteDocumentArtifacts: .from(table).select(...).eq(...).maybeSingle(),
 * .from(table).delete().eq(...).eq(...) (awaitable without a terminal call,
 * like the real supabase-js builder), and .storage.from(bucket).exists()/.remove().
 * Mutates an in-memory table store so post-conditions (rows actually gone) are
 * verifiable, not just "was called".
 */
function makeStubSupabase(config: {
  documents?: Row[];
  extractedDocumentData?: Row[];
  storage?: "present" | "absent" | "throw";
  storageRemoveError?: string;
  extractionDeleteError?: string;
  documentDeleteError?: string;
}) {
  const tables: Record<string, Row[]> = {
    documents: [...(config.documents ?? [])],
    extracted_document_data: [...(config.extractedDocumentData ?? [])],
  };
  const calls: CallLog = [];

  function selectBuilder(table: string) {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return builder;
      },
      async maybeSingle() {
        calls.push({ op: "select", table });
        const row = tables[table].find((r) => filters.every(([k, v]) => r[k] === v));
        return { data: row ?? null, error: null };
      },
    };
    return builder;
  }

  function deleteBuilder(table: string) {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return builder;
      },
      // Awaitable directly, like supabase-js's real delete().eq().eq() builder —
      // no terminal .then()-less call needed on the caller side.
      then(
        resolve: (value: { error: { message: string } | null }) => void,
      ) {
        calls.push({ op: "delete", table });
        const err =
          table === "extracted_document_data"
            ? config.extractionDeleteError
            : table === "documents"
              ? config.documentDeleteError
              : undefined;

        if (!err) {
          tables[table] = tables[table].filter((r) => !filters.every(([k, v]) => r[k] === v));
        }
        resolve({ error: err ? { message: err } : null });
      },
    };
    return builder;
  }

  const storage = {
    from(_bucket: string) {
      return {
        async exists(path: string) {
          calls.push({ op: "storage.exists", path });
          if (config.storage === "throw") {
            throw new Error("network error contacting Storage");
          }
          if (config.storage === "absent") {
            return { data: false, error: { message: "Object not found" } };
          }
          return { data: true, error: null };
        },
        async remove(paths: string[]) {
          calls.push({ op: "storage.remove", path: paths[0] });
          if (config.storageRemoveError) {
            return { data: null, error: { message: config.storageRemoveError } };
          }
          return { data: [], error: null };
        },
      };
    },
  };

  const client = {
    from(table: string) {
      return {
        select: () => selectBuilder(table),
        delete: () => deleteBuilder(table),
      };
    },
    storage,
    __tables: tables,
    __calls: calls,
  };

  return client as unknown as SupabaseClient & { __tables: typeof tables; __calls: CallLog };
}

const OWNED_DOC = {
  id: "doc-A",
  file_path: "user-A/facture.pdf",
  dossier_id: "dossier-A",
  user_id: "user-A",
};

describe("deleteDocumentArtifacts — ownership", () => {
  it("propriétaire A supprime son propre document → succès complet", async () => {
    const supabase = makeStubSupabase({
      documents: [OWNED_DOC],
      extractedDocumentData: [{ id: "e1", document_id: "doc-A", dossier_id: "dossier-A" }],
    });

    const outcome = await deleteDocumentArtifacts(supabase, {
      documentId: "doc-A",
      dossierId: "dossier-A",
      userId: "user-A",
    });

    assert.equal(outcome, "deleted");
    assert.deepEqual(supabase.__tables.documents, []);
    assert.deepEqual(supabase.__tables.extracted_document_data, []);
  });

  it("document appartenant à B → refus (OwnershipError), aucune suppression", async () => {
    const supabase = makeStubSupabase({
      documents: [{ id: "doc-B", file_path: "user-B/x.pdf", dossier_id: "dossier-B", user_id: "user-B" }],
    });

    await assert.rejects(
      () => deleteDocumentArtifacts(supabase, { documentId: "doc-B", dossierId: "dossier-B", userId: "user-A" }),
      OwnershipError,
    );

    assert.equal(supabase.__tables.documents.length, 1, "le document de B doit rester intact");
    assert.equal(
      supabase.__calls.some((c) => c.op === "storage.exists" || c.op === "delete"),
      false,
      "aucune opération de suppression ne doit avoir été tentée hors ownership",
    );
  });

  it("aucune suppression possible hors ownership même avec le bon dossierId mais le mauvais userId", async () => {
    const supabase = makeStubSupabase({ documents: [OWNED_DOC] });

    await assert.rejects(
      () => deleteDocumentArtifacts(supabase, { documentId: "doc-A", dossierId: "dossier-A", userId: "user-intrus" }),
      OwnershipError,
    );
    assert.equal(supabase.__tables.documents.length, 1);
  });
});

describe("deleteDocumentArtifacts — ordre et échecs partiels", () => {
  it("échec Storage → aucune suppression DB, erreur remontée", async () => {
    const supabase = makeStubSupabase({
      documents: [OWNED_DOC],
      extractedDocumentData: [{ id: "e1", document_id: "doc-A", dossier_id: "dossier-A" }],
      storageRemoveError: "quota exceeded",
    });

    await assert.rejects(() =>
      deleteDocumentArtifacts(supabase, { documentId: "doc-A", dossierId: "dossier-A", userId: "user-A" }),
    );

    assert.equal(supabase.__tables.documents.length, 1, "documents non touché");
    assert.equal(supabase.__tables.extracted_document_data.length, 1, "extracted_document_data non touché");
    assert.equal(
      supabase.__calls.some((c) => c.table === "documents" && c.op === "delete"),
      false,
    );
    assert.equal(
      supabase.__calls.some((c) => c.table === "extracted_document_data" && c.op === "delete"),
      false,
    );
  });

  it("Storage OK, extracted_document_data échoue → documents non supprimé", async () => {
    const supabase = makeStubSupabase({
      documents: [OWNED_DOC],
      extractedDocumentData: [{ id: "e1", document_id: "doc-A", dossier_id: "dossier-A" }],
      extractionDeleteError: "db timeout",
    });

    await assert.rejects(() =>
      deleteDocumentArtifacts(supabase, { documentId: "doc-A", dossierId: "dossier-A", userId: "user-A" }),
    );

    assert.equal(supabase.__tables.documents.length, 1, "documents ne doit pas être supprimé");
    assert.equal(
      supabase.__calls.some((c) => c.table === "documents" && c.op === "delete"),
      false,
      "l'étape documents ne doit même pas être tentée",
    );
  });

  it("Storage + extraction OK, documents échoue → erreur, suppression jamais annoncée complète", async () => {
    const supabase = makeStubSupabase({
      documents: [OWNED_DOC],
      documentDeleteError: "row locked",
    });

    await assert.rejects(() =>
      deleteDocumentArtifacts(supabase, { documentId: "doc-A", dossierId: "dossier-A", userId: "user-A" }),
    );

    assert.equal(supabase.__tables.documents.length, 1, "la ligne documents doit rester (l'échec est réel)");
  });

  it("plusieurs lignes extracted_document_data pour un même document → toutes supprimées", async () => {
    const supabase = makeStubSupabase({
      documents: [OWNED_DOC],
      extractedDocumentData: [
        { id: "e1", document_id: "doc-A", dossier_id: "dossier-A" },
        { id: "e2", document_id: "doc-A", dossier_id: "dossier-A" },
        { id: "e3", document_id: "doc-A", dossier_id: "dossier-A" },
        { id: "e-other", document_id: "doc-other", dossier_id: "dossier-A" },
      ],
    });

    const outcome = await deleteDocumentArtifacts(supabase, {
      documentId: "doc-A",
      dossierId: "dossier-A",
      userId: "user-A",
    });

    assert.equal(outcome, "deleted");
    assert.deepEqual(
      supabase.__tables.extracted_document_data.map((r) => r.id),
      ["e-other"],
      "seules les lignes du document supprimé disparaissent, pas celles d'un autre document",
    );
  });

  it("ordre réel des appels : storage.exists/remove avant les deletes DB", async () => {
    const supabase = makeStubSupabase({
      documents: [OWNED_DOC],
      extractedDocumentData: [{ id: "e1", document_id: "doc-A", dossier_id: "dossier-A" }],
    });

    await deleteDocumentArtifacts(supabase, { documentId: "doc-A", dossierId: "dossier-A", userId: "user-A" });

    const ops = supabase.__calls.map((c) => `${c.op}:${c.table ?? ""}`);
    const storageIdx = ops.findIndex((o) => o.startsWith("storage."));
    const extractionDeleteIdx = ops.indexOf("delete:extracted_document_data");
    const documentDeleteIdx = ops.indexOf("delete:documents");

    assert.ok(storageIdx < extractionDeleteIdx, "Storage doit précéder extracted_document_data");
    assert.ok(extractionDeleteIdx < documentDeleteIdx, "extracted_document_data doit précéder documents");
  });
});

describe("deleteDocumentArtifacts — idempotence", () => {
  it("Storage déjà absent (.exists() → false) → pas d'appel remove(), séquence DB continue", async () => {
    const supabase = makeStubSupabase({
      documents: [OWNED_DOC],
      storage: "absent",
    });

    const outcome = await deleteDocumentArtifacts(supabase, {
      documentId: "doc-A",
      dossierId: "dossier-A",
      userId: "user-A",
    });

    assert.equal(outcome, "deleted");
    assert.equal(supabase.__calls.some((c) => c.op === "storage.remove"), false);
    assert.deepEqual(supabase.__tables.documents, []);
  });

  it("document déjà supprimé (aucune ligne documents) → succès idempotent, aucune autre opération tentée", async () => {
    const supabase = makeStubSupabase({ documents: [] });

    const outcome = await deleteDocumentArtifacts(supabase, {
      documentId: "doc-A",
      dossierId: "dossier-A",
      userId: "user-A",
    });

    assert.equal(outcome, "already_deleted");
    assert.equal(supabase.__calls.length, 1, "seul le SELECT initial doit avoir eu lieu");
    assert.equal(supabase.__calls[0].op, "select");
  });
});
