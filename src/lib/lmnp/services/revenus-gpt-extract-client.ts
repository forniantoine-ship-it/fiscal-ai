import type { RevenusLinesGptExtractionResult } from "@/lib/documents/gpt/extract-revenus-lines-with-gpt";
import type { RevenueRawLineSourceType } from "../types";

export class RevenusGptExtractError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RevenusGptExtractError";
  }
}

export async function requestRevenusGptExtraction(params: {
  rawText: string;
  fileName: string;
  fiscalYear: number;
  sourceType: RevenueRawLineSourceType;
}): Promise<RevenusLinesGptExtractionResult> {
  const response = await fetch("/api/lmnp/revenus/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const payload = (await response.json().catch(() => ({}))) as RevenusLinesGptExtractionResult & {
    error?: string;
  };

  if (!response.ok) {
    throw new RevenusGptExtractError(
      payload.error ?? `Extraction revenus échouée (${response.status})`,
      response.status,
    );
  }

  return payload;
}
