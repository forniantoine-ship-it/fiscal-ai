import type { LmnpDocument } from "@/lib/lmnp/types";

import {
  measureCreditPipelineAwait,
  traceCreditPipelineStep,
} from "./credit-pipeline-timing";

export type ResolveDocumentFileDeps = {
  /** Override Storage download (tests). */
  downloadFromStorage?: (storagePath: string) => Promise<ArrayBuffer>;
  /** Override IndexedDB load (tests). */
  loadFromIndexedDb?: (documentId: string) => Promise<File | null>;
  /** Persist a recovered blob into IndexedDB. */
  persistToIndexedDb?: (document: LmnpDocument, file: File) => Promise<void>;
  /**
   * Called when a blob is recovered from IndexedDB or Storage so callers can
   * REGISTER_FILE into FileRegistry (lazy cache rebuild). Never invents a file.
   */
  onCached?: (documentId: string, file: File) => void;
};

/**
 * Resolves a document file for analysis / re-read.
 *
 * 1. FileRegistry (via getFile) → local, no download
 * 2. IndexedDB cache → optional onCached, no Storage download
 * 3. storagePath → authenticated Storage download → rebuild File → cache IDB + onCached
 * 4. no local blob and no storagePath → explicit failure (never invent a file)
 * 5. Storage download failure → propagate; do not clear document metadata
 *
 * Storage / IndexedDB modules are loaded lazily so pure unit tests that only
 * import pipelines do not require Supabase env at module evaluation time.
 */
export async function resolveDocumentFile(
  document: LmnpDocument,
  getFile: (documentId: string) => File | undefined,
  deps: ResolveDocumentFileDeps = {},
): Promise<File> {
  const localFile = getFile(document.id);
  if (localFile) {
    traceCreditPipelineStep("pdf_file_source_local_registry", {
      fileName: localFile.name,
      sizeBytes: localFile.size,
    });
    return localFile;
  }

  const loadIdb =
    deps.loadFromIndexedDb ??
    (await import("@/lib/lmnp/store/persistence")).loadDocumentFile;

  const persistedFile = await measureCreditPipelineAwait(
    "pdf_file_load_indexeddb",
    loadIdb(document.id),
    { documentId: document.id },
  );
  if (persistedFile) {
    traceCreditPipelineStep("pdf_file_source_indexeddb", {
      fileName: persistedFile.name,
      sizeBytes: persistedFile.size,
    });
    deps.onCached?.(document.id, persistedFile);
    return persistedFile;
  }

  if (!document.storagePath) {
    throw new Error(
      "Fichier introuvable : aucune copie locale et aucun chemin Storage. Réimportez le document.",
    );
  }

  const download =
    deps.downloadFromStorage ??
    (await import("@/lib/supabase/download-document")).downloadDocumentFromStorage;

  const file = await measureCreditPipelineAwait(
    "pdf_file_download_supabase",
    (async () => {
      const buffer = await download(document.storagePath!);
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

  const persistIdb =
    deps.persistToIndexedDb ??
    (await import("@/lib/lmnp/store/persistence")).persistDocumentFile;

  try {
    await persistIdb(document, file);
  } catch (error) {
    // Cache write must not discard a successfully downloaded blob.
    console.error("[resolveDocumentFile] IndexedDB cache write failed", document.id, error);
  }
  deps.onCached?.(document.id, file);
  return file;
}
