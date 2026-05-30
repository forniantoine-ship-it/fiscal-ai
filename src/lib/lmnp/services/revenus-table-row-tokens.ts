/**
 * Structural OCR row token normalization — no semantic interpretation.
 * Runs before column index mapping in the structured table parser.
 */

export const MONETARY_NUMBER_TOKEN = /^\d[\d\s\u00a0]*,\d{2}$/;

export const NORMALIZED_MONETARY_CELL =
  /^\d[\d\s\u00a0]*,\d{2}\s+(?:€|EUR(?:\s+TTC)?)$/i;

export function isMonetaryNumberToken(cell: string): boolean {
  return MONETARY_NUMBER_TOKEN.test(cell.trim());
}

export function isNormalizedMonetaryCell(cell: string): boolean {
  return NORMALIZED_MONETARY_CELL.test(cell.trim());
}

function currencySuffixFromTokens(
  tokens: string[],
  startIndex: number,
): { suffix: string; consumed: number } | null {
  const first = tokens[startIndex]?.trim() ?? "";
  const second = tokens[startIndex + 1]?.trim().toUpperCase() ?? "";

  if (first === "€") {
    return { suffix: "€", consumed: 1 };
  }

  if (first.toUpperCase() === "EUR" && second === "TTC") {
    return { suffix: "EUR TTC", consumed: 2 };
  }

  if (first.toUpperCase() === "EUR") {
    return { suffix: "EUR", consumed: 1 };
  }

  return null;
}

/**
 * Coalesce `[amount]` + `[€|EUR|EUR TTC]` into a single cell.
 * Skips cells that are already normalized to prevent double-coalesce.
 */
export function coalesceAmountCurrencyTokens(cells: string[]): string[] {
  const merged: string[] = [];

  for (let index = 0; index < cells.length; index += 1) {
    const current = cells[index]?.trim() ?? "";

    if (isNormalizedMonetaryCell(current)) {
      merged.push(current);
      continue;
    }

    if (isMonetaryNumberToken(current)) {
      const currency = currencySuffixFromTokens(cells, index + 1);
      if (currency) {
        merged.push(`${current} ${currency.suffix}`);
        index += currency.consumed;
        continue;
      }
    }

    merged.push(current);
  }

  return merged;
}

export function splitWhitespaceCells(row: string, preferSingleSpace = false): string[] {
  if (row.includes("|")) {
    return row.split("|").map((cell) => cell.trim()).filter(Boolean);
  }
  if (row.includes("\t")) {
    return row.split("\t").map((cell) => cell.trim()).filter(Boolean);
  }
  if (preferSingleSpace || !/\s{2,}/.test(row)) {
    return row.split(/\s+/).map((cell) => cell.trim()).filter(Boolean);
  }
  return row.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
}

export function splitTableRow(row: string, preferSingleSpace = false): string[] {
  return coalesceAmountCurrencyTokens(splitWhitespaceCells(row, preferSingleSpace));
}
