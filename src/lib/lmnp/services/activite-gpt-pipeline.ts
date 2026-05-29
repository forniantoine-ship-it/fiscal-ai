import type { ActiviteGptExtractionResult } from "@/lib/documents/gpt";
import { normalizeOcrText } from "@/lib/documents/normalizers";
import {
  DocumentOcrFailedError,
  resolveDocumentTextOrThrow,
} from "@/lib/documents/ocr";
import type { LmnpDocument } from "@/lib/lmnp/types";

import { requestActiviteGptExtraction } from "./activite-gpt-extract-client";
import { resolveDocumentFile } from "./resolve-document-file";

export { DocumentOcrFailedError };

export type ActiviteGptPipelineResult = {
  documentId: string;
  fileName: string;
  rawText: string;
  ocrProvider: string;
  extraction: ActiviteGptExtractionResult;
};

export type RunActiviteGptPipelineParams = {
  document: LmnpDocument;
  getFile: (documentId: string) => File | undefined;
  fiscalYear?: number;
};

/**
 * GPT-first Activité pipeline: OCR → GPT structured extraction.
 * Bypasses the legacy deterministic extractor pipeline.
 */
export async function runActiviteGptPipeline(
  params: RunActiviteGptPipelineParams,
): Promise<ActiviteGptPipelineResult> {
  const { document, getFile, fiscalYear } = params;

  const file = await resolveDocumentFile(document, getFile);
  const ocrResult = await resolveDocumentTextOrThrow(file);
  const rawText = normalizeOcrText(ocrResult.rawText);

  console.log("[gpt-extraction] ocr resolved", {
    documentId: document.id,
    provider: ocrResult.provider,
    pageCount: ocrResult.pageCount,
    textLength: rawText.length,
    newlineCount: (rawText.match(/\n/g) ?? []).length,
    alphaRatio: ocrResult.quality.alphaRatio,
    digitRatio: ocrResult.quality.digitRatio,
    fallbackReason: ocrResult.fallbackReason ?? null,
  });

  const extraction = await requestActiviteGptExtraction({
    rawText,
    fileName: document.fileName,
  });

  return {
    documentId: document.id,
    fileName: document.fileName,
    rawText,
    ocrProvider: ocrResult.provider,
    extraction,
  };
}
