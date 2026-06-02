/**
 * Experimental local parser for loan amortization tables (OCR text).
 * Not wired into the GPT credit pipeline — feasibility probe only.
 */

const LOG_PREFIX = "[local-amortization-parser]";

export type ParsedInstallment = {
  date?: string;
  payment?: number;
  principal?: number;
  interest?: number;
  insurance?: number;
  remainingCapital?: number;
};

export type ParseAmortizationResult = {
  confidenceScore: number;
  installmentCount: number;
  sampleInstallments: ParsedInstallment[];
};

/** OCR shape stats for manual benchmarks (not used in production). */
export type AmortizationOcrDiagnostics = {
  lineCount: number;
  dateRowsCount: number;
  monetaryColumnsCount: number;
};

export function diagnoseAmortizationOcr(ocrText: string): AmortizationOcrDiagnostics {
  const lines = splitLines(ocrText);
  let dateRowsCount = 0;
  const amountCounts: number[] = [];

  for (const line of lines) {
    if (extractDateFromLine(line)) dateRowsCount += 1;
    if (!isProbableInstallmentRow(line)) continue;
    amountCounts.push(extractMonetaryValuesFromLine(line).length);
  }

  return {
    lineCount: lines.length,
    dateRowsCount,
    monetaryColumnsCount: mode(amountCounts),
  };
}

const FRENCH_MONTHS: Record<string, string> = {
  janvier: "01",
  fevrier: "02",
  février: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  aout: "08",
  août: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  decembre: "12",
  décembre: "12",
};

function normalizeOcrText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\u00a0\t\r]+/g, " ")
    .replace(/€/g, " € ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLines(ocrText: string): string[] {
  return ocrText
    .split(/\n+/)
    .map((line) => normalizeOcrText(line))
    .filter((line) => line.length > 0);
}

function tokenizeLine(line: string): string[] {
  return coalesceSplitThousandTokens(line.split(/\s+/).filter(Boolean));
}

/** OCR often splits French thousands: "185 420,50" → one amount. */
function coalesceSplitThousandTokens(tokens: string[]): string[] {
  const merged: string[] = [];
  let index = 0;

  while (index < tokens.length) {
    const current = tokens[index]!;
    const next = tokens[index + 1];

    if (
      next &&
      /^\d{1,3}$/.test(current) &&
      /^\d{1,3},\d{2}$/.test(next) &&
      !isLikelyDateToken(current)
    ) {
      merged.push(`${current}${next}`);
      index += 2;
      continue;
    }

    merged.push(current);
    index += 1;
  }

  return merged;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function isLikelyDateToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 32) return false;

  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(trimmed)) return true;
  if (/^\d{4}[/.-]\d{1,2}[/.-]\d{1,2}$/.test(trimmed)) return true;

  const lower = trimmed.toLowerCase();
  for (const month of Object.keys(FRENCH_MONTHS)) {
    if (lower.includes(month)) {
      return /\d/.test(trimmed);
    }
  }

  const compact = digitsOnly(trimmed);
  if (compact.length === 8) {
    const day = Number.parseInt(compact.slice(0, 2), 10);
    const month = Number.parseInt(compact.slice(2, 4), 10);
    const year = Number.parseInt(compact.slice(4, 8), 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1990 && year <= 2100) {
      return true;
    }
  }

  return false;
}

function normalizeDateToken(token: string): string | undefined {
  const trimmed = token.trim();
  if (!trimmed) return undefined;

  const numeric = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (numeric) {
    let year = numeric[3]!;
    if (year.length === 2) {
      year = Number.parseInt(year, 10) >= 70 ? `19${year}` : `20${year}`;
    }
    const day = Number.parseInt(numeric[1]!, 10);
    const month = Number.parseInt(numeric[2]!, 10);
    const y = Number.parseInt(year, 10);
    if (day < 1 || day > 31 || month < 1 || month > 12 || y < 1990 || y > 2100) return undefined;
    return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${y}`;
  }

  const iso = trimmed.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (iso) {
    const y = Number.parseInt(iso[1]!, 10);
    const month = Number.parseInt(iso[2]!, 10);
    const day = Number.parseInt(iso[3]!, 10);
    if (day < 1 || day > 31 || month < 1 || month > 12 || y < 1990 || y > 2100) return undefined;
    return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${y}`;
  }

  const textual = trimmed.match(
    /^(\d{1,2})\s+([a-zéû]+)\s+(\d{4})$/i,
  );
  if (textual) {
    const monthKey = textual[2]!
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    const month = FRENCH_MONTHS[monthKey];
    if (!month) return undefined;
    const day = Number.parseInt(textual[1]!, 10);
    const y = Number.parseInt(textual[3]!, 10);
    if (day < 1 || day > 31 || y < 1990 || y > 2100) return undefined;
    return `${String(day).padStart(2, "0")}/${month}/${y}`;
  }

  const compact = digitsOnly(trimmed);
  if (compact.length === 8) {
    const day = Number.parseInt(compact.slice(0, 2), 10);
    const month = Number.parseInt(compact.slice(2, 4), 10);
    const year = Number.parseInt(compact.slice(4, 8), 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1990 && year <= 2100) {
      return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
    }
  }

  return undefined;
}

function extractDateFromLine(line: string): string | undefined {
  for (const token of tokenizeLine(line)) {
    if (!isLikelyDateToken(token)) continue;
    const normalized = normalizeDateToken(token);
    if (normalized) return normalized;
  }
  return undefined;
}

function looksLikeMonetaryToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed || !/\d/.test(trimmed)) return false;
  if (isLikelyDateToken(trimmed)) return false;

  const hasCommaDecimals = /,\d{1,2}\b/.test(trimmed) || /,\d{1,2}$/.test(trimmed);
  const hasDotDecimals = /\.\d{1,2}\b/.test(trimmed);
  const hasCurrency = /€|eur/i.test(trimmed);
  const digits = digitsOnly(trimmed);

  if (hasCurrency || hasCommaDecimals || hasDotDecimals) return true;

  if (digits.length >= 2 && digits.length <= 12) {
    const asNumber = parseFrenchAmount(trimmed);
    return asNumber !== null && asNumber > 0;
  }

  return false;
}

/**
 * Parses French-formatted amounts (spaces as thousands, comma decimals).
 * Permissive bounds for amortization tables (remaining capital can be large).
 */
function parseFrenchAmount(raw: string): number | null {
  let cleaned = raw
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/eur/g, "")
    .replace(/€/g, "")
    .trim();

  if (!cleaned || /[a-z]{2,}/.test(cleaned.replace(/[.,\d-]/g, ""))) {
    return null;
  }

  const negative = cleaned.startsWith("-");
  if (negative) cleaned = cleaned.slice(1);

  const frenchComma = cleaned.match(/^(\d{1,3}(?:\.\d{3})*|\d+),(\d{1,2})$/);
  if (frenchComma) {
    const whole = frenchComma[1]!.replace(/\./g, "");
    const value = Number.parseFloat(`${whole}.${frenchComma[2]}`);
    if (!Number.isFinite(value) || value <= 0 || value > 10_000_000) return null;
    return Math.round(value * 100) / 100;
  }

  const plainComma = cleaned.match(/^(\d+),(\d{1,2})$/);
  if (plainComma) {
    const value = Number.parseFloat(`${plainComma[1]}.${plainComma[2]}`);
    if (!Number.isFinite(value) || value <= 0 || value > 10_000_000) return null;
    return Math.round(value * 100) / 100;
  }

  const dotForm = cleaned.match(/^(\d{1,3}(?:\d{3})*)(?:\.(\d{1,2}))?$/);
  if (dotForm) {
    const whole = dotForm[1]!;
    const value = dotForm[2]
      ? Number.parseFloat(`${whole}.${dotForm[2]}`)
      : Number.parseFloat(whole);
    if (!Number.isFinite(value) || value <= 0 || value > 10_000_000) return null;
    return Math.round(value * 100) / 100;
  }

  const intOnly = cleaned.match(/^\d+$/);
  if (intOnly) {
    const value = Number.parseFloat(cleaned);
    if (!Number.isFinite(value) || value <= 0 || value > 10_000_000) return null;
    return value;
  }

  return null;
}

function extractMonetaryValuesFromLine(line: string): number[] {
  const amounts: number[] = [];
  for (const token of tokenizeLine(line)) {
    if (!looksLikeMonetaryToken(token)) continue;
    const parsed = parseFrenchAmount(token);
    if (parsed !== null) amounts.push(parsed);
  }
  return amounts;
}

function isProbableInstallmentRow(line: string): boolean {
  const hasDate = Boolean(extractDateFromLine(line));
  const monetaryCount = extractMonetaryValuesFromLine(line).length;
  return hasDate && monetaryCount >= 3;
}

function buildInstallment(date: string | undefined, amounts: number[]): ParsedInstallment {
  const installment: ParsedInstallment = {};
  if (date) installment.date = date;

  if (amounts.length === 0) return installment;

  if (amounts.length >= 5) {
    installment.payment = amounts[0];
    installment.principal = amounts[1];
    installment.interest = amounts[2];
    installment.insurance = amounts[3];
    installment.remainingCapital = amounts[amounts.length - 1];
    return installment;
  }

  if (amounts.length === 4) {
    installment.payment = amounts[0];
    installment.principal = amounts[1];
    installment.interest = amounts[2];
    installment.remainingCapital = amounts[3];
    return installment;
  }

  installment.payment = amounts[0];
  installment.principal = amounts[1];
  installment.interest = amounts[2];
  if (amounts.length > 3) {
    installment.remainingCapital = amounts[amounts.length - 1];
  }

  return installment;
}

function computeConfidenceScore(
  installmentRows: ParsedInstallment[],
  totalLines: number,
  amountCounts: number[],
): number {
  if (installmentRows.length === 0 || totalLines === 0) return 0;

  const rowRatio = Math.min(installmentRows.length / Math.max(totalLines, 1), 1);
  const dominantCount = mode(amountCounts);
  const consistentRows =
    dominantCount > 0
      ? amountCounts.filter((count) => count === dominantCount).length
      : 0;
  const consistencyRatio =
    amountCounts.length > 0 ? consistentRows / amountCounts.length : 0;

  const datedRows = installmentRows.filter((row) => row.date).length;
  const dateRatio = datedRows / installmentRows.length;

  const raw =
    rowRatio * 35 +
    consistencyRatio * 35 +
    dateRatio * 20 +
    Math.min(installmentRows.length / 12, 1) * 10;

  return Math.round(Math.min(100, Math.max(0, raw)));
}

function mode(values: number[]): number {
  if (values.length === 0) return 0;
  const tally = new Map<number, number>();
  for (const value of values) {
    tally.set(value, (tally.get(value) ?? 0) + 1);
  }
  let best = values[0]!;
  let bestCount = 0;
  for (const [value, count] of tally) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Heuristically parses amortization installment rows from OCR text.
 */
export function parseAmortizationTable(ocrText: string): ParseAmortizationResult {
  const lines = splitLines(ocrText);
  console.log(LOG_PREFIX, "start", { lineCount: lines.length });

  const installmentRows: ParsedInstallment[] = [];
  const amountCounts: number[] = [];

  for (const line of lines) {
    if (!isProbableInstallmentRow(line)) continue;

    const date = extractDateFromLine(line);
    const amounts = extractMonetaryValuesFromLine(line);
    amountCounts.push(amounts.length);

    const installment = buildInstallment(date, amounts);
    installmentRows.push(installment);

    console.log(LOG_PREFIX, "row", {
      date: installment.date,
      amountCount: amounts.length,
      amounts,
    });
  }

  const confidenceScore = computeConfidenceScore(installmentRows, lines.length, amountCounts);
  const sampleInstallments = installmentRows.slice(0, 5);

  const result: ParseAmortizationResult = {
    confidenceScore,
    installmentCount: installmentRows.length,
    sampleInstallments,
  };

  console.log(LOG_PREFIX, "done", {
    confidenceScore: result.confidenceScore,
    installmentCount: result.installmentCount,
    sampleCount: result.sampleInstallments.length,
  });

  return result;
}
