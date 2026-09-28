import type { SupabaseDocumentRow } from "@/lib/lmnp/dossier/supabase-dossier";
import { resolveEffectiveFiscalYear } from "@/lib/lmnp/dossier/document-fiscal-origin";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { DocumentType } from "@/lib/lmnp/types";
import { DOCUMENT_TYPE_LABELS } from "@/lib/lmnp/validation/grouping";
import type { DocumentRowsRead } from "./document-read";

export type V3DocumentProcessingStatus = "uploaded" | "processing" | "analyzed" | "failed" | "unknown";

export type V3Document = {
  id: string;
  label: string;
  fileName: string;
  processingStatus: V3DocumentProcessingStatus;
  uploadedAt?: string;
  fiscalYear?: number;
  propertyId?: string;
  documentType?: DocumentType;
};

export type V3DocumentsReadModel =
  | { state: "unknown"; documents: [] }
  | { state: "known"; documents: V3Document[] };

function processingStatus(status: string): V3DocumentProcessingStatus {
  switch (status.toLowerCase()) {
    case "pending":
    case "uploaded": return "uploaded";
    case "processing": return "processing";
    case "completed":
    case "analyzed":
    case "done":
    case "success": return "analyzed";
    case "failed": return "failed";
    default: return "unknown";
  }
}

export function buildV3DocumentsReadModel(input: {
  read: DocumentRowsRead;
  workspace: PersistedWorkspace;
  fiscalYear: number;
  legacyDocumentYears: ReadonlyArray<{ fiscalYear: number; documentIds: ReadonlyArray<string> }>;
}): V3DocumentsReadModel {
  if (input.read.state !== "known") return { state: "unknown", documents: [] };
  const localById = new Map(input.workspace.documents.map(doc => [doc.id, doc]));
  const documents = input.read.rows.flatMap((row: SupabaseDocumentRow) => {
    const fiscalYear = resolveEffectiveFiscalYear({
      serverFiscalYear: row.fiscal_year,
      documentId: row.id,
      snapshots: input.legacyDocumentYears,
    });
    // An explicit or uniquely proven foreign year is never shown in this exercise.
    if (fiscalYear !== undefined && fiscalYear !== input.fiscalYear) return [];
    const local = localById.get(row.id);
    const safeLocalType = local && fiscalYear === input.fiscalYear &&
      local.fiscalYearId === input.workspace.fiscalYear.id &&
      (local.fiscalYear === undefined || local.fiscalYear === fiscalYear) &&
      (row.property_id === null ? local.propertyId === undefined :
        local.propertyId === undefined || local.propertyId === row.property_id) &&
      local.documentType !== "unknown" ? local.documentType : undefined;
    const fileName = row.file_name?.trim() || "Document";
    return [{
      id: row.id,
      label: safeLocalType ? DOCUMENT_TYPE_LABELS[safeLocalType] : fileName,
      fileName,
      processingStatus: processingStatus(row.extraction_status),
      uploadedAt: row.created_at || undefined,
      fiscalYear,
      propertyId: row.property_id ?? undefined,
      documentType: safeLocalType,
    }];
  });
  return { state: "known", documents };
}
