import { NextResponse } from "next/server";

import { extractDocument } from "@/lib/ai/extract-document";
import { isUserUploadCategory } from "@/lib/ai/document-classification-types";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const dossierId = String(formData.get("dossierId") ?? "");
    const documentIdRaw = formData.get("documentId");
    const documentId = documentIdRaw ? String(documentIdRaw) : null;

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Fichier PDF requis." }, { status: 400 });
    }

    if (!dossierId) {
      return NextResponse.json({ error: "dossierId requis." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = String(formData.get("fileName") ?? "document.pdf");
    const mimeType = file.type || undefined;
    const userCategoryRaw = formData.get("userCategory");
    const userCategory = userCategoryRaw ? String(userCategoryRaw) : null;

    const authToken = String(formData.get("authToken") ?? "") || undefined;

    const result = await extractDocument({
      fileBuffer: buffer,
      fileName,
      dossierId,
      documentId,
      mimeType,
      authToken,
      userCategory: isUserUploadCategory(userCategory) ? userCategory : null,
    });

    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur extraction.";
    const status = message.includes("OPENAI_API_KEY") || message.includes("Supabase") ? 503 : 500;
    console.error("[api/lmnp/extract]", err);
    return NextResponse.json({ error: message }, { status });
  }
}
