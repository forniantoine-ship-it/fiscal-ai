import { normalizeOcrText } from "@/lib/documents/normalizers";
import {
  computeOcrQualityMetrics,
  isOcrQualityAcceptable,
  logOcrQuality,
  type OcrQualityMetrics,
} from "@/lib/documents/ocr/ocr-quality";
import { extractNativePdfText, isPdfFile } from "@/lib/documents/ocr/pdf-native-text";
import { fileToRasterImages } from "@/lib/documents/ocr/pdf-to-images";
import { requestVisionOcrText, VisionOcrError } from "@/lib/documents/ocr/vision-ocr";

export const NATIVE_PDF_TEXT_MIN_LENGTH = 300;

export type DocumentTextProvider = "pdf_text" | "vision_ocr";

export type ResolveDocumentTextResult = {
  rawText: string;
  provider: DocumentTextProvider;
  quality: OcrQualityMetrics;
  ok: boolean;
  pageCount: number;
  fallbackReason?: string;
};

export class DocumentOcrFailedError extends Error {
  readonly metrics: OcrQualityMetrics;
  readonly provider: DocumentTextProvider;

  constructor(
    message: string,
    params: { metrics: OcrQualityMetrics; provider: DocumentTextProvider },
  ) {
    super(message);
    this.name = "DocumentOcrFailedError";
    this.metrics = params.metrics;
    this.provider = params.provider;
  }
}

export const OCR_READ_FAILURE_MESSAGE =
  "Nous n'avons pas réussi à lire correctement ce document. Essayez un PDF plus net ou une photo plus lisible.";

function finalizeResult(params: {
  rawText: string;
  provider: DocumentTextProvider;
  pageCount: number;
  fallbackReason?: string;
}): ResolveDocumentTextResult {
  const normalized = normalizeOcrText(params.rawText);
  const quality = computeOcrQualityMetrics(normalized);
  const ok = isOcrQualityAcceptable(quality);

  logOcrQuality(quality, ok);

  console.log("[ocr-strategy] resolved", {
    provider: params.provider,
    pageCount: params.pageCount,
    textLength: quality.textLength,
    newlineCount: quality.newlineCount,
    alphaRatio: quality.alphaRatio,
    digitRatio: quality.digitRatio,
    ok,
    fallbackReason: params.fallbackReason ?? null,
  });

  return {
    rawText: normalized,
    provider: params.provider,
    quality,
    ok,
    pageCount: params.pageCount,
    fallbackReason: params.fallbackReason,
  };
}

/**
 * Chooses the best OCR strategy: native PDF text, then vision OCR on rasterized pages.
 */
export async function resolveDocumentText(file: File): Promise<ResolveDocumentTextResult> {
  console.log("[ocr-strategy] start", {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });

  if (isPdfFile(file)) {
    const { text: nativeText, pageCount } = await extractNativePdfText(file);

    if (nativeText.length > NATIVE_PDF_TEXT_MIN_LENGTH) {
      console.log("[ocr-strategy] using native PDF text", {
        textLength: nativeText.length,
        threshold: NATIVE_PDF_TEXT_MIN_LENGTH,
      });
      return finalizeResult({
        rawText: nativeText,
        provider: "pdf_text",
        pageCount,
      });
    }

    console.log("[ocr-strategy] native PDF text insufficient, fallback to vision", {
      textLength: nativeText.length,
      threshold: NATIVE_PDF_TEXT_MIN_LENGTH,
    });

    const images = await fileToRasterImages(file);
    const visionText = await requestVisionOcrText(images, { fileName: file.name });
    const combined = [nativeText, visionText].filter(Boolean).join("\n\n");

    return finalizeResult({
      rawText: combined || visionText,
      provider: "vision_ocr",
      pageCount: images.length,
      fallbackReason: `native_pdf_below_${NATIVE_PDF_TEXT_MIN_LENGTH}`,
    });
  }

  const images = await fileToRasterImages(file);
  const visionText = await requestVisionOcrText(images, { fileName: file.name });

  return finalizeResult({
    rawText: visionText,
    provider: "vision_ocr",
    pageCount: images.length,
    fallbackReason: "non_pdf_image",
  });
}

/**
 * Resolves document text and throws if quality checks fail.
 */
export async function resolveDocumentTextOrThrow(file: File): Promise<ResolveDocumentTextResult> {
  try {
    const result = await resolveDocumentText(file);
    if (!result.ok) {
      throw new DocumentOcrFailedError(OCR_READ_FAILURE_MESSAGE, {
        metrics: result.quality,
        provider: result.provider,
      });
    }
    return result;
  } catch (err) {
    if (err instanceof DocumentOcrFailedError) throw err;
    if (err instanceof VisionOcrError) {
      console.error("[ocr-strategy] vision OCR failed", { status: err.status, message: err.message });
    }
    throw err;
  }
}
