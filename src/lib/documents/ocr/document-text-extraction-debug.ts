/**
 * Runtime diagnostics for multi-stage document text extraction.
 */

export const DOCUMENT_TEXT_EXTRACTION_DEBUG_PREFIX = "[document-text-extraction-debug]";

export function logDocumentTextExtractionStage(
  stage: string,
  detail: Record<string, unknown> = {},
): void {
  console.log(DOCUMENT_TEXT_EXTRACTION_DEBUG_PREFIX, { stage, ...detail });
}

export function logDocumentTextExtractionSelected(params: {
  strategy: string;
  provider: string;
  nativeTextPath: boolean;
  ocrPath: boolean;
  fallbackActivated: boolean;
  partialTextRecovery: boolean;
  semanticRecoveryEligible: boolean;
  density: {
    textLength: number;
    pageCount: number;
    charsPerPage: number;
    newlinesPerPage: number;
    alphaRatio: number;
    digitRatio: number;
  };
  fallbackReason?: string;
  strategiesAttempted: string[];
}): void {
  console.log(DOCUMENT_TEXT_EXTRACTION_DEBUG_PREFIX, {
    stage: "selected",
    strategy: params.strategy,
    provider: params.provider,
    nativeTextPath: params.nativeTextPath,
    ocrPath: params.ocrPath,
    fallbackActivated: params.fallbackActivated,
    partialTextRecovery: params.partialTextRecovery,
    semanticRecoveryEligible: params.semanticRecoveryEligible,
    textLength: params.density.textLength,
    pageCount: params.density.pageCount,
    charsPerPage: params.density.charsPerPage,
    newlinesPerPage: params.density.newlinesPerPage,
    alphaRatio: params.density.alphaRatio,
    digitRatio: params.density.digitRatio,
    fallbackReason: params.fallbackReason ?? null,
    strategiesAttempted: params.strategiesAttempted,
  });
}

export function logDocumentTextExtractionFallback(params: {
  from: string;
  reason: string;
  textLength?: number;
  qualityOk?: boolean;
}): void {
  console.log(DOCUMENT_TEXT_EXTRACTION_DEBUG_PREFIX, {
    stage: "fallback",
    from: params.from,
    reason: params.reason,
    textLength: params.textLength ?? null,
    qualityOk: params.qualityOk ?? null,
  });
}
