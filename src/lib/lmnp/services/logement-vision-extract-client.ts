import type { LogementActeGptExtractionResult } from "@/lib/documents/gpt/extract-logement-acte-with-gpt";
import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";
import type { LogementDocumentIntent } from "@/lib/lmnp/services/logement/logement-document-intent";

export class LogementVisionExtractError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LogementVisionExtractError";
  }
}

export async function requestLogementVisionExtraction(params: {
  images: RasterPageImage[];
  fileName: string;
  intent: LogementDocumentIntent;
  intentConfidence: string;
  intentSignals: string[];
  renderScale: number;
  activationReason: string;
}): Promise<LogementActeGptExtractionResult> {
  const formData = new FormData();
  formData.append("fileName", params.fileName);
  formData.append("intent", params.intent);
  formData.append("intentConfidence", params.intentConfidence);
  formData.append("intentSignals", JSON.stringify(params.intentSignals));
  formData.append("renderScale", String(params.renderScale));
  formData.append("activationReason", params.activationReason);
  formData.append("pageCount", String(params.images.length));

  params.images.forEach((img, index) => {
    const bytes = Uint8Array.from(atob(img.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: img.mimeType });
    formData.append(
      `image_${index}`,
      blob,
      `page-${img.pageNumber}.${img.mimeType === "image/png" ? "png" : "jpg"}`,
    );
  });

  const response = await fetch("/api/lmnp/logement/extract-vision", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new LogementVisionExtractError(
      payload.error ?? `Vision extraction failed (${response.status})`,
      response.status,
    );
  }

  return (await response.json()) as LogementActeGptExtractionResult;
}
