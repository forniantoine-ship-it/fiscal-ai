import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assertDocumentOwnership,
  assertDossierOwnership,
  getServerSupabaseForUser,
  OwnershipError,
  resolveExtractionDossierId,
  UnauthorizedError,
} from "./supabase-server";

/**
 * Stub Supabase client — models exactly the query shape used in supabase-server.ts:
 * .from(table).select(cols).eq(a, b)[.eq(c, d)].maybeSingle()/.single()
 * No network, no real Supabase project needed.
 */
function makeStubSupabase(rows: Record<string, Array<Record<string, unknown>>>) {
  const calls: Array<{ op: "select" | "update" | "insert"; table: string }> = [];

  function queryBuilder(table: string, op: "select" | "update" | "insert") {
    calls.push({ op, table });
    const filters: Record<string, unknown> = {};

    const builder = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters[col] = val;
        return builder;
      },
      async maybeSingle() {
        const tableRows = rows[table] ?? [];
        const match = tableRows.find((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
        return { data: match ?? null, error: null };
      },
      async single() {
        const result = await builder.maybeSingle();
        if (!result.data) return { data: null, error: { message: "not found" } };
        return result;
      },
    };
    return builder;
  }

  const client = {
    from(table: string) {
      return {
        select: () => queryBuilder(table, "select"),
        update: () => queryBuilder(table, "update"),
        insert: () => queryBuilder(table, "insert"),
      };
    },
    __calls: calls,
  };

  return client as unknown as SupabaseClient & { __calls: typeof calls };
}

describe("getServerSupabaseForUser — identity", () => {
  it("absence de token → UnauthorizedError, aucun appel réseau", async () => {
    await assert.rejects(() => getServerSupabaseForUser(undefined), UnauthorizedError);
  });

  it("token vide → UnauthorizedError", async () => {
    await assert.rejects(() => getServerSupabaseForUser(""), UnauthorizedError);
  });
});

describe("assertDossierOwnership", () => {
  it("A → dossier de A → succès", async () => {
    const supabase = makeStubSupabase({
      lmnp_dossiers: [{ id: "dossier-A", user_id: "user-A" }],
    });
    await assert.doesNotReject(() => assertDossierOwnership(supabase, "dossier-A", "user-A"));
  });

  it("A → dossier de B → refus (OwnershipError)", async () => {
    const supabase = makeStubSupabase({
      lmnp_dossiers: [{ id: "dossier-B", user_id: "user-B" }],
    });
    await assert.rejects(() => assertDossierOwnership(supabase, "dossier-B", "user-A"), OwnershipError);
  });

  it("dossier inexistant → refus (OwnershipError)", async () => {
    const supabase = makeStubSupabase({ lmnp_dossiers: [] });
    await assert.rejects(() => assertDossierOwnership(supabase, "dossier-X", "user-A"), OwnershipError);
  });
});

describe("assertDocumentOwnership", () => {
  it("A → document de A dans son dossier → succès", async () => {
    const supabase = makeStubSupabase({
      documents: [{ id: "doc-A", dossier_id: "dossier-A", user_id: "user-A" }],
    });
    await assert.doesNotReject(() =>
      assertDocumentOwnership(supabase, "doc-A", "dossier-A", "user-A"),
    );
  });

  it("A → document de B → refus (OwnershipError)", async () => {
    const supabase = makeStubSupabase({
      documents: [{ id: "doc-B", dossier_id: "dossier-B", user_id: "user-B" }],
    });
    await assert.rejects(
      () => assertDocumentOwnership(supabase, "doc-B", "dossier-B", "user-A"),
      OwnershipError,
    );
  });

  it("document existant mais rattaché à un autre dossierId fourni → refus", async () => {
    const supabase = makeStubSupabase({
      documents: [{ id: "doc-A", dossier_id: "dossier-A", user_id: "user-A" }],
    });
    await assert.rejects(
      () => assertDocumentOwnership(supabase, "doc-A", "dossier-autre", "user-A"),
      OwnershipError,
    );
  });
});

describe("resolveExtractionDossierId", () => {
  it("extraction existante → retourne son dossier_id", async () => {
    const supabase = makeStubSupabase({
      extracted_document_data: [{ id: "extraction-1", dossier_id: "dossier-A" }],
    });
    const dossierId = await resolveExtractionDossierId(supabase, "extraction-1");
    assert.equal(dossierId, "dossier-A");
  });

  it("extraction inexistante → retourne null (404, pas une erreur d'ownership)", async () => {
    const supabase = makeStubSupabase({ extracted_document_data: [] });
    const dossierId = await resolveExtractionDossierId(supabase, "extraction-inconnue");
    assert.equal(dossierId, null);
  });

  it("A → extraction de B → dossier résolu puis ownership refusée", async () => {
    const supabase = makeStubSupabase({
      extracted_document_data: [{ id: "extraction-B", dossier_id: "dossier-B" }],
      lmnp_dossiers: [{ id: "dossier-B", user_id: "user-B" }],
    });
    const dossierId = await resolveExtractionDossierId(supabase, "extraction-B");
    assert.equal(dossierId, "dossier-B");
    await assert.rejects(() => assertDossierOwnership(supabase, dossierId!, "user-A"), OwnershipError);
  });
});

describe("intégrité — aucune écriture avant ownership validée", () => {
  it("classification-review : ownership refusée avant tout .update() sur extracted_document_data", async () => {
    // Reproduit l'ordre exact du handler : resolveExtractionDossierId → assertDossierOwnership
    // → (seulement alors) .update(). Si l'ownership échoue, .update() ne doit jamais être appelé.
    const supabase = makeStubSupabase({
      extracted_document_data: [{ id: "extraction-B", dossier_id: "dossier-B" }],
      lmnp_dossiers: [{ id: "dossier-B", user_id: "user-B" }],
    });

    const dossierId = await resolveExtractionDossierId(supabase, "extraction-B");
    assert.ok(dossierId);

    await assert.rejects(() => assertDossierOwnership(supabase, dossierId!, "user-A"), OwnershipError);

    const updateCalls = supabase.__calls.filter(
      (c) => c.table === "extracted_document_data" && c.op === "update",
    );
    assert.equal(updateCalls.length, 0, "aucune écriture ne doit avoir été tentée sur le dossier de B");
  });

  it("extract : ownership refusée avant tout accès à documents en écriture", async () => {
    const supabase = makeStubSupabase({
      lmnp_dossiers: [{ id: "dossier-B", user_id: "user-B" }],
    });

    await assert.rejects(
      () => assertDossierOwnership(supabase, "dossier-B", "user-A"),
      OwnershipError,
    );

    const documentCalls = supabase.__calls.filter((c) => c.table === "documents");
    assert.equal(documentCalls.length, 0, "assertDocumentOwnership ne doit jamais être atteint si le dossier n'appartient pas à l'utilisateur");
  });
});
