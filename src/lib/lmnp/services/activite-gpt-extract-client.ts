import type { ActiviteGptExtractionResult } from "@/lib/documents/gpt";

export class ActiviteGptExtractError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ActiviteGptExtractError";
  }
}

export async function requestActiviteGptExtraction(params: {
  rawText: string;
  fileName: string;
}): Promise<ActiviteGptExtractionResult> {
  const response = await fetch("/api/lmnp/activite/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ActiviteGptExtractError(
      payload.error ?? `GPT extraction failed (${response.status})`,
      response.status,
    );
  }

  return (await response.json()) as ActiviteGptExtractionResult;
}
