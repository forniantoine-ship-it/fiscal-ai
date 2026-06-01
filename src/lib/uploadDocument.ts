import { supabase } from "@/lib/supabase";
import { getCurrentDossierId } from "@/lib/lmnp/dossier/current-dossier";
import { buildStorageObjectPath } from "@/lib/storage/sanitize-storage-filename";

/** Must match the bucket id in Supabase Dashboard (case-sensitive). */
const STORAGE_BUCKET = "lmnp-documents";

export type UploadDocumentResult = {
  filePath: string;
  documentId: string;
};

export type UploadFilesForUserResult = {
  files: File[];
  documentIds: string[];
};

/** Uploads each file via the shared Supabase pipeline (storage + documents row). */
export async function uploadFilesForUser(
  files: File[],
  userId: string,
): Promise<UploadFilesForUserResult> {
  const uploadedFiles: File[] = [];
  const documentIds: string[] = [];

  for (const file of files) {
    const result = await uploadDocument(file, userId);
    if (result) {
      uploadedFiles.push(file);
      documentIds.push(result.documentId);
    }
  }

  return { files: uploadedFiles, documentIds };
}

export async function uploadDocument(
  file: File,
  userId: string,
): Promise<UploadDocumentResult | null> {
  const dossierId = getCurrentDossierId();

  if (!dossierId) {
    console.error("[uploadDocument] aborted: no active dossier_id");
    return null;
  }

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
    .insert({
      user_id: userId,
      dossier_id: dossierId,
      file_name: displayFilename,
      file_path: storageData.path,
      extraction_status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    console.error("[uploadDocument] db insert failed", {
      path: storageData.path,
      message: insertError?.message,
      error: insertError,
    });
    return null;
  }

  console.log("[uploadDocument] success", {
    path: storageData.path,
    dossierId,
    documentId: inserted.id,
  });
  return { filePath: storageData.path, documentId: inserted.id };
}
