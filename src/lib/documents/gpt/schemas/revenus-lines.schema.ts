import { z } from "zod";

import { normalizeDate, normalizeNumber, normalizeString } from "./logement-acte.schema";

const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();

export const RevenusLineRowSchema = z.object({
  date: nullableString,
  label: nullableString,
  sourceColumnHeader: nullableString,
  amount: nullableNumber,
  direction: z.enum(["credit", "debit"]).nullable().optional(),
  confidence: nullableNumber,
  isSummaryRow: z.boolean().nullable().optional(),
});

export const RevenusLinesExtractionSchema = z.object({
  lines: z.array(RevenusLineRowSchema).nullable().optional(),
});

export type RevenusLinesExtractionRaw = z.infer<typeof RevenusLinesExtractionSchema>;

export type RevenusGptLine = {
  date?: string;
  label?: string;
  sourceColumnHeader?: string;
  amount: number;
  direction: "credit" | "debit";
  confidence: number;
  isSummaryRow?: boolean;
};

export type RevenusLinesExtraction = {
  lines: RevenusGptLine[];
};

export function normalizeRevenusLinesExtraction(
  raw: RevenusLinesExtractionRaw,
): RevenusLinesExtraction {
  const lines: RevenusGptLine[] = [];

  for (const row of raw.lines ?? []) {
    const amount = normalizeNumber(row.amount);
    const direction = row.direction === "debit" ? "debit" : row.direction === "credit" ? "credit" : undefined;
    if (amount === undefined || amount <= 0 || !direction) continue;

    lines.push({
      date: normalizeDate(row.date) ?? undefined,
      label: normalizeString(row.label) ?? undefined,
      sourceColumnHeader: normalizeString(row.sourceColumnHeader) ?? undefined,
      amount,
      direction,
      confidence: Math.min(99, Math.max(0, Math.round(normalizeNumber(row.confidence) ?? 50))),
      isSummaryRow: Boolean(row.isSummaryRow),
    });
  }

  return { lines };
}
