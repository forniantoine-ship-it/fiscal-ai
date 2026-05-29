import { NextResponse } from "next/server";

import { extractActiviteWithGpt } from "@/lib/documents/gpt/extract-activite-with-gpt";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { rawText?: string; fileName?: string };
    const rawText = body.rawText ?? "";
    const fileName = body.fileName ?? "document";

    if (!rawText.trim()) {
      return NextResponse.json({ error: "Texte OCR vide." }, { status: 400 });
    }

    const result = await extractActiviteWithGpt({ rawText, fileName });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction GPT échouée.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
