import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";

export const VISION_OCR_SYSTEM_PROMPT = `Extract ALL visible text from this administrative document.
Preserve line breaks.
Do not summarize.
Do not interpret.
Return raw text only.`;

export class VisionOcrError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VisionOcrError";
  }
}

/**
 * Client-side request to vision OCR API (raw text extraction).
 */
export async function requestVisionOcrText(
  images: RasterPageImage[],
  options?: { fileName?: string },
): Promise<string> {
  const formData = new FormData();
  if (options?.fileName) {
    formData.append("fileName", options.fileName);
  }

  images.forEach((img, index) => {
    const bytes = Uint8Array.from(atob(img.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: img.mimeType });
    formData.append(`image_${index}`, blob, `page-${img.pageNumber}.${img.mimeType === "image/png" ? "png" : "jpg"}`);
  });
  formData.append("pageCount", String(images.length));

  const response = await fetch("/api/lmnp/ocr/vision-text", {
    method: "POST",
    body: formData,
  });

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    rawText?: string;
  };

  if (!response.ok) {
    throw new VisionOcrError(
      body.error ?? `Vision OCR échoué (${response.status})`,
      response.status,
    );
  }

  if (typeof body.rawText !== "string") {
    throw new VisionOcrError("Réponse vision OCR invalide.", 502);
  }

  console.log("[ocr-vision] client received", {
    pageCount: images.length,
    textLength: body.rawText.length,
    newlineCount: (body.rawText.match(/\n/g) ?? []).length,
  });

  return body.rawText;
}
