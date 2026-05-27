import { supabase } from "@/lib/supabase";

/** Must match the bucket id in Supabase Dashboard (case-sensitive). */
const STORAGE_BUCKET = "LMNP-DOCUMENTS";

export async function uploadDocument(file: File, userId: string): Promise<string | null> {
  const filePath = `${userId}/${Date.now()}-${file.name}`;

  console.log("[uploadDocument] start", { bucket: STORAGE_BUCKET, filePath, fileName: file.name });

  const { data: storageData, error: storageError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, file);

  if (storageError) {
    console.error("[uploadDocument] storage failed", {
      bucket: STORAGE_BUCKET,
      filePath,
      message: storageError.message,
      error: storageError,
    });
    return null;
  }

  console.log("[uploadDocument] storage ok", { path: storageData.path });

  const { error: insertError } = await supabase.from("documents").insert({
    user_id: userId,
    file_name: file.name,
    file_path: storageData.path,
    extraction_status: "pending",
  });

  if (insertError) {
    console.error("[uploadDocument] db insert failed", {
      path: storageData.path,
      message: insertError.message,
      error: insertError,
    });
    return null;
  }

  console.log("[uploadDocument] success", { path: storageData.path });
  return storageData.path;
}
