/**
 * Normalizes a French APE / NAF code to canonical `####L` format.
 * Format-only — no fiscal regime or activity interpretation.
 */
export function normalizeApeCode(raw: string): string | null {
  const compact = raw.replace(/[\s.]/g, "").toUpperCase();
  const match = compact.match(/^(\d{4})([A-Z])$/);
  if (!match?.[1] || !match[2]) return null;
  return `${match[1]}${match[2]}`;
}

export function isCanonicalApeCode(value: string): boolean {
  return normalizeApeCode(value) === value;
}
