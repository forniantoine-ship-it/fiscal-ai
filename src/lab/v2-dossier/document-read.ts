import type { SupabaseDocumentRow } from "@/lib/lmnp/dossier/supabase-dossier";

export type DocumentRowsRead =
  | { state: "known"; rows: SupabaseDocumentRow[] }
  | { state: "unknown"; rows: [] };

type DocumentReadScope = { userId: string; dossierId: string; fiscalYear: number };

type DocumentReadServices = {
  authenticatedUserId(): Promise<string | null>;
  listRows(scope: DocumentReadScope): Promise<{ rows: SupabaseDocumentRow[] | null; error: boolean }>;
};

/** The R8 resolved identity is the only scope accepted for V3's document read. */
export async function readRealDocumentRows(
  scope: DocumentReadScope,
  services?: DocumentReadServices,
): Promise<DocumentRowsRead> {
  if (!scope.userId || !scope.dossierId || !Number.isInteger(scope.fiscalYear)) {
    return { state: "unknown", rows: [] };
  }
  try {
    const reader = services ?? await defaultReader();
    if (await reader.authenticatedUserId() !== scope.userId) {
      return { state: "unknown", rows: [] };
    }
    const result = await reader.listRows(scope);
    if (result.error || !result.rows) return { state: "unknown", rows: [] };
    // Keep the server query scoped and reject any unexpected row defensively.
    return {
      state: "known",
      rows: result.rows.filter(row =>
        row.user_id === scope.userId && row.dossier_id === scope.dossierId &&
        (row.fiscal_year === scope.fiscalYear || row.fiscal_year === null),
      ),
    };
  } catch {
    return { state: "unknown", rows: [] };
  }
}

async function defaultReader(): Promise<DocumentReadServices> {
  const { supabase } = await import("@/lib/supabase");
  return {
    async authenticatedUserId() {
      const { data, error } = await supabase.auth.getUser();
      return error ? null : data.user?.id ?? null;
    },
    async listRows({ userId, dossierId, fiscalYear }) {
      const { data, error } = await supabase
        .from("documents")
        .select("id, user_id, dossier_id, file_name, file_path, extraction_status, created_at, fiscal_year, document_role, property_id")
        .eq("user_id", userId)
        .eq("dossier_id", dossierId)
        .or(`fiscal_year.eq.${fiscalYear},fiscal_year.is.null`)
        .order("created_at", { ascending: false });
      return { rows: error ? null : (data ?? []) as SupabaseDocumentRow[], error: Boolean(error) };
    },
  };
}
