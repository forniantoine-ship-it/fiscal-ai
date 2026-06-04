export { preprocessRasterImagesForOcr } from "./preprocess-raster-images";
export {
  logTextQualityScore,
  scoreRevenueOcrText,
  type RevenueOcrQualityScore,
} from "./revenus-ocr-quality";
export {
  resolveRevenueDocumentText,
  resolveRevenueDocumentTextOrThrow,
  REVENUE_OCR_READ_FAILURE_MESSAGE,
  RevenueDocumentOcrFailedError,
  type ResolveRevenueDocumentTextResult,
  type RevenueDocumentTextProvider,
  type RevenueOcrStrategy,
} from "./resolve-revenue-document-text";
export {
  computeOcrQualityMetrics,
  isOcrQualityAcceptable,
  logOcrQuality,
  OCR_FAILURE_MIN_NEWLINE_COUNT,
  OCR_FAILURE_MIN_TEXT_LENGTH,
  type OcrQualityMetrics,
} from "./ocr-quality";
export { extractNativePdfText, isPdfFile } from "./pdf-native-text";
export { fileToRasterImages, type RasterPageImage } from "./pdf-to-images";
export {
  DocumentOcrFailedError,
  NATIVE_PDF_TEXT_MIN_LENGTH,
  OCR_READ_FAILURE_MESSAGE,
  resolveDocumentText,
  resolveDocumentTextOrThrow,
  type DocumentTextExtractionStrategy,
  type DocumentTextProvider,
  type ResolveDocumentTextResult,
  type TextDensityMetrics,
} from "./resolve-document-text";
export {
  DOCUMENT_TEXT_EXTRACTION_DEBUG_PREFIX,
  logDocumentTextExtractionFallback,
  logDocumentTextExtractionSelected,
  logDocumentTextExtractionStage,
} from "./document-text-extraction-debug";
export {
  EFFECTIVELY_EMPTY_MIN_LENGTH,
  PARTIAL_TEXT_MIN_LENGTH,
  isEffectivelyEmpty,
  isNarrativeLegalDocumentHint,
  isSemanticRecoveryEligible,
} from "./semantic-text-recovery";
export {
  requestVisionOcrText,
  VISION_OCR_SYSTEM_PROMPT,
  VisionOcrError,
} from "./vision-ocr";
export { extractVisionOcrTextFromImages } from "./vision-ocr-server";
