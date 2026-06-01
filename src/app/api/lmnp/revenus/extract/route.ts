import { NextResponse } from "next/server";

import { extractRevenusLinesWithGpt } from "@/lib/documents/gpt/extract-revenus-lines-with-gpt";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      rawText?: string;
      fileName?: string;
      fiscalYear?: number;
      sourceType?: string;
    };

    const rawText = body.rawText ?? "";
    const fileName = body.fileName ?? "document";
    const fiscalYear = body.fiscalYear ?? new Date().getFullYear() - 1;
    const sourceType = body.sourceType ?? "bank_statement";

    if (!rawText.trim()) {
      return NextResponse.json(
        { success: false, extraction: { lines: [] }, error: "Texte OCR vide." },
        { status: 400 },
      );
    }

    const result = await extractRevenusLinesWithGpt({
      rawText,
      fileName,
      fiscalYear,
      sourceType,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction GPT échouée.";
    return NextResponse.json(
      { success: false, extraction: { lines: [] }, error: message },
      { status: 500 },
    );
  }
}
