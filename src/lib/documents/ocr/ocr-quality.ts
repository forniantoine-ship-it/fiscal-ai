import { countOcrNewlines } from "@/lib/documents/normalizers/normalize-ocr-text";

export const OCR_FAILURE_MIN_TEXT_LENGTH = 100;
export const OCR_FAILURE_MIN_NEWLINE_COUNT = 3;

export type OcrQualityMetrics = {
  textLength: number;
  newlineCount: number;
  alphaRatio: number;
  digitRatio: number;
};

export function computeOcrQualityMetrics(text: string): OcrQualityMetrics {
  const trimmed = text.trim();
  const textLength = trimmed.length;
  const newlineCount = countOcrNewlines(trimmed);

  if (textLength === 0) {
    return { textLength: 0, newlineCount: 0, alphaRatio: 0, digitRatio: 0 };
  }

  let alpha = 0;
  let digits = 0;

  for (const char of trimmed) {
    if (/[a-zA-Zà-ÿÀ-ß]/u.test(char)) alpha++;
    else if (/\d/.test(char)) digits++;
  }

  return {
    textLength,
    newlineCount,
    alphaRatio: alpha / textLength,
    digitRatio: digits / textLength,
  };
}

export function isOcrQualityAcceptable(metrics: OcrQualityMetrics): boolean {
  if (metrics.textLength < OCR_FAILURE_MIN_TEXT_LENGTH) return false;
  if (metrics.newlineCount < OCR_FAILURE_MIN_NEWLINE_COUNT) return false;
  return true;
}

export function logOcrQuality(metrics: OcrQualityMetrics, ok: boolean): void {
  console.log("[ocr-quality]", { ...metrics, ok });
}
