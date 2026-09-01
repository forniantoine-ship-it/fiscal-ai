/** Normalize INPI/RNE OCR text for deterministic parsing. */
export function normalizeInpiRneText(rawText: string): string {
  return rawText
    .replace(/\r\n/g, "\n")
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\n--\s*\d+\s+of\s+\d+\s*--\n/gi, "\n")
    .replace(/Page \d+\/\d+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeSiren(value: string): string | undefined {
  const digits = digitsOnly(value);
  return digits.length === 9 ? digits : undefined;
}

export function normalizeSiret(value: string): string | undefined {
  const digits = digitsOnly(value);
  return digits.length === 14 ? digits : undefined;
}

export function normalizeApeCode(value: string): string | undefined {
  const match = value.match(/\b(\d{4}[A-Z])\b/i);
  return match?.[1]?.toUpperCase();
}

export function cleanLabelValue(raw: string, maxLength = 240): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/^[\s:;|–—-]+/, "")
    .replace(/[\s:;|–—-]+$/, "")
    .trim()
    .slice(0, maxLength);
}

export function findLabelValue(text: string, labelPattern: RegExp): { value: string; snippet: string } | null {
  const match = text.match(labelPattern);
  if (!match?.[1]) return null;
  const value = cleanLabelValue(match[1]);
  if (!value) return null;
  return { value, snippet: match[0].trim() };
}

export function splitName(fullName: string): { family: string; given: string } | null {
  const tokens = cleanLabelValue(fullName).split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  return {
    family: tokens[0]!,
    given: tokens.slice(1).join(" "),
  };
}

export function parseMultilineAddress(text: string, startIndex: number): { value: string; snippet: string } | null {
  const slice = text.slice(startIndex);
  const lines = slice.split("\n").map((line) => line.trim());
  const collected: string[] = [];

  for (const line of lines) {
    if (!line) {
      if (collected.length > 0) break;
      continue;
    }
    if (/^Données issues de la reprise/i.test(line)) break;
    if (/^Type d'établissement/i.test(line)) break;
    if (/^Cet établissement a été fermé/i.test(line)) break;
    if (/^Page \d+\/\d+/i.test(line)) break;
    if (/^Inscriptions au RNE/i.test(line)) break;
    if (/^Activité\s*:/i.test(line) && collected.length > 0) break;
    collected.push(line);
    if (collected.length >= 3) break;
  }

  const value = collected.join("\n").trim();
  if (!value) return null;
  return { value, snippet: collected.join(" ") };
}
