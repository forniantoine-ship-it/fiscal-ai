import type { DocumentCategory } from "../types";
import type { DocumentAnalysisResult } from "../ocr/map-to-extractions";
import type { VisionImagePayload } from "./pdf-to-images";

export class OcrClientError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "OcrClientError";
  }
}

export async function requestDocumentOcr(
  images: VisionImagePayload[],
  options: {
    fileName: string;
    userCategory: DocumentCategory;
    fiscalYearId: string;
    documentId: string;
  },
): Promise<DocumentAnalysisResult> {
  const formData = new FormData();
  formData.append("fileName", options.fileName);
  formData.append("userCategory", options.userCategory);
  formData.append("fiscalYearId", options.fiscalYearId);
  formData.append("documentId", options.documentId);

  images.forEach((img, index) => {
    const bytes = Uint8Array.from(atob(img.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: img.mimeType });
    formData.append(`image_${index}`, blob, `page-${index + 1}.jpg`);
  });
  formData.append("pageCount", String(images.length));

  const response = await fetch("/api/lmnp/ocr", {
    method: "POST",
    body: formData,
  });

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    result?: DocumentAnalysisResult;
  };

  if (!response.ok) {
    throw new OcrClientError(
      body.error ?? `Analyse OCR échouée (${response.status})`,
      response.status,
    );
  }

  if (!body.result) {
    throw new OcrClientError("Réponse OCR invalide.");
  }

  return body.result;
}
