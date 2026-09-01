import type { LogementActeGptExtractionResult } from "@/lib/documents/gpt/extract-logement-acte-with-gpt";

export class LogementGptExtractError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LogementGptExtractError";
  }
}

export async function requestLogementGptExtraction(params: {
  rawText: string;
  fileName: string;
}): Promise<LogementActeGptExtractionResult> {
  const response = await fetch("/api/lmnp/logement/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new LogementGptExtractError(
      payload.error ?? `GPT extraction failed (${response.status})`,
      response.status,
    );
  }

  return (await response.json()) as LogementActeGptExtractionResult;
}
