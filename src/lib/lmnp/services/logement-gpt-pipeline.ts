import type { LogementActeGptExtractionResult } from "@/lib/documents/gpt/extract-logement-acte-with-gpt";
import { normalizeOcrText } from "@/lib/documents/normalizers";
import {
  DocumentOcrFailedError,
  resolveDocumentTextOrThrow,
} from "@/lib/documents/ocr";
import type { LmnpDocument } from "@/lib/lmnp/types";

import {
  buildLogementOcrDebugTrace,
  logLogementOcrPreview,
  type LogementOcrDebugTrace,
} from "./logement-extraction-debug";
import { requestLogementGptExtraction } from "./logement-gpt-extract-client";
import { resolveDocumentFile } from "./resolve-document-file";

export { DocumentOcrFailedError };

export type LogementGptPipelineResult = {
  documentId: string;
  fileName: string;
  rawText: string;
  ocrProvider: string;
  ocrDebug: LogementOcrDebugTrace;
  extraction: LogementActeGptExtractionResult;
};

export type RunLogementGptPipelineParams = {
  document: LmnpDocument;
  getFile: (documentId: string) => File | undefined;
  fiscalYear?: number;
};

/**
 * GPT-first Logement pipeline: OCR → GPT structured extraction.
 * Runs only on upload or explicit reanalyze — never on passive hydration.
 */
export async function runLogementGptPipeline(
  params: RunLogementGptPipelineParams,
): Promise<LogementGptPipelineResult> {
  const { document, getFile } = params;

  const file = await resolveDocumentFile(document, getFile);
  const ocrResult = await resolveDocumentTextOrThrow(file);
  const rawText = normalizeOcrText(ocrResult.rawText);

  const ocrDebug = buildLogementOcrDebugTrace({
    documentId: document.id,
    fileName: document.fileName,
    rawText,
    ocrResult,
  });
  logLogementOcrPreview(ocrDebug);

  console.log("[logement-gpt] ocr resolved", {
    documentId: document.id,
    provider: ocrResult.provider,
    pageCount: ocrResult.pageCount,
    textLength: rawText.length,
    newlineCount: ocrDebug.newlineCount,
    alphaRatio: ocrResult.quality.alphaRatio,
    digitRatio: ocrResult.quality.digitRatio,
    fallbackReason: ocrResult.fallbackReason ?? null,
    ocrSource: ocrDebug.ocrSource,
  });

  const extraction = await requestLogementGptExtraction({
    rawText,
    fileName: document.fileName,
  });

  if (extraction.debug) {
    console.log("[logement-debug-gpt-raw]", {
      documentId: document.id,
      fileName: document.fileName,
      rawGptJson: extraction.debug.rawGptJson,
    });
    console.log("[logement-debug-normalized]", {
      documentId: document.id,
      fileName: document.fileName,
      normalized: extraction.debug.normalized,
    });
  }

  return {
    documentId: document.id,
    fileName: document.fileName,
    rawText,
    ocrProvider: ocrResult.provider,
    ocrDebug,
    extraction,
  };
}
