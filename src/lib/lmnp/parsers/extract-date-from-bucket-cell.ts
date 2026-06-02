/**
 * TEMPORARY — date normalization for bucket-aligned cells where rank and date merge.
 * Example: "0001 24/06/2024" → "24/06/2024"
 */

const LOG_PREFIX = "[date-normalization-debug]";

/** DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY embedded in a larger cell. */
const EMBEDDED_FRENCH_DATE =
  /(?:^|\s)(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?=\s|$|[^\d/.\-])/;

export type DateNormalizationLogContext = {
  rowIndex?: number;
  columnIndex?: number;
  pdfPage?: number;
};

function isValidCalendarDate(day: number, month: number, year: number): boolean {
  return day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1990 && year <= 2100;
}

/**
 * Extracts a French date token from a bucket cell that may prefix a rank or other text.
 * Returns the matched date substring (e.g. "24/06/2024") or undefined.
 */
export function extractDateFromBucketCell(rawCell: string): string | undefined {
  const trimmed = rawCell.trim();
  if (!trimmed) return undefined;

  const match = trimmed.match(EMBEDDED_FRENCH_DATE);
  if (!match) return undefined;

  const day = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const yearToken = match[3]!;
  let year = Number.parseInt(yearToken, 10);
  if (yearToken.length === 2) {
    year = year >= 70 ? 1900 + year : 2000 + year;
  }

  if (!isValidCalendarDate(day, month, year)) return undefined;

  const separator = trimmed.includes(`${match[1]}-${match[2]}`)
    ? "-"
    : trimmed.includes(`${match[1]}.${match[2]}`)
      ? "."
      : "/";

  return `${match[1]}${separator}${match[2]}${separator}${yearToken}`;
}

export function logDateNormalizationDebug(params: {
  rawCell: string;
  extractedDate: string | undefined;
  isoDate?: string;
  context?: DateNormalizationLogContext;
}): void {
  if (!params.extractedDate && !params.isoDate) return;

  console.log(LOG_PREFIX, {
    rawCell: params.rawCell,
    extractedDate: params.extractedDate ?? null,
    isoDate: params.isoDate ?? null,
    rowIndex: params.context?.rowIndex ?? null,
    columnIndex: params.context?.columnIndex ?? null,
    pdfPage: params.context?.pdfPage ?? null,
  });
}
