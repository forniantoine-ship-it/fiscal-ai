import { supabase } from "@/lib/supabase";
import type { DeleteDocumentOutcome } from "./delete-document";

export class DocumentDeletionError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DocumentDeletionError";
    this.status = status;
  }
}

/** Calls the server-side deletion endpoint (Storage + extracted_document_data + documents). */
export async function deleteDocumentOnServer(params: {
  documentId: string;
  dossierId: string;
}): Promise<DeleteDocumentOutcome> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch("/api/lmnp/documents/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      documentId: params.documentId,
      dossierId: params.dossierId,
      authToken: session?.access_token,
    }),
  });

  const body = (await response.json()) as { status?: DeleteDocumentOutcome; error?: string };

  if (!response.ok) {
    throw new DocumentDeletionError(body.error ?? "Suppression échouée.", response.status);
  }

  return body.status ?? "deleted";
}
