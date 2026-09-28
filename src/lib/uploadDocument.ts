import { supabase } from "@/lib/supabase";
import { getCurrentDossierId } from "@/lib/lmnp/dossier/current-dossier";
import { isDossierId } from "@/lib/lmnp/dossier/explicit-dossier-id";
import { buildStorageObjectPath } from "@/lib/storage/sanitize-storage-filename";
import type { DocumentRole } from "@/lib/lmnp/dossier/document-fiscal-origin";

/** Must match the bucket id in Supabase Dashboard (case-sensitive). */
const STORAGE_BUCKET = "lmnp-documents";

export type UploadDocumentResult = {
  filePath: string;
  documentId: string;
};

export type UploadDocumentOptions = {
  /** Exact dossier from the verified workspace. Legacy callers may omit it temporarily. */
  dossierId?: string;
  /**
   * Calendar fiscal year of origin — written explicitly at upload time.
   * Required for every new durable document; never inferred later from the
   * currently open workspace.
   */
  fiscalYear: number;
  /** Defaults to annual_evidence. Use durable_reference for actes / structural docs. */
  documentRole?: DocumentRole;
  /** Optional property attachment (multi-bien-ready). */
  propertyId?: string;
};

export type UploadFilesForUserResult = {
  files: File[];
  documentIds: string[];
  /** Parallel to `documentIds` — Storage object paths (`file_path` / workspace `storagePath`). */
  filePaths: string[];
};

function assertFiscalYear(fiscalYear: number): void {
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
    throw new Error(
      `[uploadDocument] fiscalYear invalide (${fiscalYear}) — un justificatif annuel doit porter son exercice d'origine.`,
    );
  }
}

/** Explicit upload targets never consult the mutable legacy current-dossier pointer. */
export function resolveUploadDossierId(
  explicitDossierId: string | undefined,
  legacyCurrent: () => string | null = getCurrentDossierId,
): string | null {
  if (explicitDossierId !== undefined) return isDossierId(explicitDossierId) ? explicitDossierId.toLowerCase() : null;
  return legacyCurrent();
}

export function documentInsertForUpload(input: {
  userId: string;
  dossierId: string;
  fileName: string;
  filePath: string;
  fiscalYear: number;
  documentRole: DocumentRole;
  propertyId?: string;
}) {
  return {
    user_id: input.userId,
    dossier_id: input.dossierId,
    file_name: input.fileName,
    file_path: input.filePath,
    extraction_status: "pending" as const,
    fiscal_year: input.fiscalYear,
    document_role: input.documentRole,
    ...(input.propertyId ? { property_id: input.propertyId } : {}),
  };
}

/** Uploads each file via the shared Supabase pipeline (storage + documents row). */
export async function uploadFilesForUser(
  files: File[],
  userId: string,
  options: UploadDocumentOptions,
): Promise<UploadFilesForUserResult> {
  assertFiscalYear(options.fiscalYear);

  const uploadedFiles: File[] = [];
  const documentIds: string[] = [];
  const filePaths: string[] = [];

  for (const file of files) {
    const result = await uploadDocument(file, userId, options);
    if (result) {
      uploadedFiles.push(file);
      documentIds.push(result.documentId);
      filePaths.push(result.filePath);
    }
  }

  return { files: uploadedFiles, documentIds, filePaths };
}

export async function uploadDocument(
  file: File,
  userId: string,
  options: UploadDocumentOptions,
): Promise<UploadDocumentResult | null> {
  assertFiscalYear(options.fiscalYear);

  const dossierId = resolveUploadDossierId(options.dossierId);

  if (!dossierId) {
    console.error("[uploadDocument] aborted: no active dossier_id");
    return null;
  }

  const documentRole: DocumentRole = options.documentRole ?? "annual_evidence";

  const { storagePath, sanitizedFilename, displayFilename } = buildStorageObjectPath(
    userId,
    file.name,
  );

  console.log("[uploadDocument] start", {
    bucket: STORAGE_BUCKET,
    filePath: storagePath,
    fileName: displayFilename,
    sanitizedFilename,
    dossierId,
    fiscalYear: options.fiscalYear,
    documentRole,
    propertyId: options.propertyId,
  });

  const { data: storageData, error: storageError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file);

  if (storageError) {
    console.error("[uploadDocument] storage failed", {
      bucket: STORAGE_BUCKET,
      filePath: storagePath,
      sanitizedFilename,
      message: storageError.message,
      error: storageError,
    });
    return null;
  }

  console.log("[uploadDocument] storage ok", { path: storageData.path });

  const { data: inserted, error: insertError } = await supabase
    .from("documents")
    .insert(documentInsertForUpload({
      userId, dossierId, fileName: displayFilename, filePath: storageData.path,
      fiscalYear: options.fiscalYear, documentRole, propertyId: options.propertyId,
    }))
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    console.error("[uploadDocument] db insert failed", {
      path: storageData.path,
      message: insertError?.message,
      error: insertError,
      fiscalYear: options.fiscalYear,
    });
    return null;
  }

  console.log("[uploadDocument] success", {
    path: storageData.path,
    dossierId,
    documentId: inserted.id,
    fiscalYear: options.fiscalYear,
    documentRole,
  });
  return { filePath: storageData.path, documentId: inserted.id };
}
