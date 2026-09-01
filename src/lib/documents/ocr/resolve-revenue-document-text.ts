import { normalizeOcrText } from "@/lib/documents/normalizers";

import { extractNativePdfText, isPdfFile } from "./pdf-native-text";
import {
  logTextQualityScore,
  scoreRevenueOcrText,
  type RevenueOcrQualityScore,
} from "./revenus-ocr-quality";
import { preprocessRasterImagesForOcr } from "./preprocess-raster-images";
import { fileToRasterImages } from "./pdf-to-images";
import { NATIVE_PDF_TEXT_MIN_LENGTH } from "./resolve-document-text";
import { requestVisionOcrText, VisionOcrError } from "./vision-ocr";

export type RevenueOcrStrategy = "native_pdf" | "vision_ocr" | "vision_ocr_preprocessed";

export type RevenueDocumentTextProvider = "pdf_text" | "vision_ocr" | "vision_ocr_preprocessed";

export type ResolveRevenueDocumentTextResult = {
  rawText: string;
  provider: RevenueDocumentTextProvider;
  strategy: RevenueOcrStrategy;
  quality: RevenueOcrQualityScore;
  ok: boolean;
  pageCount: number;
  fallbackReason?: string;
};

export class RevenueDocumentOcrFailedError extends Error {
  readonly quality: RevenueOcrQualityScore;
  readonly provider: RevenueDocumentTextProvider;
  readonly strategy: RevenueOcrStrategy;

  constructor(
    message: string,
    params: {
      quality: RevenueOcrQualityScore;
      provider: RevenueDocumentTextProvider;
      strategy: RevenueOcrStrategy;
    },
  ) {
    super(message);
    this.name = "RevenueDocumentOcrFailedError";
    this.quality = params.quality;
    this.provider = params.provider;
    this.strategy = params.strategy;
  }
}

export const REVENUE_OCR_READ_FAILURE_MESSAGE =
  "Nous n'avons pas réussi à lire correctement ce document PDF. Essayez un fichier plus net, un export bancaire texte, ou saisissez vos revenus manuellement.";

function logOcrStrategy(stage: string, detail: Record<string, unknown> = {}): void {
  console.log("[ocr-strategy]", { stage, ...detail });
}

function logOcrProvider(provider: RevenueDocumentTextProvider, strategy: RevenueOcrStrategy): void {
  console.log("[ocr-provider]", { provider, strategy });
}

function logOcrFallback(from: RevenueOcrStrategy, reason: string, quality: RevenueOcrQualityScore): void {
  console.log("[ocr-fallback]", {
    from,
    reason,
    score: quality.score,
    reasons: quality.reasons,
  });
}

function finalizeAttempt(params: {
  rawText: string;
  provider: RevenueDocumentTextProvider;
  strategy: RevenueOcrStrategy;
  pageCount: number;
  fallbackReason?: string;
}): ResolveRevenueDocumentTextResult {
  const normalized = normalizeOcrText(params.rawText);
  const quality = scoreRevenueOcrText(normalized);

  logTextQualityScore(quality, params.strategy);
  logOcrProvider(params.provider, params.strategy);

  return {
    rawText: normalized,
    provider: params.provider,
    strategy: params.strategy,
    quality,
    ok: quality.ok,
    pageCount: params.pageCount,
    fallbackReason: params.fallbackReason,
  };
}

function pickBestAttempt(
  attempts: ResolveRevenueDocumentTextResult[],
): ResolveRevenueDocumentTextResult | null {
  if (!attempts.length) return null;
  return [...attempts].sort((a, b) => b.quality.score - a.quality.score)[0] ?? null;
}

/**
 * Multi-strategy OCR for Revenus documents:
 * 1. native PDF text
 * 2. vision OCR
 * 3. preprocessed vision OCR
 */
export async function resolveRevenueDocumentText(
  file: File,
): Promise<ResolveRevenueDocumentTextResult> {
  logOcrStrategy("start", {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });

  const attempts: ResolveRevenueDocumentTextResult[] = [];
  let nativeText = "";

  if (isPdfFile(file)) {
    const native = await extractNativePdfText(file);
    nativeText = native.text;

    if (nativeText.length > 0) {
      const nativeAttempt = finalizeAttempt({
        rawText: nativeText,
        provider: "pdf_text",
        strategy: "native_pdf",
        pageCount: native.pageCount,
      });
      attempts.push(nativeAttempt);
      if (nativeAttempt.ok) {
        logOcrStrategy("selected", { strategy: "native_pdf", score: nativeAttempt.quality.score });
        return nativeAttempt;
      }
      logOcrFallback(
        "native_pdf",
        nativeText.length <= NATIVE_PDF_TEXT_MIN_LENGTH
          ? "native_pdf_below_threshold"
          : "native_pdf_quality_insufficient",
        nativeAttempt.quality,
      );
    } else {
      logOcrFallback("native_pdf", "native_pdf_empty", scoreRevenueOcrText(""));
    }
  }

  const images = await fileToRasterImages(file);

  try {
    const visionText = await requestVisionOcrText(images, { fileName: file.name });
    const combined = [nativeText, visionText].filter(Boolean).join("\n\n");
    const visionAttempt = finalizeAttempt({
      rawText: combined || visionText,
      provider: "vision_ocr",
      strategy: "vision_ocr",
      pageCount: images.length,
      fallbackReason: nativeText ? "native_pdf_quality_insufficient" : "non_pdf_or_empty_native",
    });
    attempts.push(visionAttempt);
    if (visionAttempt.ok) {
      logOcrStrategy("selected", { strategy: "vision_ocr", score: visionAttempt.quality.score });
      return visionAttempt;
    }
    logOcrFallback("vision_ocr", "vision_ocr_quality_insufficient", visionAttempt.quality);
  } catch (err) {
    logOcrFallback(
      "vision_ocr",
      err instanceof VisionOcrError ? `vision_error_${err.status}` : "vision_error",
      scoreRevenueOcrText(""),
    );
  }

  try {
    const preprocessed = await preprocessRasterImagesForOcr(images);
    const preprocessedText = await requestVisionOcrText(preprocessed, {
      fileName: `${file.name} (preprocessed)`,
    });
    const combined = [nativeText, preprocessedText].filter(Boolean).join("\n\n");
    const preprocessedAttempt = finalizeAttempt({
      rawText: combined || preprocessedText,
      provider: "vision_ocr_preprocessed",
      strategy: "vision_ocr_preprocessed",
      pageCount: images.length,
      fallbackReason: "vision_ocr_quality_insufficient",
    });
    attempts.push(preprocessedAttempt);
    if (preprocessedAttempt.ok) {
      logOcrStrategy("selected", {
        strategy: "vision_ocr_preprocessed",
        score: preprocessedAttempt.quality.score,
      });
      return preprocessedAttempt;
    }
    logOcrFallback(
      "vision_ocr_preprocessed",
      "preprocessed_vision_quality_insufficient",
      preprocessedAttempt.quality,
    );
  } catch (err) {
    logOcrFallback(
      "vision_ocr_preprocessed",
      err instanceof VisionOcrError ? `preprocessed_vision_error_${err.status}` : "preprocessed_vision_error",
      scoreRevenueOcrText(""),
    );
  }

  const best = pickBestAttempt(attempts);
  if (best) {
    logOcrStrategy("best_effort_rejected", {
      strategy: best.strategy,
      score: best.quality.score,
      reasons: best.quality.reasons,
    });
    throw new RevenueDocumentOcrFailedError(REVENUE_OCR_READ_FAILURE_MESSAGE, {
      quality: best.quality,
      provider: best.provider,
      strategy: best.strategy,
    });
  }

  throw new RevenueDocumentOcrFailedError(REVENUE_OCR_READ_FAILURE_MESSAGE, {
    quality: scoreRevenueOcrText(""),
    provider: "vision_ocr",
    strategy: "vision_ocr",
  });
}

export async function resolveRevenueDocumentTextOrThrow(
  file: File,
): Promise<ResolveRevenueDocumentTextResult> {
  return resolveRevenueDocumentText(file);
}
