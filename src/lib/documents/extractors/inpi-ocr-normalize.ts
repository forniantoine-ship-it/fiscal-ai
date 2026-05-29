const NBSP = /[\u00A0\u2007\u202F\u2028\u2029]/g;
const OCR_NOISE = /[^\S\n\r\t\u0020-\u007E\u00C0-\u024F\u1E00-\u1EFF.,:;@'()\-/]/g;
const MULTI_NL = /\n{3,}/g;

/** Strip accents for fuzzy label comparison (é → e). */
export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalizeForLabelMatch(text: string): string {
  return stripAccents(text).toLowerCase().replace(/\s+/g, " ").trim();
}

export function collapseForLabelMatch(text: string): string {
  return normalizeForLabelMatch(text).replace(/\s+/g, "");
}

/**
 * OCR cleanup before extraction:
 * accents preserved in output lines, noise reduced, broken endings fixed.
 */
export function normalizeOcrText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(NBSP, " ")
    .replace(/[|¦]/g, " ")
    .replace(OCR_NOISE, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/-\n(?=[a-zà-öø-ÿ])/gi, "")
    .replace(MULTI_NL, "\n\n")
    .trim();
}
