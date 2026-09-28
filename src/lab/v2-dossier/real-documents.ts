import type { SupabaseDocumentRow } from "@/lib/lmnp/dossier/supabase-dossier";
import { readRealDocumentRows, type DocumentRowsRead } from "./document-read";
import { buildV3DocumentsReadModel, type V3DocumentsReadModel } from "./document-read-model";
import { loadRealWorkspace, type RealWorkspaceLoad } from "./real-workspace";

export type RealDocumentLoad =
  | Exclude<RealWorkspaceLoad, { status: "ready" }>
  | (Extract<RealWorkspaceLoad, { status: "ready" }> & {
      documentRows: SupabaseDocumentRow[];
      documents: V3DocumentsReadModel;
    });

/** One R8 dossier/year resolution, followed by a strictly scoped document read. */
export async function loadRealDocuments(
  userId: string | null,
  services?: {
    loadWorkspace: typeof loadRealWorkspace;
    readRows: typeof readRealDocumentRows;
  },
  requestedDossierId?: string,
): Promise<RealDocumentLoad> {
  const loadWorkspace = services?.loadWorkspace ?? loadRealWorkspace;
  const readRows = services?.readRows ?? readRealDocumentRows;
  const resolved = await loadWorkspace(userId, undefined, requestedDossierId);
  if (resolved.status !== "ready") return resolved;
  if (requestedDossierId && resolved.dossierId !== requestedDossierId) return { status: "error" };
  const read: DocumentRowsRead = await readRows({
    userId: resolved.userId,
    dossierId: resolved.dossierId,
    fiscalYear: resolved.fiscalYear,
  });
  return {
    ...resolved,
    documentRows: read.rows,
    documents: buildV3DocumentsReadModel({
      read,
      workspace: resolved.workspace,
      fiscalYear: resolved.fiscalYear,
      legacyDocumentYears: resolved.legacyDocumentYears,
    }),
  };
}

/** Never accept a Storage path from the UI. Re-find it in the scoped server result. */
export function resolveRealDocumentForOpen(
  loaded: Extract<RealDocumentLoad, { status: "ready" }>,
  documentId: string,
): SupabaseDocumentRow | null {
  if (loaded.documents.state !== "known" ||
      !loaded.documents.documents.some(document => document.id === documentId)) return null;
  const row = loaded.documentRows.find(document => document.id === documentId);
  if (!row || row.user_id !== loaded.userId || row.dossier_id !== loaded.dossierId ||
      (row.fiscal_year !== null && row.fiscal_year !== loaded.fiscalYear) ||
      !row.file_path) return null;
  return row;
}
