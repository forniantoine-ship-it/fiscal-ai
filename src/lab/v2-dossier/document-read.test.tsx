import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseDocumentRow } from "@/lib/lmnp/dossier/supabase-dossier";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { LmnpDocument } from "@/lib/lmnp/types";
import { readRealDocumentRows } from "./document-read";
import { buildV3DocumentsReadModel } from "./document-read-model";
import { RealDocumentsList } from "./RealDocumentsList";
import { loadRealDocuments, resolveRealDocumentForOpen } from "./real-documents";
import type { RealWorkspaceLoad } from "./real-workspace";

const scope = { userId: "user-1", dossierId: "dossier-1", fiscalYear: 2025 };
const row = (patch: Partial<SupabaseDocumentRow> = {}): SupabaseDocumentRow => ({
  id: "document-1", user_id: scope.userId, dossier_id: scope.dossierId,
  file_name: "piece.pdf", file_path: "user-1/piece.pdf", extraction_status: "pending",
  created_at: "2025-04-12T10:00:00Z", fiscal_year: 2025,
  document_role: "annual_evidence", property_id: "home-1", ...patch,
});

const local = (patch: Partial<LmnpDocument> = {}): LmnpDocument => ({
  id: "document-1", fiscalYearId: "fy-2025", fiscalYear: 2025,
  propertyId: "home-1", fileName: "piece.pdf", mimeType: "application/pdf", sizeBytes: 123,
  category: "charges", documentType: "property_tax", status: "analyzed",
  uploadedAt: "2025-04-12T10:00:00Z", ...patch,
});

function workspace(documents: LmnpDocument[] = []): PersistedWorkspace {
  return {
    fiscalYear: { id: "fy-2025", dossierId: scope.dossierId, year: 2025, regime: "reel", status: "draft", propertyIds: ["home-1", "home-2"], createdAt: "2025-01-01", updatedAt: "2025-01-01" },
    properties: [], documents, extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
  };
}

const known = (rows: SupabaseDocumentRow[], ws = workspace(), legacyDocumentYears: { fiscalYear: number; documentIds: string[] }[] = []) =>
  buildV3DocumentsReadModel({ read: { state: "known", rows }, workspace: ws, fiscalYear: 2025, legacyDocumentYears });

test("A/B/N — lecture vide connue, erreur inconnue et message distinct au rendu", async () => {
  const services = {
    authenticatedUserId: async () => scope.userId,
    listRows: async () => ({ rows: [] as SupabaseDocumentRow[], error: false }),
  };
  const empty = await readRealDocumentRows(scope, services);
  assert.deepEqual(empty, { state: "known", rows: [] });
  const failed = await readRealDocumentRows(scope, { ...services, listRows: async () => ({ rows: null, error: true }) });
  assert.deepEqual(failed, { state: "unknown", rows: [] });
  const unknown = buildV3DocumentsReadModel({ read: failed, workspace: workspace(), fiscalYear: 2025, legacyDocumentYears: [] });
  assert.match(renderToStaticMarkup(<RealDocumentsList model={known([])} classes={{}} />), /Aucun document enregistré/);
  const errorHtml = renderToStaticMarkup(<RealDocumentsList model={unknown} classes={{}} />);
  assert.match(errorHtml, /Nous ne pouvons pas charger/);
  assert.doesNotMatch(errorHtml, /Aucun document enregistré/);
});

test("C/D/E/F/G — une ligne serveur par carte, enrichissement uniquement par ID exact", () => {
  const one = known([row()], workspace([local()]));
  assert.equal(one.documents.length, 1);
  assert.equal(one.documents[0].label, "Taxe foncière");
  const sameName = row({ id: "document-2", file_path: "user-1/another.pdf" });
  const repeatedType = known([row(), sameName], workspace([local(), local({ id: "document-2" })]));
  assert.deepEqual(repeatedType.documents.map(item => item.label), ["Taxe foncière", "Taxe foncière"]);
  const two = known([row(), sameName], workspace([local(), local({ id: "local-only", fileName: "piece.pdf" })]));
  assert.equal(two.documents.length, 2);
  assert.deepEqual(two.documents.map(item => item.id), ["document-1", "document-2"]);
  assert.equal(two.documents[1].label, "piece.pdf");
  assert.equal(two.documents[1].documentType, undefined);
  assert.equal(known([], workspace([local()])).documents.length, 0);
  assert.equal(known([row()], workspace([local({ fiscalYear: 2026 })])).documents[0].label, "piece.pdf");
  assert.equal(known([row({ property_id: "home-2" })], workspace([local({ propertyId: "home-1" })])).documents[0].label, "piece.pdf");
});

test("H/I/J/K/L — exercice explicite, legacy prouvé ou ambigu, bien explicite ou inconnu", () => {
  assert.equal(known([row({ property_id: "home-2" })]).documents[0].propertyId, "home-2");
  const withoutProperty = known([row({ property_id: null })], workspace([local()]));
  assert.equal(withoutProperty.documents[0].propertyId, undefined);
  assert.equal(withoutProperty.documents[0].label, "piece.pdf");
  const legacy = row({ fiscal_year: null });
  assert.equal(known([legacy], workspace(), [{ fiscalYear: 2025, documentIds: [legacy.id] }]).documents[0].fiscalYear, 2025);
  assert.equal(known([legacy], workspace(), [{ fiscalYear: 2025, documentIds: [legacy.id] }, { fiscalYear: 2026, documentIds: [legacy.id] }]).documents[0].fiscalYear, undefined);
  assert.equal(known([legacy], workspace(), [{ fiscalYear: 2026, documentIds: [legacy.id] }]).documents.length, 0);
  assert.equal(known([row({ fiscal_year: 2026 })]).documents.length, 0);
});

test("M — quatre états de traitement sans prétention de validation ni disponibilité Storage", () => {
  const model = known([
    row({ id: "a", extraction_status: "pending" }),
    row({ id: "b", extraction_status: "processing" }),
    row({ id: "c", extraction_status: "completed" }),
    row({ id: "d", extraction_status: "failed" }),
  ]);
  assert.deepEqual(model.documents.map(item => item.processingStatus), ["uploaded", "processing", "analyzed", "failed"]);
  const html = renderToStaticMarkup(<RealDocumentsList model={model} classes={{}} />);
  for (const label of ["Reçu", "Analyse en cours", "Analysé", "Analyse à reprendre"]) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /validé|disponible dans le stockage|manquant/i);
});

test("O/P/Q/R/S/T/U — rendu pur : aucune ouverture, lecture, écriture ou calcul déclenché", () => {
  let opens = 0;
  const model = known([row()]);
  const html = renderToStaticMarkup(<RealDocumentsList model={model} classes={{}} onOpen={() => { opens += 1; }} />);
  assert.match(html, /Ouvrir/);
  assert.equal(opens, 0);
  assert.doesNotMatch(html, /Ajouter|manquant|requis|F006|F007|RFS/i);
});

test("V/W — lecture bornée à l'identité R8, autre dossier et autre compte exclus", async () => {
  let queriedScope: typeof scope | undefined;
  const read = await readRealDocumentRows(scope, {
    authenticatedUserId: async () => scope.userId,
    listRows: async input => {
      queriedScope = input;
      return { rows: [row(), row({ id: "foreign-dossier", dossier_id: "dossier-2" }), row({ id: "foreign-user", user_id: "user-2" }), row({ id: "foreign-year", fiscal_year: 2026 })], error: false };
    },
  });
  assert.deepEqual(queriedScope, scope);
  assert.deepEqual(read.rows.map(item => item.id), ["document-1"]);
  assert.deepEqual(await readRealDocumentRows(scope, { authenticatedUserId: async () => "user-2", listRows: async () => { throw new Error("must not query"); } }), { state: "unknown", rows: [] });

  const ready: Extract<RealWorkspaceLoad, { status: "ready" }> = {
    status: "ready", workspace: workspace(), dossierId: scope.dossierId, userId: scope.userId,
    fiscalYear: scope.fiscalYear, source: "server", serverScopeVerified: true, legacyDocumentYears: [],
  };
  const result = await loadRealDocuments(scope.userId, {
    loadWorkspace: async () => ready,
    readRows: async input => { assert.deepEqual(input, scope); return { state: "known", rows: [row()] }; },
  });
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.documents.documents.length, 1);
    assert.equal(resolveRealDocumentForOpen(result, "document-1")?.file_path, "user-1/piece.pdf");
    assert.equal(resolveRealDocumentForOpen(result, "foreign-dossier"), null);
    assert.equal(resolveRealDocumentForOpen({ ...result, documentRows: [row({ dossier_id: "dossier-2" })] }, "document-1"), null);
    assert.equal(resolveRealDocumentForOpen({ ...result, documentRows: [row({ file_path: "" })] }, "document-1"), null);
  }
});

test("R8.2 — aucun accès documents si la sélection d'exercice est ambiguë", async () => {
  let reads = 0;
  const result = await loadRealDocuments(scope.userId, {
    loadWorkspace: async () => ({ status: "year_unavailable", reason: "ambiguous" }),
    readRows: async () => { reads += 1; return { state: "known", rows: [] }; },
  });
  assert.deepEqual(result, { status: "year_unavailable", reason: "ambiguous" });
  assert.equal(reads, 0);
});
