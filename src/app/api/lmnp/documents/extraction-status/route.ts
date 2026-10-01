import { NextResponse } from "next/server";

import { handleDocumentExtractionStatusRequest } from "@/lib/lmnp/dossier/document-extraction-status";

/** F011-R2 — cycle de vie de `documents.extraction_status` (identité + propriété vérifiées avant l'écriture serveur). */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const result = await handleDocumentExtractionStatusRequest(body);
  return NextResponse.json(result.body, { status: result.status });
}
