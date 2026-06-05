import { normalizeOcrText } from "@/lib/documents/normalizers";
import {
  incrementCreditPipelineCounter,
  measureCreditPipelineAwait,
  measureCreditPipelineSync,
  traceCreditPipelineStep,
} from "@/lib/lmnp/services/credit-pipeline-timing";
import {
  logDocumentTextExtractionFallback,
  logDocumentTextExtractionSelected,
  logDocumentTextExtractionStage,
} from "@/lib/documents/ocr/document-text-extraction-debug";
import {
  computeOcrQualityMetrics,
  isOcrQualityAcceptable,
  logOcrQuality,
  type OcrQualityMetrics,
} from "@/lib/documents/ocr/ocr-quality";
import { extractNativePdfText, isPdfFile } from "@/lib/documents/ocr/pdf-native-text";
import { preprocessRasterImagesForOcr } from "@/lib/documents/ocr/preprocess-raster-images";
import { fileToRasterImages } from "@/lib/documents/ocr/pdf-to-images";
import {
  detectInvalidCorpus,
  logInvalidCorpusDebug,
  sanitizeCorpusText,
} from "@/lib/documents/ocr/invalid-corpus-detection";
import {
  isEffectivelyEmpty,
  isSemanticRecoveryEligible,
} from "@/lib/documents/ocr/semantic-text-recovery";
import { requestVisionOcrText, VisionOcrError } from "@/lib/documents/ocr/vision-ocr";

export const NATIVE_PDF_TEXT_MIN_LENGTH = 300;

export type DocumentTextExtractionStrategy =
  | "native_pdf"
  | "vision_ocr"
  | "vision_ocr_preprocessed"
  | "partial_semantic_recovery";

export type DocumentTextProvider = "pdf_text" | "vision_ocr" | "vision_ocr_preprocessed";

export type TextDensityMetrics = {
  textLength: number;
  pageCount: number;
  charsPerPage: number;
  newlinesPerPage: number;
  alphaRatio: number;
  digitRatio: number;
};

export type ResolveDocumentTextResult = {
  rawText: string;
  provider: DocumentTextProvider;
  strategy: DocumentTextExtractionStrategy;
  quality: OcrQualityMetrics;
  density: TextDensityMetrics;
  ok: boolean;
  pageCount: number;
  fallbackReason?: string;
  fallbackActivated: boolean;
  partialTextRecovery: boolean;
  semanticRecoveryEligible: boolean;
  strategiesAttempted: DocumentTextExtractionStrategy[];
};

export class DocumentOcrFailedError extends Error {
  readonly metrics: OcrQualityMetrics;
  readonly provider: DocumentTextProvider;
  readonly strategy: DocumentTextExtractionStrategy;

  constructor(
    message: string,
    params: {
      metrics: OcrQualityMetrics;
      provider: DocumentTextProvider;
      strategy: DocumentTextExtractionStrategy;
    },
  ) {
    super(message);
    this.name = "DocumentOcrFailedError";
    this.metrics = params.metrics;
    this.provider = params.provider;
    this.strategy = params.strategy;
  }
}

export const OCR_READ_FAILURE_MESSAGE =
  "Nous n'avons pas réussi à lire correctement ce document. Essayez un PDF plus net ou une photo plus lisible.";

function computeTextDensity(text: string, pageCount: number): TextDensityMetrics {
  const quality = computeOcrQualityMetrics(text);
  const safePageCount = Math.max(1, pageCount);
  return {
    textLength: quality.textLength,
    pageCount: safePageCount,
    charsPerPage: quality.textLength / safePageCount,
    newlinesPerPage: quality.newlineCount / safePageCount,
    alphaRatio: quality.alphaRatio,
    digitRatio: quality.digitRatio,
  };
}

function isNativeTextSufficient(text: string, pageCount: number): boolean {
  const quality = computeOcrQualityMetrics(text);
  if (quality.textLength >= NATIVE_PDF_TEXT_MIN_LENGTH) return true;
  if (quality.textLength >= 150 && isOcrQualityAcceptable(quality)) return true;
  const density = computeTextDensity(text, pageCount);
  return density.charsPerPage >= 120 && quality.alphaRatio >= 0.2;
}

type AttemptResult = ResolveDocumentTextResult;

function finalizeAttempt(params: {
  rawText: string;
  provider: DocumentTextProvider;
  strategy: DocumentTextExtractionStrategy;
  pageCount: number;
  fallbackReason?: string;
  fallbackActivated: boolean;
  strategiesAttempted: DocumentTextExtractionStrategy[];
  fileName?: string;
}): AttemptResult {
  const sanitizedRaw = sanitizeCorpusText(params.rawText, params.provider, {
    stage: params.strategy,
    fileName: params.fileName,
  });
  const normalized = normalizeOcrText(sanitizedRaw);
  const quality = computeOcrQualityMetrics(normalized);
  const density = computeTextDensity(normalized, params.pageCount);
  const qualityOk = isOcrQualityAcceptable(quality);
  const semanticRecoveryEligible = isSemanticRecoveryEligible(normalized, params.fileName);

  logOcrQuality(quality, qualityOk);

  return {
    rawText: normalized,
    provider: params.provider,
    strategy: params.strategy,
    quality,
    density,
    ok: qualityOk,
    pageCount: params.pageCount,
    fallbackReason: params.fallbackReason,
    fallbackActivated: params.fallbackActivated,
    partialTextRecovery: !qualityOk && semanticRecoveryEligible,
    semanticRecoveryEligible,
    strategiesAttempted: params.strategiesAttempted,
  };
}

function pickBestAttempt(attempts: AttemptResult[]): AttemptResult | null {
  const viable = attempts.filter((attempt) => !isEffectivelyEmpty(attempt.rawText));
  if (!viable.length) return null;

  return [...viable].sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    if (a.semanticRecoveryEligible !== b.semanticRecoveryEligible) {
      return a.semanticRecoveryEligible ? -1 : 1;
    }
    return b.density.textLength - a.density.textLength;
  })[0] ?? null;
}

function logSelectedResult(result: AttemptResult): void {
  logDocumentTextExtractionSelected({
    strategy: result.strategy,
    provider: result.provider,
    nativeTextPath: result.strategy === "native_pdf",
    ocrPath: result.strategy !== "native_pdf",
    fallbackActivated: result.fallbackActivated,
    partialTextRecovery: result.partialTextRecovery,
    semanticRecoveryEligible: result.semanticRecoveryEligible,
    density: result.density,
    fallbackReason: result.fallbackReason,
    strategiesAttempted: result.strategiesAttempted,
  });
}

/**
 * Multi-stage document text resolution:
 * 1. Native PDF text (skip OCR when density is sufficient)
 * 2. Primary vision OCR
 * 3. Preprocessed vision OCR fallback
 * 4. Partial-text semantic recovery (best non-empty attempt)
 */
export async function resolveDocumentText(
  file: File,
): Promise<ResolveDocumentTextResult> {
  logDocumentTextExtractionStage("start", {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });

  traceCreditPipelineStep("ocr_strategy_start", {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });

  const attempts: AttemptResult[] = [];
  const strategiesAttempted: DocumentTextExtractionStrategy[] = [];
  let nativeText = "";

  if (isPdfFile(file)) {
    const native = await measureCreditPipelineAwait(
      "pdf_native_text_extraction",
      extractNativePdfText(file),
      { fileName: file.name },
    );
    nativeText = native.text;

    if (nativeText.length > 0) {
      strategiesAttempted.push("native_pdf");
      const nativeAttempt = finalizeAttempt({
        rawText: nativeText,
        provider: "pdf_text",
        strategy: "native_pdf",
        pageCount: native.pageCount,
        fallbackActivated: false,
        strategiesAttempted: [...strategiesAttempted],
        fileName: file.name,
      });
      attempts.push(nativeAttempt);

      if (isNativeTextSufficient(nativeText, native.pageCount)) {
        traceCreditPipelineStep("ocr_strategy_native_pdf_sufficient", {
          textLength: nativeText.length,
          threshold: NATIVE_PDF_TEXT_MIN_LENGTH,
          charsPerPage: nativeAttempt.density.charsPerPage,
        });
        logSelectedResult({ ...nativeAttempt, ok: true });
        return nativeAttempt;
      }

      logDocumentTextExtractionFallback({
        from: "native_pdf",
        reason:
          nativeText.length <= NATIVE_PDF_TEXT_MIN_LENGTH
            ? "native_pdf_below_threshold"
            : "native_pdf_density_insufficient",
        textLength: nativeText.length,
        qualityOk: nativeAttempt.ok,
      });
    } else {
      logDocumentTextExtractionFallback({
        from: "native_pdf",
        reason: "native_pdf_empty",
        textLength: 0,
      });
    }
  }

  const images = await measureCreditPipelineAwait(
    "pdf_page_rasterization_all_pages",
    fileToRasterImages(file),
    { fileName: file.name },
  );

  // Stage 2: primary vision OCR
  try {
    incrementCreditPipelineCounter("vision_ocr_requests");
    strategiesAttempted.push("vision_ocr");
    const visionTextRaw = await measureCreditPipelineAwait(
      "ocr_vision_request",
      requestVisionOcrText(images, { fileName: file.name }),
      { pageCount: images.length },
    );
    const visionText = sanitizeCorpusText(visionTextRaw, "vision_ocr", {
      stage: "vision_ocr_pre_merge",
      fileName: file.name,
    });

    const combined = measureCreditPipelineSync(
      "ocr_native_vision_text_merge",
      () => [nativeText, visionText].filter(Boolean).join("\n\n"),
      { nativeLength: nativeText.length, visionLength: visionText.length },
    );

    const visionAttempt = finalizeAttempt({
      rawText: combined || visionText,
      provider: "vision_ocr",
      strategy: "vision_ocr",
      pageCount: images.length,
      fallbackReason: nativeText ? "native_pdf_insufficient" : "non_pdf_or_empty_native",
      fallbackActivated: Boolean(nativeText),
      strategiesAttempted: [...strategiesAttempted],
      fileName: file.name,
    });
    attempts.push(visionAttempt);

    if (visionAttempt.ok) {
      logSelectedResult(visionAttempt);
      return visionAttempt;
    }

    logDocumentTextExtractionFallback({
      from: "vision_ocr",
      reason: "vision_ocr_quality_insufficient",
      textLength: visionAttempt.density.textLength,
      qualityOk: false,
    });
  } catch (err) {
    logDocumentTextExtractionFallback({
      from: "vision_ocr",
      reason: err instanceof VisionOcrError ? `vision_error_${err.status}` : "vision_error",
      textLength: 0,
    });
    if (err instanceof VisionOcrError) {
      traceCreditPipelineStep("ocr_vision_failed", {
        status: err.status,
        message: err.message,
      });
    }
  }

  // Stage 3: preprocessed vision OCR fallback
  try {
    incrementCreditPipelineCounter("vision_ocr_requests");
    strategiesAttempted.push("vision_ocr_preprocessed");
    const preprocessed = await preprocessRasterImagesForOcr(images);
    const preprocessedTextRaw = await measureCreditPipelineAwait(
      "ocr_vision_preprocessed_request",
      requestVisionOcrText(preprocessed, { fileName: `${file.name} (preprocessed)` }),
      { pageCount: preprocessed.length },
    );
    const preprocessedText = sanitizeCorpusText(preprocessedTextRaw, "vision_ocr_preprocessed", {
      stage: "vision_ocr_preprocessed_pre_merge",
      fileName: file.name,
    });

    const combined = measureCreditPipelineSync(
      "ocr_native_preprocessed_text_merge",
      () => [nativeText, preprocessedText].filter(Boolean).join("\n\n"),
      { nativeLength: nativeText.length, visionLength: preprocessedText.length },
    );

    const preprocessedAttempt = finalizeAttempt({
      rawText: combined || preprocessedText,
      provider: "vision_ocr_preprocessed",
      strategy: "vision_ocr_preprocessed",
      pageCount: images.length,
      fallbackReason: "vision_ocr_quality_insufficient",
      fallbackActivated: true,
      strategiesAttempted: [...strategiesAttempted],
      fileName: file.name,
    });
    attempts.push(preprocessedAttempt);

    if (preprocessedAttempt.ok) {
      logSelectedResult(preprocessedAttempt);
      return preprocessedAttempt;
    }

    logDocumentTextExtractionFallback({
      from: "vision_ocr_preprocessed",
      reason: "preprocessed_vision_quality_insufficient",
      textLength: preprocessedAttempt.density.textLength,
      qualityOk: false,
    });
  } catch (err) {
    logDocumentTextExtractionFallback({
      from: "vision_ocr_preprocessed",
      reason:
        err instanceof VisionOcrError
          ? `preprocessed_vision_error_${err.status}`
          : "preprocessed_vision_error",
      textLength: 0,
    });
  }

  // Stage 4: partial-text semantic recovery — return best non-empty attempt
  const best = pickBestAttempt(attempts);
  if (best) {
    const invalidBest = detectInvalidCorpus(best.rawText);
    if (invalidBest.invalidCorpusDetected) {
      logInvalidCorpusDebug({
        invalidCorpusDetected: true,
        rejectionReason: invalidBest.rejectionReason,
        rejectedCorpusPreview: best.rawText,
        providerSource: best.provider,
        originalLength: best.rawText.length,
        stage: "partial_semantic_recovery_blocked",
        fileName: file.name,
      });
    } else if (
      !isEffectivelyEmpty(best.rawText) &&
      (best.semanticRecoveryEligible || best.density.textLength >= 40)
    ) {
      strategiesAttempted.push("partial_semantic_recovery");
      const recoveryResult: ResolveDocumentTextResult = {
        ...best,
        strategy: "partial_semantic_recovery",
        partialTextRecovery: true,
        ok: best.ok || best.semanticRecoveryEligible,
        fallbackReason: best.fallbackReason ?? "partial_semantic_recovery",
        fallbackActivated: true,
        strategiesAttempted: [...strategiesAttempted],
      };
      logDocumentTextExtractionStage("partial_semantic_recovery", {
        fileName: file.name,
        textLength: recoveryResult.density.textLength,
        semanticRecoveryEligible: recoveryResult.semanticRecoveryEligible,
        originalStrategy: best.strategy,
      });
      logSelectedResult(recoveryResult);
      return recoveryResult;
    }
  }

  // Stage 5: hard failure — all strategies exhausted, corpus effectively empty
  const failureMetrics = computeOcrQualityMetrics(best?.rawText ?? "");
  logDocumentTextExtractionStage("hard_failure", {
    fileName: file.name,
    textLength: failureMetrics.textLength,
    strategiesAttempted,
    bestStrategy: best?.strategy ?? null,
  });

  throw new DocumentOcrFailedError(OCR_READ_FAILURE_MESSAGE, {
    metrics: failureMetrics,
    provider: best?.provider ?? "vision_ocr",
    strategy: best?.strategy ?? "vision_ocr",
  });
}

/**
 * Resolves document text with resilient fallback chain.
 * Throws only when all strategies fail and the corpus is effectively empty.
 */
export async function resolveDocumentTextOrThrow(
  file: File,
): Promise<ResolveDocumentTextResult> {
  try {
    return await resolveDocumentText(file);
  } catch (err) {
    if (err instanceof DocumentOcrFailedError) throw err;
    if (err instanceof VisionOcrError) {
      traceCreditPipelineStep("ocr_vision_failed", {
        status: err.status,
        message: err.message,
      });
      console.error("[document-text-extraction-debug]", {
        stage: "unhandled_vision_error",
        status: err.status,
        message: err.message,
      });
    }
    throw err;
  }
}
