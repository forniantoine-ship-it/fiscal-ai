/**
 * F011-R2 — cycle de vie serveur de `documents.extraction_status` pour le pipeline F011 exécuté dans le navigateur.
 *
 * Le navigateur ne peut PAS écrire cette colonne (P0-S0 : aucune policy UPDATE client). La seule écriture passe par une
 * frontière serveur : identité → propriété du dossier → propriété du document → UPDATE exact (service role). Ces tests
 * fixent le contrat de cette frontière sans réseau : la base est une doublure en mémoire qui modélise les mêmes requêtes.
 *
 * Run: npx tsx --test src/lib/lmnp/dossier/document-extraction-status.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { UnauthorizedError } from "@/lib/supabase-server";
import { handleDocumentExtractionStatusRequest, type DocumentExtractionStatusDeps } from "./document-extraction-status";

type Row = Record<string, unknown>;

/** Modélise exactement les requêtes utilisées : select().eq()….maybeSingle() et update().eq()….select(). */
function makeStub(tables: Record<string, Row[]>, opts: { updateError?: boolean } = {}) {
  const writes: Array<{ table: string; patch: Row; filters: Row }> = [];
  const client = {
    from(table: string) {
      const filters: Row = {};
      let patch: Row | null = null;
      const matching = () => (tables[table] ?? []).filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
      const builder = {
        select() { return builder; },
        update(next: Row) { patch = next; return builder; },
        eq(column: string, value: unknown) { filters[column] = value; return builder; },
        async maybeSingle() { return { data: matching()[0] ?? null, error: null }; },
        then(resolve: (value: { data: Row[] | null; error: { message: string } | null }) => void) {
          if (patch) {
            if (opts.updateError) return resolve({ data: null, error: { message: "boom" } });
            const rows = matching();
            writes.push({ table, patch, filters: { ...filters } });
            for (const row of rows) Object.assign(row, patch);
            return resolve({ data: rows.map(row => ({ id: row.id })), error: null });
          }
          return resolve({ data: matching(), error: null });
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, writes, tables };
}

const OWNER = "user-owner";
const DOSSIER = "dossier-1";

function world() {
  return makeStub({
    lmnp_dossiers: [{ id: DOSSIER, user_id: OWNER }, { id: "dossier-x", user_id: "user-other" }],
    documents: [
      { id: "doc-1", dossier_id: DOSSIER, user_id: OWNER, file_name: "tableau.pdf", file_path: "p/1", fiscal_year: 2025, extraction_status: "pending" },
      { id: "doc-2", dossier_id: DOSSIER, user_id: OWNER, file_name: "autre.pdf", file_path: "p/2", fiscal_year: 2025, extraction_status: "pending" },
      { id: "doc-foreign", dossier_id: "dossier-x", user_id: "user-other", file_name: "etranger.pdf", file_path: "p/3", fiscal_year: 2025, extraction_status: "pending" },
    ],
  });
}

function depsFor(stub: ReturnType<typeof makeStub>, token = "good-token"): DocumentExtractionStatusDeps {
  return {
    authenticate: async authToken => {
      if (authToken !== token) throw new UnauthorizedError();
      return { userId: OWNER };
    },
    supabase: () => stub.client,
  };
}

const valid = { documentId: "doc-1", dossierId: DOSSIER, status: "completed", authToken: "good-token" };
const statusOf = (stub: ReturnType<typeof makeStub>, id: string) => stub.tables.documents!.find(row => row.id === id)!.extraction_status;

describe("F011-R2 — route serveur extraction-status : autorisation", () => {
  it("propriétaire authentifié + son document → 200, statut mis à jour, UPDATE borné à ce seul document", async () => {
    const stub = world();
    const res = await handleDocumentExtractionStatusRequest(valid, depsFor(stub));
    assert.equal(res.status, 200);
    assert.equal(statusOf(stub, "doc-1"), "completed");
    assert.equal(stub.writes.length, 1);
    assert.deepEqual(Object.keys(stub.writes[0]!.patch), ["extraction_status"], "aucun autre champ n'est écrit");
    assert.equal(stub.writes[0]!.filters.id, "doc-1");
    assert.equal(stub.writes[0]!.filters.user_id, OWNER);
    assert.equal(stub.writes[0]!.filters.dossier_id, DOSSIER);
  });

  it("TEST — un autre document du même dossier n'est jamais modifié", async () => {
    const stub = world();
    await handleDocumentExtractionStatusRequest(valid, depsFor(stub));
    assert.equal(statusOf(stub, "doc-2"), "pending");
    assert.equal(statusOf(stub, "doc-foreign"), "pending");
  });

  it("TEST E — document d'un autre utilisateur → 403, aucune écriture", async () => {
    const stub = world();
    const res = await handleDocumentExtractionStatusRequest({ ...valid, documentId: "doc-foreign" }, depsFor(stub));
    assert.equal(res.status, 403);
    assert.equal(stub.writes.length, 0);
    assert.equal(statusOf(stub, "doc-foreign"), "pending");
  });

  it("document de l'utilisateur mais dossier fourni appartenant à un autre → 403, aucune écriture", async () => {
    const stub = world();
    const res = await handleDocumentExtractionStatusRequest({ ...valid, dossierId: "dossier-x" }, depsFor(stub));
    assert.equal(res.status, 403);
    assert.equal(stub.writes.length, 0);
  });

  it("document inconnu → fail closed (403), aucune écriture", async () => {
    const stub = world();
    const res = await handleDocumentExtractionStatusRequest({ ...valid, documentId: "nope" }, depsFor(stub));
    assert.equal(res.status, 403);
    assert.equal(stub.writes.length, 0);
  });

  it("non authentifié (jeton absent ou invalide) → 401, aucune lecture ni écriture de base", async () => {
    for (const authToken of [undefined, "bad-token"]) {
      const stub = world();
      const res = await handleDocumentExtractionStatusRequest({ ...valid, authToken }, depsFor(stub));
      assert.equal(res.status, 401);
      assert.equal(stub.writes.length, 0);
      assert.equal(statusOf(stub, "doc-1"), "pending");
    }
  });

  it("l'identité vient du jeton, jamais d'un userId fourni par le client (champ inconnu refusé)", async () => {
    const stub = world();
    const res = await handleDocumentExtractionStatusRequest({ ...valid, userId: OWNER }, depsFor(stub));
    assert.equal(res.status, 400);
    assert.equal(stub.writes.length, 0);
  });
});

describe("F011-R2 — route serveur extraction-status : contrat strict", () => {
  it("TEST G — statut invalide ou non autorisé (pending, autre, absent) → 400, aucune écriture", async () => {
    for (const status of ["pending", "uploaded", "analyzed", "DROP", "", undefined, 3]) {
      const stub = world();
      const res = await handleDocumentExtractionStatusRequest({ ...valid, status }, depsFor(stub));
      assert.equal(res.status, 400, `status=${String(status)}`);
      assert.equal(stub.writes.length, 0);
      assert.equal(statusOf(stub, "doc-1"), "pending");
    }
  });

  it("statuts acceptés : processing, completed, failed", async () => {
    for (const status of ["processing", "completed", "failed"]) {
      const stub = world();
      const res = await handleDocumentExtractionStatusRequest({ ...valid, status }, depsFor(stub));
      assert.equal(res.status, 200, status);
      assert.equal(statusOf(stub, "doc-1"), status);
    }
  });

  it("TEST F — un payload qui tente de modifier autre chose que extraction_status est refusé, rien n'est écrit", async () => {
    for (const extra of [{ file_path: "evil" }, { file_name: "x.pdf" }, { fiscal_year: 2020 }, { dossier_id: "dossier-x" }, { user_id: "user-other" }, { extraction_status: "completed" }, { patch: { file_path: "evil" } }]) {
      const stub = world();
      const res = await handleDocumentExtractionStatusRequest({ ...valid, ...extra }, depsFor(stub));
      assert.equal(res.status, 400, JSON.stringify(extra));
      assert.equal(stub.writes.length, 0);
    }
    const stub = world();
    await handleDocumentExtractionStatusRequest(valid, depsFor(stub));
    const doc = stub.tables.documents!.find(row => row.id === "doc-1")!;
    assert.equal(doc.file_path, "p/1");
    assert.equal(doc.file_name, "tableau.pdf");
    assert.equal(doc.fiscal_year, 2025);
    assert.equal(doc.dossier_id, DOSSIER);
  });

  it("corps absent ou mal formé → 400", async () => {
    for (const body of [null, undefined, "x", 3, [], { documentId: "", dossierId: DOSSIER, status: "completed" }, { documentId: "doc-1", status: "completed", authToken: "good-token" }]) {
      const stub = world();
      const res = await handleDocumentExtractionStatusRequest(body, depsFor(stub));
      assert.equal(res.status, 400);
      assert.equal(stub.writes.length, 0);
    }
  });

  it("échec de l'UPDATE côté base → erreur serveur explicite (500), sans fuite du message interne", async () => {
    const stub = makeStub({
      lmnp_dossiers: [{ id: DOSSIER, user_id: OWNER }],
      documents: [{ id: "doc-1", dossier_id: DOSSIER, user_id: OWNER, extraction_status: "pending" }],
    }, { updateError: true });
    const res = await handleDocumentExtractionStatusRequest(valid, depsFor(stub));
    assert.equal(res.status, 500);
    assert.equal(JSON.stringify(res.body).includes("boom"), false);
  });
});
