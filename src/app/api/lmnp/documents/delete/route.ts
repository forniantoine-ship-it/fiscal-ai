import { NextResponse } from "next/server";

import { deleteDocumentArtifacts } from "@/lib/lmnp/dossier/delete-document";
import {
  getServerSupabaseForUser,
  getServerSupabaseUnscoped,
  OwnershipError,
  UnauthorizedError,
} from "@/lib/supabase-server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      documentId?: string;
      dossierId?: string;
      authToken?: string;
    };

    const documentId = body.documentId?.trim();
    const dossierId = body.dossierId?.trim();

    if (!documentId || !dossierId) {
      return NextResponse.json({ error: "documentId et dossierId requis." }, { status: 400 });
    }

    // Identity first — never proceeds to any Supabase call without a verified
    // user. Ownership (and the idempotent "already deleted" case) is resolved
    // inside deleteDocumentArtifacts, which needs to distinguish "row absent"
    // from "row present but not yours" — a plain assertDocumentOwnership() call
    // here would collapse both into a 403, breaking retry-idempotence.
    const { userId } = await getServerSupabaseForUser(body.authToken);
    const supabase = getServerSupabaseUnscoped();

    const outcome = await deleteDocumentArtifacts(supabase, { documentId, dossierId, userId });

    return NextResponse.json({ status: outcome });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof OwnershipError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Erreur serveur.";
    console.error("[api/lmnp/documents/delete]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
