/**
 * F011-R2 — un document `completed` est projeté « Analyse terminée » par le read model existant : la V3 n'affiche plus
 * « Lecture en cours… » pour un document dont l'analyse est terminée. Aucune modification V3 n'est nécessaire.
 *
 * Run: npx tsx --test src/lab/v2-dossier/document-extraction-completed-projection.test.tsx
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { buildFinancingView } from "@/lab/v3-dossier/financing-view-model";
import type { V3FinancingDetail } from "./financing-detail-read-model";
import { buildV3DocumentsReadModel } from "./document-read-model";

const workspace = {
  fiscalYear: { id: "fy", dossierId: "d", year: 2025, status: "draft", regime: "reel", propertyIds: ["p"], createdAt: "2025-01-01", updatedAt: "2025-01-01" },
  properties: [{ id: "p", label: "", address: "", city: "", postalCode: "" }],
  documents: [], extractions: [], validationItems: [], ledgerEntries: [],
} as unknown as PersistedWorkspace;

const rowWith = (extraction_status: string) => ({
  id: "doc-1", user_id: "u", dossier_id: "d", fiscal_year: 2025, property_id: "p", file_name: "Tableau d'amortissement.pdf",
  file_path: "x", extraction_status, created_at: "2025-06-01T00:00:00Z", document_role: "annual_evidence",
});

const documentsFor = (status: string) => buildV3DocumentsReadModel({
  read: { state: "known", rows: [rowWith(status)] } as never, workspace, fiscalYear: 2025, legacyDocumentYears: [],
});

function pieceFor(status: string) {
  const model = documentsFor(status);
  assert.equal(model.state, "known");
  const detail = {
    state: "known", stepStatus: "incomplete", year: 2025, loans: [], schedule: { state: "unavailable", reason: "absent" },
    documents: model.documents.map(document => ({ id: document.id, label: document.fileName, status: document.processingStatus })),
  } as V3FinancingDetail;
  return { processing: model.documents[0]!.processingStatus, piece: buildFinancingView(detail, null).pieces[0]! };
}

async function markup(piece: { name: string; state: "done" | "reading" | "unknown" | "failed" }) {
  const extensions = (require as unknown as { extensions: Record<string, (module: { exports: unknown }) => void> }).extensions;
  extensions[".css"] = module => { module.exports = new Proxy({}, { get: (_t, key) => (typeof key === "string" && key !== "__esModule" ? key : undefined) }); };
  const { PiecesList } = await import("@/lab/v3-dossier/restitution");
  return renderToStaticMarkup(<PiecesList pieces={[piece]} />);
}

test("TEST H — completed → analysé → « Analyse terminée », jamais « Lecture en cours… »", async () => {
  const { processing, piece } = pieceFor("completed");
  assert.equal(processing, "analyzed");
  assert.equal(piece.state, "done");
  const html = await markup(piece);
  assert.match(html, /Analyse terminée/);
  assert.doesNotMatch(html, /Lecture en cours/);
});

test("failed → « Analyse à reprendre » (état honnête, pas « en cours »)", async () => {
  const { piece } = pieceFor("failed");
  assert.equal(piece.state, "failed");
  const html = await markup(piece);
  assert.match(html, /Analyse à reprendre/);
  assert.doesNotMatch(html, /Lecture en cours/);
});

test("processing → « Lecture en cours… » (analyse réellement en cours) ; pending garde l'état d'attente existant", async () => {
  assert.equal(pieceFor("processing").piece.state, "reading");
  assert.equal(pieceFor("pending").piece.state, "reading");
});
