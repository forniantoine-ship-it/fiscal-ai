import { NextResponse } from "next/server";

import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";
import { extractVisionOcrTextFromImages } from "@/lib/documents/ocr/vision-ocr-server";
import {
  attachCreditPipelineServerTiming,
  detachCreditPipelineServerTiming,
  measureCreditPipelineAwait,
  traceCreditPipelineStep,
} from "@/lib/lmnp/services/credit-pipeline-timing";

export const maxDuration = 120;

export async function POST(request: Request) {
  const formData = await request.formData();
  const traceId =
    String(formData.get("pipelineTraceId") ?? "") ||
    request.headers.get("x-credit-pipeline-trace-id") ||
    `credit-pipeline-vision-${Date.now()}`;
  const fileName = String(formData.get("fileName") ?? "document");

  attachCreditPipelineServerTiming(traceId, {
    segment: "api_vision_ocr",
    fileName,
  });

  try {
    const images: RasterPageImage[] = [];

    await measureCreditPipelineAwait(
      "server_vision_formdata_parse",
      (async () => {
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
      })(),
      { fileName },
    );

    if (images.length === 0) {
      return NextResponse.json({ error: "Aucune image fournie." }, { status: 400 });
    }

    images.sort((a, b) => a.pageNumber - b.pageNumber);
    traceCreditPipelineStep("server_vision_images_ready", {
      pageCount: images.length,
      fileName,
    });

    const rawText = await measureCreditPipelineAwait(
      "server_vision_openai_request",
      extractVisionOcrTextFromImages(images, fileName),
      { pageCount: images.length },
    );

    return NextResponse.json({ rawText });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur vision OCR.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;
    console.error("[api/lmnp/ocr/vision-text]", err);
    return NextResponse.json({ error: message }, { status });
  } finally {
    detachCreditPipelineServerTiming();
  }
}
