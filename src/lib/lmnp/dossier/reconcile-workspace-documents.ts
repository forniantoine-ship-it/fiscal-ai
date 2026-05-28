import type {
  DocumentCategory,
  DocumentStatus,
  DocumentType,
  LmnpDocument,
} from "@/lib/lmnp/types";

import type { SupabaseDocumentRow } from "./supabase-dossier";

const CONTINUITY_PATTERN =
  /liasse|amortissement|tableau|export|comptable|fiscal|2033|2031|bilan/i;
const TRAVAUX_PATTERN = /travaux|renovation|r[eé]nov|devis|facture|chantier|plomberie|peinture/i;
const MOBILIER_PATTERN = /mobilier|meuble|cuisine|canap[eé]|lit|ikea|electro|ameublement|equipement/i;

function inferMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (/\.jpe?g$/.test(lower)) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function inferDocumentCategory(fileName: string): DocumentCategory {
  if (CONTINUITY_PATTERN.test(fileName)) return "amortissement";
  if (TRAVAUX_PATTERN.test(fileName)) return "charges";
  if (MOBILIER_PATTERN.test(fileName)) return "amortissement";
  if (/loyer|recette|airbnb|booking|bail/.test(fileName)) return "revenus";
  if (/pr[eê]t|emprunt|credit|banque/.test(fileName)) return "emprunt";
  return "autre";
}

function inferDocumentType(fileName: string, category: DocumentCategory): DocumentType {
  if (category === "charges") return "works_invoice";
  if (category === "amortissement" && MOBILIER_PATTERN.test(fileName)) return "furniture_invoice";
  return "unknown";
}

function mapSupabaseStatus(extractionStatus: string): DocumentStatus {
  const normalized = extractionStatus.toLowerCase();
  if (normalized === "processing") return "processing";
  if (["analyzed", "completed", "done", "success"].includes(normalized)) return "analyzed";
  if (normalized === "failed") return "failed";
  return "uploaded";
}

function isSameRemoteDocument(local: LmnpDocument, remote: SupabaseDocumentRow): boolean {
  if (local.id === remote.id) return true;
  if (local.storagePath && local.storagePath === remote.file_path) return true;
  return local.fileName === remote.file_name;
}

export function reconcileWorkspaceDocuments(params: {
  localDocuments: LmnpDocument[];
  supabaseDocuments: SupabaseDocumentRow[];
  fiscalYearId: string;
  propertyId?: string;
  localBlobDocumentIds: Set<string>;
}): {
  documents: LmnpDocument[];
  restored: number;
  metadataOnly: number;
} {
  const { localDocuments, supabaseDocuments, fiscalYearId, propertyId, localBlobDocumentIds } =
    params;

  if (supabaseDocuments.length === 0) {
    return { documents: localDocuments, restored: 0, metadataOnly: 0 };
  }

  const keptLocal = localDocuments.filter((local) => {
    return !supabaseDocuments.some(
      (remote) => isSameRemoteDocument(local, remote) && local.id !== remote.id,
    );
  });

  const mergedById = new Map(keptLocal.map((document) => [document.id, document]));
  let restored = 0;
  let metadataOnly = 0;

  for (const row of supabaseDocuments) {
    const existing = mergedById.get(row.id);
    if (existing) {
      mergedById.set(row.id, {
        ...existing,
        storagePath: existing.storagePath ?? row.file_path,
        fileName: row.file_name,
        status: mapSupabaseStatus(row.extraction_status),
        uploadedAt: row.created_at,
      });
      continue;
    }

    const duplicate = [...mergedById.values()].some((document) =>
      isSameRemoteDocument(document, row),
    );
    if (duplicate) continue;

    const hasLocalBlob = localBlobDocumentIds.has(row.id);
    const category = inferDocumentCategory(row.file_name);
    const remoteRestored = !hasLocalBlob;
    const document: LmnpDocument = {
      id: row.id,
      fiscalYearId,
      propertyId,
      fileName: row.file_name,
      mimeType: inferMimeType(row.file_name),
      sizeBytes: 0,
      category,
      documentType: inferDocumentType(row.file_name, category),
      status: mapSupabaseStatus(row.extraction_status),
      uploadedAt: row.created_at,
      storagePath: row.file_path,
      remoteRestored,
    };

    mergedById.set(row.id, document);
    restored += 1;

    if (remoteRestored) {
      metadataOnly += 1;
      console.log("[documents] restored metadata-only", {
        documentId: row.id,
        fileName: row.file_name,
      });
    }
  }

  const documents = [...mergedById.values()].sort((a, b) =>
    b.uploadedAt.localeCompare(a.uploadedAt),
  );

  if (restored > 0) {
    console.log("[documents] restored into workspace", {
      restored,
      metadataOnly,
      total: documents.length,
    });
  }

  return { documents, restored, metadataOnly };
}
