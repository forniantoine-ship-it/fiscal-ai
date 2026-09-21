import type {
  DocumentCategory,
  DocumentStatus,
  DocumentType,
  LmnpDocument,
} from "@/lib/lmnp/types";

import type { SupabaseDocumentRow } from "./supabase-dossier";
import {
  canMergeRemoteMetadataIntoLocal,
  resolveEffectiveFiscalYear,
  type DocumentRole,
} from "./document-fiscal-origin";

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

function mapDocumentRole(
  role: SupabaseDocumentRow["document_role"],
): DocumentRole | undefined {
  if (role === "annual_evidence" || role === "durable_reference") return role;
  return undefined;
}

export function reconcileWorkspaceDocuments(params: {
  localDocuments: LmnpDocument[];
  supabaseDocuments: SupabaseDocumentRow[];
  fiscalYearId: string;
  /** Calendar year of the workspace being reconciled — required for Lot 2 isolation. */
  fiscalYear: number;
  propertyId?: string;
  localBlobDocumentIds: Set<string>;
  localExtractedDocumentIds: Set<string>;
  /**
   * Optional snapshot index for deterministic legacy proof
   * (document id → exactly one snapshot year).
   */
  legacySnapshots?: ReadonlyArray<{ fiscalYear: number; documentIds: ReadonlyArray<string> }>;
}): {
  documents: LmnpDocument[];
  restored: number;
  metadataOnly: number;
  skippedForeignYear: number;
  skippedLegacyUnresolved: number;
  skippedDurableReference: number;
} {
  const {
    localDocuments,
    supabaseDocuments,
    fiscalYearId,
    fiscalYear,
    propertyId,
    localBlobDocumentIds,
    localExtractedDocumentIds,
    legacySnapshots,
  } = params;

  if (supabaseDocuments.length === 0) {
    return {
      documents: localDocuments,
      restored: 0,
      metadataOnly: 0,
      skippedForeignYear: 0,
      skippedLegacyUnresolved: 0,
      skippedDurableReference: 0,
    };
  }

  const keptLocal = localDocuments.filter((local) => {
    const droppedBy = supabaseDocuments.find(
      (remote) => isSameRemoteDocument(local, remote) && local.id !== remote.id,
    );
    return !droppedBy;
  });

  const mergedById = new Map(keptLocal.map((document) => [document.id, document]));
  let restored = 0;
  let metadataOnly = 0;
  let skippedForeignYear = 0;
  let skippedLegacyUnresolved = 0;
  let skippedDurableReference = 0;

  for (const row of supabaseDocuments) {
    const existing = mergedById.get(row.id);
    const effectiveFiscalYear = resolveEffectiveFiscalYear({
      serverFiscalYear: row.fiscal_year,
      documentId: row.id,
      snapshots: legacySnapshots,
    });
    const origin = {
      fiscalYear: effectiveFiscalYear ?? null,
      documentRole: mapDocumentRole(row.document_role),
      propertyId: row.property_id,
    };

    const allowed = canMergeRemoteMetadataIntoLocal({
      hasLocalDocument: Boolean(existing),
      origin,
      workspaceFiscalYear: fiscalYear,
    });

    if (!allowed) {
      if (origin.fiscalYear == null) {
        skippedLegacyUnresolved += 1;
      } else if (origin.fiscalYear !== fiscalYear) {
        skippedForeignYear += 1;
      } else if (origin.documentRole === "durable_reference") {
        skippedDurableReference += 1;
      } else {
        skippedForeignYear += 1;
      }
      continue;
    }

    if (existing) {
      const supabaseStatus = mapSupabaseStatus(row.extraction_status);
      const hasLocalBlob = localBlobDocumentIds.has(existing.id);
      const hasLocalExtractions = localExtractedDocumentIds.has(existing.id);
      const guardPassed =
        existing.status === "analyzed" && (hasLocalBlob || hasLocalExtractions);
      const finalStatus: DocumentStatus = guardPassed ? "analyzed" : supabaseStatus;
      const mergedDoc: LmnpDocument = {
        ...existing,
        storagePath: existing.storagePath ?? row.file_path,
        fileName: row.file_name,
        status: finalStatus,
        uploadedAt: row.created_at,
        fiscalYear: existing.fiscalYear ?? effectiveFiscalYear ?? fiscalYear,
        documentRole: existing.documentRole ?? mapDocumentRole(row.document_role),
        propertyId: existing.propertyId ?? row.property_id ?? propertyId,
      };
      mergedById.set(row.id, mergedDoc);
      continue;
    }

    const duplicate = [...mergedById.values()].some((document) =>
      isSameRemoteDocument(document, row),
    );
    if (duplicate) continue;

    const hasLocalBlob = localBlobDocumentIds.has(row.id);
    const category = inferDocumentCategory(row.file_name);
    const remoteRestored = !hasLocalBlob;
    const mappedRole = mapDocumentRole(row.document_role);
    const document: LmnpDocument = {
      id: row.id,
      fiscalYearId,
      fiscalYear: effectiveFiscalYear ?? fiscalYear,
      documentRole: mappedRole ?? "annual_evidence",
      propertyId: row.property_id ?? propertyId,
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
    restored += 1;

    if (remoteRestored) {
      metadataOnly += 1;
      console.log("[documents] restored metadata-only", {
        documentId: row.id,
        fileName: row.file_name,
        fiscalYear,
      });
    }
  }

  const documents = [...mergedById.values()].sort((a, b) =>
    b.uploadedAt.localeCompare(a.uploadedAt),
  );

  if (restored > 0 || skippedForeignYear > 0 || skippedLegacyUnresolved > 0) {
    console.log("[documents] reconciled by fiscal year", {
      fiscalYear,
      restored,
      metadataOnly,
      skippedForeignYear,
      skippedLegacyUnresolved,
      skippedDurableReference,
      total: documents.length,
    });
  }

  return {
    documents,
    restored,
    metadataOnly,
    skippedForeignYear,
    skippedLegacyUnresolved,
    skippedDurableReference,
  };
}
