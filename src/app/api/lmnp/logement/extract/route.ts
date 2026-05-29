import { NextResponse } from "next/server";

import { extractLogementActeWithGpt } from "@/lib/documents/gpt/extract-logement-acte-with-gpt";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { rawText?: string; fileName?: string };
    const rawText = body.rawText ?? "";
    const fileName = body.fileName ?? "document";

    if (!rawText.trim()) {
      return NextResponse.json(
        { success: false, extraction: {}, error: "Texte OCR vide." },
        { status: 400 },
      );
    }

    const result = await extractLogementActeWithGpt({ rawText, fileName });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction GPT échouée.";
    return NextResponse.json(
      { success: false, extraction: {}, error: message },
      { status: 500 },
    );
  }
}
