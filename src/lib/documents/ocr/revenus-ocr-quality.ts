import { computeOcrQualityMetrics, type OcrQualityMetrics } from "./ocr-quality";

export const REVENUE_OCR_MIN_TEXT_LENGTH = 80;
export const REVENUE_OCR_MIN_NEWLINES = 4;
export const REVENUE_OCR_MIN_DATE_COUNT = 1;
export const REVENUE_OCR_MIN_NUMERIC_ROWS = 2;
export const REVENUE_OCR_MIN_QUALITY_SCORE = 55;
export const REVENUE_OCR_MIN_DIGIT_RATIO = 0.015;

const DATE_PATTERNS = [
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
  /\b\d{4}[/.-]\d{1,2}[/.-]\d{1,2}\b/g,
  /\b\d{1,2}\s+(janv|f[eé]vr|mars|avr|mai|juin|juil|ao[uû]t|sept|oct|nov|d[eé]c)[a-z]*\.?\s+\d{2,4}\b/gi,
];

export type RevenueOcrQualityScore = {
  score: number;
  dateCount: number;
  numericRowCount: number;
  metrics: OcrQualityMetrics;
  ok: boolean;
  reasons: string[];
};

function countDates(text: string): number {
  let total = 0;
  for (const pattern of DATE_PATTERNS) {
    total += text.match(pattern)?.length ?? 0;
  }
  return total;
}

function countNumericRows(text: string): number {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 4 && /\d/.test(line) && !/^(total|solde|cumul|sous[\s-]?total)\b/i.test(line))
    .length;
}

export function scoreRevenueOcrText(text: string): RevenueOcrQualityScore {
  const metrics = computeOcrQualityMetrics(text);
  const dateCount = countDates(text);
  const numericRowCount = countNumericRows(text);
  const reasons: string[] = [];
  let score = 100;

  if (metrics.textLength < REVENUE_OCR_MIN_TEXT_LENGTH) {
    score -= 35;
    reasons.push("too_short");
  }
  if (metrics.newlineCount < REVENUE_OCR_MIN_NEWLINES) {
    score -= 20;
    reasons.push("too_few_lines");
  }
  if (dateCount < REVENUE_OCR_MIN_DATE_COUNT) {
    score -= 25;
    reasons.push("too_few_dates");
  }
  if (numericRowCount < REVENUE_OCR_MIN_NUMERIC_ROWS) {
    score -= 25;
    reasons.push("too_few_numeric_rows");
  }
  if (metrics.digitRatio < REVENUE_OCR_MIN_DIGIT_RATIO) {
    score -= 15;
    reasons.push("low_digit_ratio");
  }
  if (metrics.textLength > 0 && metrics.alphaRatio < 0.05 && metrics.digitRatio < 0.01) {
    score -= 30;
    reasons.push("mostly_empty");
  }

  const ok =
    score >= REVENUE_OCR_MIN_QUALITY_SCORE &&
    metrics.textLength >= REVENUE_OCR_MIN_TEXT_LENGTH &&
    dateCount >= REVENUE_OCR_MIN_DATE_COUNT &&
    numericRowCount >= REVENUE_OCR_MIN_NUMERIC_ROWS;

  return {
    score: Math.max(0, Math.min(100, score)),
    dateCount,
    numericRowCount,
    metrics,
    ok,
    reasons,
  };
}

export function logTextQualityScore(quality: RevenueOcrQualityScore, strategy: string): void {
  console.log("[text-quality-score]", {
    strategy,
    score: quality.score,
    ok: quality.ok,
    dateCount: quality.dateCount,
    numericRowCount: quality.numericRowCount,
    textLength: quality.metrics.textLength,
    newlineCount: quality.metrics.newlineCount,
    digitRatio: quality.metrics.digitRatio,
    reasons: quality.reasons,
  });
}
