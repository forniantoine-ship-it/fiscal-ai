import type { LogementVisionOcrIntermediate } from "./schemas/logement-vision-ocr-intermediate.schema";

export type VisionConfidenceByField = Record<
  string,
  "high" | "medium" | "low" | "missing"
>;

export function logVisionExtractionConfidenceDebug(payload: {
  phase: "ocr_intermediate" | "canonical_final";
  fileName: string;
  extractedVisibleTextLength: number;
  visibleKeyValuePairs: Array<{ label: string; value: string; confidence: string }>;
  extractedAmountCandidates: Array<{
    label: string;
    amount: number;
    confidence: string;
  }>;
  visionConfidenceByField?: VisionConfidenceByField;
  rawTextBlockCount?: number;
}): void {
  console.log("[vision-extraction-confidence-debug]", {
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

export function summarizeOcrIntermediate(ocr: LogementVisionOcrIntermediate): {
  extractedVisibleTextLength: number;
  visibleKeyValuePairs: Array<{ label: string; value: string; confidence: string }>;
  extractedAmountCandidates: Array<{ label: string; amount: number; confidence: string }>;
  rawTextBlockCount: number;
} {
  const extractedVisibleTextLength = ocr.rawTextBlocks.join("\n").length;
  return {
    extractedVisibleTextLength,
    rawTextBlockCount: ocr.rawTextBlocks.length,
    visibleKeyValuePairs: ocr.keyValueCandidates.map((pair) => ({
      label: pair.label,
      value: pair.value,
      confidence: pair.confidence,
    })),
    extractedAmountCandidates: ocr.amountCandidates.map((candidate) => ({
      label: candidate.label,
      amount: candidate.amount,
      confidence: candidate.confidence,
    })),
  };
}

export function deriveVisionConfidenceByField(params: {
  canonicalFields: Record<string, unknown>;
  rawDocumentTerms?: Array<{ term: string; value?: string | null; mappedField?: string | null }>;
  ocr?: LogementVisionOcrIntermediate;
}): VisionConfidenceByField {
  const { canonicalFields, rawDocumentTerms, ocr } = params;
  const result: VisionConfidenceByField = {};

  for (const [key, value] of Object.entries(canonicalFields)) {
    if (value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0)) {
      result[key] = "high";
      continue;
    }

    const term = rawDocumentTerms?.find(
      (entry) => entry.mappedField === key || entry.term.toLowerCase().includes(key.toLowerCase()),
    );
    if (term?.value?.trim()) {
      result[key] = "medium";
      continue;
    }
    if (term?.term) {
      result[key] = "low";
      continue;
    }

    const ocrPair = ocr?.keyValueCandidates.find((pair) =>
      /prix|acquéreur|vendeur|adresse|notaire/i.test(pair.label),
    );
    if (ocrPair?.value && key.includes("Price")) {
      result[key] = ocrPair.confidence;
      continue;
    }

    result[key] = "missing";
  }

  return result;
}
