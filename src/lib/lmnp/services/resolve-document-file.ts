import { downloadDocumentFromStorage } from "@/lib/supabase/download-document";
import { loadDocumentFile } from "@/lib/lmnp/store/persistence";
import type { LmnpDocument } from "@/lib/lmnp/types";

import {
  measureCreditPipelineAwait,
  traceCreditPipelineStep,
} from "./credit-pipeline-timing";

/**
 * Resolves a document file for analysis: local browser File first, then Supabase Storage.
 */
export async function resolveDocumentFile(
  document: LmnpDocument,
  getFile: (documentId: string) => File | undefined,
): Promise<File> {
  const localFile = getFile(document.id);
  if (localFile) {
    traceCreditPipelineStep("pdf_file_source_local_registry", {
      fileName: localFile.name,
      sizeBytes: localFile.size,
    });
    return localFile;
  }

  if (document.storagePath) {
    const file = await measureCreditPipelineAwait(
      "pdf_file_download_supabase",
      (async () => {
        const buffer = await downloadDocumentFromStorage(document.storagePath!);
        return new File([buffer], document.fileName, {
          type: document.mimeType || "application/octet-stream",
        });
      })(),
      { storagePath: document.storagePath },
    );
    traceCreditPipelineStep("pdf_file_source_supabase", {
      fileName: file.name,
      sizeBytes: file.size,
    });
    return file;
  }

  const persistedFile = await measureCreditPipelineAwait(
    "pdf_file_load_indexeddb",
    loadDocumentFile(document.id),
    { documentId: document.id },
  );
  if (persistedFile) {
    traceCreditPipelineStep("pdf_file_source_indexeddb", {
      fileName: persistedFile.name,
      sizeBytes: persistedFile.size,
    });
    return persistedFile;
  }

  throw new Error("Fichier introuvable dans le navigateur. Réimportez le document.");
}
