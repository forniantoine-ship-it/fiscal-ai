import { downloadDocumentFromStorage } from "@/lib/supabase/download-document";
import { loadDocumentFile } from "@/lib/lmnp/store/persistence";
import type { LmnpDocument } from "@/lib/lmnp/types";

/**
 * Resolves a document file for analysis: local browser File first, then Supabase Storage.
 */
export async function resolveDocumentFile(
  document: LmnpDocument,
  getFile: (documentId: string) => File | undefined,
): Promise<File> {
  const localFile = getFile(document.id);
  if (localFile) {
    return localFile;
  }

  if (document.storagePath) {
    const buffer = await downloadDocumentFromStorage(document.storagePath);
    return new File([buffer], document.fileName, {
      type: document.mimeType || "application/octet-stream",
    });
  }

  const persistedFile = await loadDocumentFile(document.id);
  if (persistedFile) {
    return persistedFile;
  }

  throw new Error("Fichier introuvable dans le navigateur. Réimportez le document.");
}
