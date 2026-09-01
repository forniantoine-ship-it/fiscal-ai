/**
 * Deterministic monetary normalization (French + international decimal formats).
 */

export type MonetaryDecimalSeparator = "," | "." | "none";

export type MonetaryNormalizeResult = {
  rawValue: string;
  normalizedValue: string;
  detectedDecimalSeparator: MonetaryDecimalSeparator;
  parsedAmount: number;
};

function logSpreadsheetMonetaryNormalization(
  result: MonetaryNormalizeResult | null,
  rawValue: string,
  reason?: string,
): void {
  console.log("[spreadsheet-revenue-debug]", {
    stage: "monetary_normalization",
    rawValue,
    normalizedValue: result?.normalizedValue ?? null,
    detectedDecimalSeparator: result?.detectedDecimalSeparator ?? null,
    parsedAmount: result?.parsedAmount ?? null,
    ...(reason ? { reason } : {}),
  });
}

export function hasCurrencyContext(raw: string): boolean {
  return /€|\bEUR\b|\beuro?s?\b/i.test(raw);
}

/** True when value is clearly money, not a calendar date (e.g. 420.00 €). */
export function looksLikeMonetaryAmount(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (hasCurrencyContext(trimmed)) return true;

  const withoutCurrency = trimmed
    .replace(/€/g, "")
    .replace(/\b(EUR|euros?)\b/gi, "")
    .trim();

  if (/^-?\d{1,3}([ \u00a0]\d{3})+[.,]\d{1,2}$/.test(withoutCurrency)) return true;
  if (/^-?\d{1,3}(,\d{3})+\.\d{1,2}$/.test(withoutCurrency)) return true;
  if (/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(withoutCurrency)) return true;
  if (/^-?\d+[.,]\d{1,2}$/.test(withoutCurrency)) return true;

  return false;
}

export function hasMonetaryDecimalStructure(raw: string): boolean {
  const trimmed = raw.trim();
  return (
    /[.,]\d{1,2}\s*(€|EUR|\beuro?s?\b)?\s*$/i.test(trimmed) ||
    /(€|EUR)\s*\d+[.,]\d{1,2}/i.test(trimmed)
  );
}

/**
 * Parse rent/charge amounts from spreadsheet and document cells.
 */
export function normalizeMonetaryValue(
  raw: string,
  options?: { log?: boolean },
): MonetaryNormalizeResult | null {
  const rawValue = raw.trim().replace(/\u00a0/g, " ");
  if (!rawValue) {
    if (options?.log) logSpreadsheetMonetaryNormalization(null, raw, "empty");
    return null;
  }

  let work = rawValue;
  const negative = /^\(.*\)$/.test(work) || /^-/.test(work);
  work = work.replace(/^\((.*)\)$/, "$1").replace(/^-/, "").trim();

  if (/^-?\d+(\.\d+)?$/.test(work)) {
    const parsedAmount = Math.round(Number.parseFloat(work) * 100) / 100;
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      if (options?.log) logSpreadsheetMonetaryNormalization(null, rawValue, "non_positive_plain_number");
      return null;
    }
    const result: MonetaryNormalizeResult = {
      rawValue,
      normalizedValue: work,
      detectedDecimalSeparator: work.includes(".") ? "." : "none",
      parsedAmount: negative ? -parsedAmount : parsedAmount,
    };
    if (options?.log) logSpreadsheetMonetaryNormalization(result, rawValue);
    return result;
  }

  work = work
    .replace(/€/g, " ")
    .replace(/\b(EUR|euros?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const leadingCurrency = work.match(/^(€|EUR)\s*(.+)$/i);
  if (leadingCurrency) work = leadingCurrency[2].trim();

  const trailingDecimal = work.match(/^(.+?)([.,])(\d{1,2})\s*$/);
  let detectedDecimalSeparator: MonetaryDecimalSeparator = "none";
  let integerPart = work;
  let fractionalPart = "";

  if (trailingDecimal) {
    detectedDecimalSeparator = trailingDecimal[2] as "," | ".";
    integerPart = trailingDecimal[1].trim();
    fractionalPart = trailingDecimal[3];
  }

  let normalizedInteger = integerPart;

  if (detectedDecimalSeparator === ".") {
    if (/,\d{3}/.test(integerPart)) {
      normalizedInteger = integerPart.replace(/,/g, "");
    } else {
      normalizedInteger = integerPart.replace(/\s/g, "");
    }
  } else if (detectedDecimalSeparator === ",") {
    if (/\.\d{3}/.test(integerPart)) {
      normalizedInteger = integerPart.replace(/[.\s]/g, "");
    } else {
      normalizedInteger = integerPart.replace(/\s/g, "").replace(/,/g, "");
    }
  } else {
    normalizedInteger = integerPart.replace(/\s/g, "");
    if (/^\d{1,3}(,\d{3})+$/.test(normalizedInteger)) {
      normalizedInteger = normalizedInteger.replace(/,/g, "");
    } else if (/^\d{1,3}(\.\d{3})+$/.test(normalizedInteger)) {
      normalizedInteger = normalizedInteger.replace(/\./g, "");
    }
  }

  normalizedInteger = normalizedInteger.replace(/[^\d]/g, "");
  if (!normalizedInteger) {
    if (options?.log) logSpreadsheetMonetaryNormalization(null, rawValue, "no_digits");
    return null;
  }

  const normalizedValue = fractionalPart
    ? `${normalizedInteger}.${fractionalPart}`
    : normalizedInteger;

  const parsedAmount = Math.round(Number.parseFloat(normalizedValue) * 100) / 100;
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    if (options?.log) logSpreadsheetMonetaryNormalization(null, rawValue, "non_positive");
    return null;
  }

  const result: MonetaryNormalizeResult = {
    rawValue,
    normalizedValue,
    detectedDecimalSeparator,
    parsedAmount: negative ? -parsedAmount : parsedAmount,
  };

  if (options?.log) logSpreadsheetMonetaryNormalization(result, rawValue);
  return result;
}
