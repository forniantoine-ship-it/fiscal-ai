import { supabase } from "@/lib/supabase";

/** Must match the bucket id in Supabase Dashboard (case-sensitive). */
const STORAGE_BUCKET = "lmnp-documents";

/**
 * Downloads a document from Supabase Storage by its storage path.
 */
export async function downloadDocumentFromStorage(storagePath: string): Promise<ArrayBuffer> {
  console.log("[document-download] start", { storagePath });

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);

  if (error || !data) {
    console.log("[document-download] failed", {
      storagePath,
      message: error?.message ?? "empty response",
    });
    throw new Error(
      `Échec téléchargement du document : ${error?.message ?? "fichier absent dans le stockage"}`,
    );
  }

  const buffer = await data.arrayBuffer();
  console.log("[document-download] success", { storagePath, bytes: buffer.byteLength });
  return buffer;
}
