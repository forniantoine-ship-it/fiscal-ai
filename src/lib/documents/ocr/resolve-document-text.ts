import { normalizeOcrText } from "@/lib/documents/normalizers";
import {
  incrementCreditPipelineCounter,
  measureCreditPipelineAwait,
  measureCreditPipelineSync,
  traceCreditPipelineStep,
} from "@/lib/lmnp/services/credit-pipeline-timing";
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
  return measureCreditPipelineSync(
    "ocr_quality_finalize",
    () => {
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
    },
    {
      provider: params.provider,
      pageCount: params.pageCount,
      fallbackReason: params.fallbackReason,
    },
  );
}

/**
 * Chooses the best OCR strategy: native PDF text, then vision OCR on rasterized pages.
 */
export async function resolveDocumentText(file: File): Promise<ResolveDocumentTextResult> {
  traceCreditPipelineStep("ocr_strategy_start", {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });

  if (isPdfFile(file)) {
    const { text: nativeText, pageCount } = await measureCreditPipelineAwait(
      "pdf_native_text_extraction",
      extractNativePdfText(file),
      { fileName: file.name },
    );

    if (nativeText.length > NATIVE_PDF_TEXT_MIN_LENGTH) {
      traceCreditPipelineStep("ocr_strategy_native_pdf_sufficient", {
        textLength: nativeText.length,
        threshold: NATIVE_PDF_TEXT_MIN_LENGTH,
      });
      return finalizeResult({
        rawText: nativeText,
        provider: "pdf_text",
        pageCount,
      });
    }

    traceCreditPipelineStep("ocr_strategy_native_insufficient_fallback_vision", {
      textLength: nativeText.length,
      threshold: NATIVE_PDF_TEXT_MIN_LENGTH,
    });

    const images = await measureCreditPipelineAwait(
      "pdf_page_rasterization_all_pages",
      fileToRasterImages(file),
      { fileName: file.name },
    );

    incrementCreditPipelineCounter("vision_ocr_requests");
    const visionText = await measureCreditPipelineAwait(
      "ocr_vision_request",
      requestVisionOcrText(images, { fileName: file.name }),
      { pageCount: images.length },
    );

    const combined = measureCreditPipelineSync(
      "ocr_native_vision_text_merge",
      () => [nativeText, visionText].filter(Boolean).join("\n\n"),
      { nativeLength: nativeText.length, visionLength: visionText.length },
    );

    return finalizeResult({
      rawText: combined || visionText,
      provider: "vision_ocr",
      pageCount: images.length,
      fallbackReason: `native_pdf_below_${NATIVE_PDF_TEXT_MIN_LENGTH}`,
    });
  }

  const images = await measureCreditPipelineAwait(
    "pdf_page_rasterization_all_pages",
    fileToRasterImages(file),
    { fileName: file.name, nonPdf: true },
  );

  incrementCreditPipelineCounter("vision_ocr_requests");
  const visionText = await measureCreditPipelineAwait(
    "ocr_vision_request",
    requestVisionOcrText(images, { fileName: file.name }),
    { pageCount: images.length },
  );

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
      traceCreditPipelineStep("ocr_vision_failed", {
        status: err.status,
        message: err.message,
      });
      console.error("[ocr-strategy] vision OCR failed", { status: err.status, message: err.message });
    }
    throw err;
  }
}
