/**
 * Shared deterministic helpers for LMNP charge document parsers.
 */

export type ChargeParseTrace = {
  step: string;
  detail: string;
  value?: string | number | boolean | null;
};

const MONTH_NAMES: Record<string, string> = {
  janvier: "01",
  fevrier: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  aout: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  decembre: "12",
};

export function normalizeChargeOcrText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[''`´]/g, "'")
    .replace(/[""«»]/g, " ")
    .replace(/€/g, " EUR ")
    .replace(/[\u00a0\t\r]+/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses French-formatted currency (1 234,56 €) into euros.
 * Rejects malformed or out-of-range values.
 */
export function parseFrenchCurrencyAmount(
  raw: string,
  options?: { min?: number; max?: number },
): number | null {
  const min = options?.min ?? 1;
  const max = options?.max ?? 100_000;

  let cleaned = raw
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/eur/g, "")
    .replace(/€/g, "")
    .trim();

  if (!cleaned || /[a-z]{2,}/.test(cleaned.replace(/[.,\d]/g, ""))) {
    return null;
  }

  const frenchMatch = cleaned.match(/^(\d{1,3}(?:\.\d{3})*|\d+),(\d{1,2})$/);
  if (frenchMatch) {
    const whole = frenchMatch[1]!.replace(/\./g, "");
    const cents = frenchMatch[2]!;
    const value = Number.parseFloat(`${whole}.${cents}`);
    if (!Number.isFinite(value) || value < min || value > max) return null;
    return Math.round(value * 100) / 100;
  }

  const spacedMatch = cleaned.match(/^(\d{1,3}(?:\d{3})*),(\d{1,2})$/);
  if (spacedMatch) {
    const value = Number.parseFloat(`${spacedMatch[1]}.${spacedMatch[2]}`);
    if (!Number.isFinite(value) || value < min || value > max) return null;
    return Math.round(value * 100) / 100;
  }

  const dotMatch = cleaned.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (dotMatch) {
    const value = Number.parseFloat(
      dotMatch[2] ? `${dotMatch[1]}.${dotMatch[2]}` : dotMatch[1]!,
    );
    if (!Number.isFinite(value) || value < min || value > max) return null;
    return Math.round(value * 100) / 100;
  }

  return null;
}

function padDateParts(day: string, month: string, year: string): string | null {
  const d = Number.parseInt(day, 10);
  const m = Number.parseInt(month, 10);
  const y = Number.parseInt(year, 10);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1990 || y > 2100) return null;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/**
 * Normalizes a date fragment to DD/MM/YYYY.
 */
export function normalizeChargeDateValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const numeric = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (numeric) {
    let year = numeric[3]!;
    if (year.length === 2) {
      year = Number.parseInt(year, 10) >= 70 ? `19${year}` : `20${year}`;
    }
    return padDateParts(numeric[1]!, numeric[2]!, year);
  }

  const textual = trimmed.match(
    /^(\d{1,2})\s+(janvier|fevrier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})$/i,
  );
  if (textual) {
    const month = MONTH_NAMES[textual[2]!.toLowerCase()];
    if (!month) return null;
    return padDateParts(textual[1]!, month, textual[3]!);
  }

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const normalizedDate = padDateParts(iso[3]!, iso[2]!, iso[1]!);
    console.log("[charges-date-normalization]", {
      input: trimmed,
      detectedFormat: "iso",
      normalizedDate,
    });
    return normalizedDate;
  }

  return null;
}

export function logChargeParserTraces(
  parser: string,
  traces: ChargeParseTrace[],
  summary: Record<string, unknown>,
): void {
  console.log(`[${parser}] summary`, summary);
  console.log(`[${parser}] traces`, traces);
}
