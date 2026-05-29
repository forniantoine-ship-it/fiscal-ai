/**
 * Canonical OCR normalization — preserves line/paragraph structure for extractors.
 */

const NBSP = /[\u00A0\u2007\u202F\u2028\u2029]/g;
const OCR_NOISE = /[^\S\n\r\t\u0020-\u007E\u00C0-\u024F\u1E00-\u1EFF.,:;@'()\-/]/g;
const MULTI_NL = /\n{3,}/g;

/** Collapse duplicate spaces/tabs within a single line — never touches newlines. */
export function normalizeInlineWhitespace(line: string): string {
  return line.replace(/[ \t]+/g, " ").trim();
}

/**
 * Normalizes OCR output while preserving multiline layout:
 * line breaks, blank lines (paragraph gaps), and label/value rows stay intact.
 */
export function normalizeOcrText(raw: string): string {
  const unified = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(NBSP, " ")
    .replace(/[|¦]/g, " ")
    .replace(OCR_NOISE, " ")
    .replace(/-\n(?=[a-zà-öø-ÿ])/gi, "");

  const lines = unified.split("\n").map((line) => normalizeInlineWhitespace(line));

  return lines
    .join("\n")
    .replace(MULTI_NL, "\n\n")
    .trim();
}

export function truncateOcrText(raw: string, maxLength = 24_000): string {
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, maxLength)}\n[truncated]`;
}

export function countOcrNewlines(text: string): number {
  return (text.match(/\n/g) ?? []).length;
}

export const OCR_NORMALIZATION_PREVIEW_LENGTH = 1000;

export function logOcrNormalizationStructure(params: {
  runId?: string;
  before: string;
  after: string;
}): void {
  console.log("[runtime] ocr normalization structure", {
    runId: params.runId ?? null,
    lengthBefore: params.before.length,
    lengthAfter: params.after.length,
    newlineCountBefore: countOcrNewlines(params.before),
    newlineCountAfter: countOcrNewlines(params.after),
    previewBefore: params.before.slice(0, OCR_NORMALIZATION_PREVIEW_LENGTH),
    previewAfter: params.after.slice(0, OCR_NORMALIZATION_PREVIEW_LENGTH),
    normalizer: "documents/normalizers/normalize-ocr-text.ts",
  });
}
