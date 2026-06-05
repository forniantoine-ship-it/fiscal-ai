import { NextResponse } from "next/server";

import { extractLogementCanonicalWithVision } from "@/lib/documents/gpt/extract-logement-canonical-with-vision";
import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";
import {
  isLogementDocumentIntent,
  type LogementDocumentIntent,
} from "@/lib/lmnp/services/logement/logement-document-intent";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const fileName = String(formData.get("fileName") ?? "document");
    const intentRaw = String(formData.get("intent") ?? "acquisition");
    const intentConfidence = String(formData.get("intentConfidence") ?? "medium");
    const intentSignalsRaw = String(formData.get("intentSignals") ?? "[]");
    const renderScale = Number(formData.get("renderScale") ?? 4);
    const activationReason = String(formData.get("activationReason") ?? "vision_fallback");

    if (!isLogementDocumentIntent(intentRaw)) {
      return NextResponse.json(
        { success: false, extraction: {}, error: "Intention document invalide." },
        { status: 400 },
      );
    }

    const intent = intentRaw as LogementDocumentIntent;
    let intentSignals: string[] = [];
    try {
      intentSignals = JSON.parse(intentSignalsRaw) as string[];
    } catch {
      intentSignals = [];
    }

    const images: RasterPageImage[] = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("image_") || !(value instanceof Blob)) continue;
      const buffer = Buffer.from(await value.arrayBuffer());
      const mimeType = value.type || "image/png";
      const pageIndex = Number(key.replace("image_", "")) || images.length;
      const normalizedMime: RasterPageImage["mimeType"] =
        mimeType === "image/jpeg" || mimeType === "image/webp" ? mimeType : "image/png";
      images.push({
        mimeType: normalizedMime,
        base64: buffer.toString("base64"),
        pageNumber: pageIndex + 1,
      });
    }

    if (images.length === 0) {
      return NextResponse.json(
        { success: false, extraction: {}, error: "Aucune image fournie." },
        { status: 400 },
      );
    }

    images.sort((a, b) => a.pageNumber - b.pageNumber);

    const result = await extractLogementCanonicalWithVision({
      images,
      fileName,
      intentResolution: { intent, confidence: intentConfidence as "high" | "medium" | "low", signals: intentSignals },
      renderScale,
      activationReason,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction vision échouée.";
    return NextResponse.json(
      { success: false, extraction: {}, error: message },
      { status: 500 },
    );
  }
}
