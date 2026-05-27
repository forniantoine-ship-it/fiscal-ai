import { supabase } from "@/lib/supabase";

export type LmnpDossier = {
  id: string;
  user_id: string;
  status: string;
  city: string | null;
  lmnp_type: string | null;
  created_at: string;
};

export type SupabaseDocumentRow = {
  id: string;
  user_id: string;
  dossier_id: string | null;
  file_name: string;
  file_path: string;
  extraction_status: string;
  created_at: string;
};

const DOSSIER_SELECT = "id, user_id, status, city, lmnp_type, created_at";

function logSupabaseError(
  label: string,
  context: Record<string, unknown>,
  error: {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null,
) {
  console.error(`[dossier] ${label}`, {
    ...context,
    error,
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  });
}

export async function fetchActiveDossierForUser(userId: string): Promise<LmnpDossier | null> {
  const { data, error } = await supabase
    .from("lmnp_dossiers")
    .select(DOSSIER_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logSupabaseError("fetch active failed", { userId }, error);
    return null;
  }

  return data as LmnpDossier | null;
}

export async function createLmnpDossier(
  userId: string,
  patch?: Partial<Pick<LmnpDossier, "status" | "city" | "lmnp_type">>,
): Promise<LmnpDossier | null> {
  const { data, error } = await supabase
    .from("lmnp_dossiers")
    .insert({
      user_id: userId,
      status: patch?.status ?? "draft",
      city: patch?.city ?? "Bordeaux",
      lmnp_type: patch?.lmnp_type ?? "réel",
    })
    .select(DOSSIER_SELECT)
    .single();

  if (error) {
    logSupabaseError("create failed", { userId, patch }, error);
    return null;
  }

  console.log("[dossier] created", { dossierId: data.id, userId });
  return data as LmnpDossier;
}

export async function ensureActiveDossier(userId: string): Promise<LmnpDossier | null> {
  const existing = await fetchActiveDossierForUser(userId);
  if (existing) {
    console.log("[dossier] active dossier loaded", { dossierId: existing.id, userId });
    return existing;
  }

  return createLmnpDossier(userId);
}

export async function fetchDocumentsForDossier(dossierId: string): Promise<SupabaseDocumentRow[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, user_id, dossier_id, file_name, file_path, extraction_status, created_at")
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: false });

  if (error) {
    logSupabaseError("fetch documents failed", { dossierId }, error);
    return [];
  }

  return (data ?? []) as SupabaseDocumentRow[];
}
