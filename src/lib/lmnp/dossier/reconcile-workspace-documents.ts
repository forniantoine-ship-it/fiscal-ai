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
// Matches all credit-related document filenames — case-insensitive (captures uppercase like
// "SIGNATURE-OFFRE-DE-CREDIT.pdf", "TABLEAU-AMORTISSEMENT.PDF", etc.)
const CREDIT_PATTERN =
  /pr[eê]t|emprunt|credit|banque|offre[\s_-]?(de[\s_-])?pr[eê]t|signature[\s_-]offre|attestation[\s_-]credit|offre[\s_-]credit/i;

function inferMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (/\.jpe?g$/.test(lower)) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function inferDocumentCategory(fileName: string): DocumentCategory {
  // Amortization / accounting continuity — check before credit to avoid misclassifying
  // "tableau d'amortissement" as generic credit when it should be "amortissement" category.
  if (CONTINUITY_PATTERN.test(fileName)) return "amortissement";
  if (TRAVAUX_PATTERN.test(fileName)) return "charges";
  if (MOBILIER_PATTERN.test(fileName)) return "amortissement";
  if (/loyer|recette|airbnb|booking|bail/i.test(fileName)) return "revenus";
  // Case-insensitive — handles filenames like "SIGNATURE-OFFRE-DE-CREDIT.pdf"
  if (CREDIT_PATTERN.test(fileName)) return "emprunt";
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
  localExtractedDocumentIds: Set<string>;
}): {
  documents: LmnpDocument[];
  restored: number;
  metadataOnly: number;
} {
  const {
    localDocuments,
    supabaseDocuments,
    fiscalYearId,
    propertyId,
    localBlobDocumentIds,
    localExtractedDocumentIds,
  } = params;

  // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
  console.log("[reconciliation-entry]", {
    localDocCount: localDocuments.length,
    remoteRowCount: supabaseDocuments.length,
    localDocs: localDocuments.map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      status: doc.status,
      category: doc.category,
      documentType: doc.documentType,
    })),
    remoteRows: supabaseDocuments.map((row) => ({
      id: row.id,
      fileName: row.file_name,
      extractionStatus: row.extraction_status,
    })),
  });

  if (supabaseDocuments.length === 0) {
    console.log("[reconciliation-exit]", {
      path: "early-return-no-supabase-docs",
      mergedDocCount: localDocuments.length,
      mergedDocs: localDocuments.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        status: doc.status,
      })),
    });
    return { documents: localDocuments, restored: 0, metadataOnly: 0 };
  }

  const keptLocal = localDocuments.filter((local) => {
    const droppedBy = supabaseDocuments.find(
      (remote) => isSameRemoteDocument(local, remote) && local.id !== remote.id,
    );
    if (droppedBy) {
      // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
      console.log("[charges-post-reconcile] LOCAL DOC DROPPED (id mismatch)", {
        localId: local.id,
        localFileName: local.fileName,
        localStatus: local.status,
        localHasBlob: localBlobDocumentIds.has(local.id),
        matchedSupabaseId: droppedBy.id,
        matchedSupabaseFileName: droppedBy.file_name,
        matchedSupabaseStatus: droppedBy.extraction_status,
        matchedBy: local.id === droppedBy.id
          ? "id"
          : local.storagePath === droppedBy.file_path
            ? "storagePath"
            : "fileName",
      });
    }
    return !droppedBy;
  });

  const mergedById = new Map(keptLocal.map((document) => [document.id, document]));
  let restored = 0;
  let metadataOnly = 0;

  for (const row of supabaseDocuments) {
    const existing = mergedById.get(row.id);
    if (existing) {
      const supabaseStatus = mapSupabaseStatus(row.extraction_status);
      const hasLocalBlob = localBlobDocumentIds.has(existing.id);
      const hasLocalExtractions = localExtractedDocumentIds.has(existing.id);
      const guardPassed =
        existing.status === "analyzed" && (hasLocalBlob || hasLocalExtractions);
      const finalStatus: DocumentStatus = guardPassed ? "analyzed" : supabaseStatus;
      // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
      console.log("[charges-reconciliation-guard]", {
        id: existing.id,
        localStatus: existing.status,
        hasLocalBlob,
        hasLocalExtractions,
        guardPassed,
        finalStatus,
      });
      console.log("[charges-reconciliation]", {
        id: existing.id,
        fileName: existing.fileName,
        localStatus: existing.status,
        supabaseStatus: row.extraction_status,
        finalStatus,
      });
      const mergedDoc = {
        ...existing,
        storagePath: existing.storagePath ?? row.file_path,
        fileName: row.file_name,
        status: finalStatus,
        uploadedAt: row.created_at,
      };
      mergedById.set(row.id, mergedDoc);
      // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
      console.log("[charges-post-reconcile]", {
        id: mergedDoc.id,
        fileName: mergedDoc.fileName,
        finalStatus: mergedDoc.status,
        hasLocalBlob: localBlobDocumentIds.has(mergedDoc.id),
        path: "existing",
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
      // Rebuilt directly from a confirmed Supabase documents row — Supabase
      // origin is certain here regardless of what the original producer did.
      hasSupabaseArtifacts: true,
    };

    mergedById.set(row.id, document);
    // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
    console.log("[charges-post-reconcile]", {
      id: document.id,
      fileName: document.fileName,
      finalStatus: document.status,
      hasLocalBlob: localBlobDocumentIds.has(document.id),
      path: "new-supabase-doc",
    });
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

  // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
  console.log("[reconciliation-exit]", {
    path: "full-merge",
    mergedDocCount: documents.length,
    mergedDocs: documents.map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      status: doc.status,
      category: doc.category,
    })),
  });

  return { documents, restored, metadataOnly };
}
