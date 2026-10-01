import { supabase } from "@/lib/supabase";
import type { ReportableExtractionStatus } from "./document-extraction-status";

/**
 * F011-R2 — appelle la frontière serveur du cycle de vie de `documents.extraction_status`. BEST-EFFORT : ne lève jamais.
 * Le statut est une métadonnée de cycle de vie, pas une autorité fiscale : un échec est journalisé et n'altère ni les données
 * F011, ni la confirmation, ni le résultat de l'analyse.
 */
export async function reportDocumentExtractionStatus(params: {
  documentId: string;
  dossierId: string;
  status: ReportableExtractionStatus;
}): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const response = await fetch("/api/lmnp/documents/extraction-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, authToken: session?.access_token }),
    });
    if (!response.ok) {
      console.error("[f011] extraction status not recorded", { documentId: params.documentId, status: params.status, http: response.status });
    }
    return response.ok;
  } catch (error) {
    console.error("[f011] extraction status not recorded", { documentId: params.documentId, status: params.status, error });
    return false;
  }
}
