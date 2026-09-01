import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";
import {
  getCreditPipelineTraceId,
  measureCreditPipelineAwait,
} from "@/lib/lmnp/services/credit-pipeline-timing";

export const VISION_OCR_SYSTEM_PROMPT = `Extract ALL visible text from this administrative document.
Preserve line breaks.
Do not summarize.
Do not interpret.
Return raw text only.`;

/**
 * Correctif — un modèle vision peut, sur certaines images, répondre par un
 * refus textuel ("I'm unable to extract text...") au lieu de transcrire —
 * un comportement du modèle, jamais une mesure de la qualité de l'image.
 * Utilisé uniquement en second essai, sur les mêmes images, après détection
 * explicite d'un refus (voir `resolve-document-text.ts`).
 */
export const VISION_OCR_RETRY_SYSTEM_PROMPT = `You are shown an image: a scan or photo of a real paper document. You can see it directly and must transcribe it.
Never respond that you are unable to process images, that the document "appears to be an image", or that you need a text version — you already have everything required.
Extract ALL visible text from this administrative document, exactly as shown.
Preserve line breaks.
Do not summarize. Do not interpret. Do not apologize or explain limitations.
Return raw text only.`;

export type VisionOcrPromptVariant = "default" | "retry_after_refusal";

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
  options?: { fileName?: string; promptVariant?: VisionOcrPromptVariant },
): Promise<string> {
  const formData = new FormData();
  if (options?.fileName) {
    formData.append("fileName", options.fileName);
  }
  if (options?.promptVariant) {
    formData.append("promptVariant", options.promptVariant);
  }

  const traceId = getCreditPipelineTraceId();
  if (traceId) {
    formData.append("pipelineTraceId", traceId);
  }

  images.forEach((img, index) => {
    const bytes = Uint8Array.from(atob(img.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: img.mimeType });
    formData.append(`image_${index}`, blob, `page-${img.pageNumber}.${img.mimeType === "image/png" ? "png" : "jpg"}`);
  });
  formData.append("pageCount", String(images.length));

  const response = await measureCreditPipelineAwait(
    "ocr_vision_http_fetch",
    fetch("/api/lmnp/ocr/vision-text", {
      method: "POST",
      body: formData,
    }),
    { pageCount: images.length, fileName: options?.fileName },
  );

  const body = await measureCreditPipelineAwait(
    "ocr_vision_response_json_parse",
    response.json().catch(() => ({})) as Promise<{
      error?: string;
      rawText?: string;
    }>,
    { ok: response.ok, status: response.status },
  );

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
