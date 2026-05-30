import {
  REVENUE_OCR_READ_FAILURE_MESSAGE,
  resolveRevenueDocumentTextOrThrow,
  RevenueDocumentOcrFailedError,
} from "@/lib/documents/ocr";
import type { LmnpDocument, Property, RevenueRawLine } from "@/lib/lmnp/types";

import {
  adaptGptLinesToRevenueRawLines,
  inferRevenusSourceType,
} from "./revenus-ocr-lines-adapter";
import { requestRevenusGptExtraction } from "./revenus-gpt-extract-client";
import { buildMockLinesByProperty, isRevenusMockEnabled } from "./revenus-mock";
import {
  logRevenueGridSource,
  logRevenueRuntimeStage,
  logRevenueSourceOfTruth,
} from "./revenus-runtime-trace";
import { resolveDocumentFile } from "./resolve-document-file";
import { parseStructuredRevenueTable } from "./revenus-structured-table-parser";

export type RevenusGptPipelineResult = {
  documentId: string;
  fileName: string;
  rawText: string;
  ocrProvider: string;
  ocrStrategy?: string;
  ocrQualityScore?: number;
  lines: RevenueRawLine[];
  success: boolean;
  ocrFailure?: boolean;
  error?: string;
};

export type RunRevenusGptPipelineParams = {
  document: LmnpDocument;
  getFile: (documentId: string) => File | undefined;
  fiscalYear: number;
};

export async function runRevenusGptPipeline(
  params: RunRevenusGptPipelineParams,
): Promise<RevenusGptPipelineResult> {
  const { document, getFile, fiscalYear } = params;
  const sourceType = inferRevenusSourceType(document);

  const file = await resolveDocumentFile(document, getFile);

  let ocrResult;
  try {
    ocrResult = await resolveRevenueDocumentTextOrThrow(file);
  } catch (err) {
    if (err instanceof RevenueDocumentOcrFailedError) {
      return {
        documentId: document.id,
        fileName: document.fileName,
        rawText: "",
        ocrProvider: err.provider,
        ocrStrategy: err.strategy,
        ocrQualityScore: err.quality.score,
        lines: [],
        success: false,
        ocrFailure: true,
        error: err.message,
      };
    }
    throw err;
  }

  const rawText = ocrResult.rawText;

  logRevenueRuntimeStage("ocr_complete", {
    fn: "runRevenusGptPipeline",
    documentId: document.id,
    provider: ocrResult.provider,
    strategy: ocrResult.strategy,
    qualityScore: ocrResult.quality.score,
    textLength: rawText.length,
    sourceType,
  });

  if (!rawText.trim()) {
    return {
      documentId: document.id,
      fileName: document.fileName,
      rawText,
      ocrProvider: ocrResult.provider,
      ocrStrategy: ocrResult.strategy,
      ocrQualityScore: ocrResult.quality.score,
      lines: [],
      success: false,
      ocrFailure: true,
      error: REVENUE_OCR_READ_FAILURE_MESSAGE,
    };
  }

  const structured = parseStructuredRevenueTable(
    rawText,
    fiscalYear,
    document.id,
    sourceType,
  );

  if (structured.detected && structured.lines.length > 0) {
    logRevenueSourceOfTruth("structured_table_parser", {
      fn: "runRevenusGptPipeline",
      documentId: document.id,
      lineCount: structured.lines.length,
      skipGpt: true,
    });

    return {
      documentId: document.id,
      fileName: document.fileName,
      rawText,
      ocrProvider: ocrResult.provider,
      ocrStrategy: ocrResult.strategy,
      ocrQualityScore: ocrResult.quality.score,
      lines: structured.lines,
      success: true,
    };
  }

  const gptResult = await requestRevenusGptExtraction({
    rawText,
    fileName: document.fileName,
    fiscalYear,
    sourceType,
  });

  logRevenueSourceOfTruth("gpt_extraction", {
    fn: "runRevenusGptPipeline",
    documentId: document.id,
    lineCount: gptResult.extraction.lines.length,
    success: gptResult.success,
  });

  const lines = adaptGptLinesToRevenueRawLines(gptResult.extraction.lines, document, sourceType);

  return {
    documentId: document.id,
    fileName: document.fileName,
    rawText,
    ocrProvider: ocrResult.provider,
    ocrStrategy: ocrResult.strategy,
    ocrQualityScore: ocrResult.quality.score,
    lines,
    success: gptResult.success && lines.length > 0,
    error: gptResult.error,
  };
}

export type RevenusDocumentPipelineResult = {
  linesByPropertyId: Map<string, RevenueRawLine[]>;
  processedDocumentIds: string[];
  failedDocumentIds: string[];
  ocrFailedDocumentIds: string[];
  gridSource: "ocr_lines" | "mock_lines";
  success: boolean;
  ocrFailure?: boolean;
  error?: string;
};

export type RunRevenusDocumentPipelineParams = {
  documents: LmnpDocument[];
  documentIds: string[];
  getFile: (documentId: string) => File | undefined;
  fiscalYear: number;
  properties: Property[];
};

export async function runRevenusDocumentPipeline(
  params: RunRevenusDocumentPipelineParams,
): Promise<RevenusDocumentPipelineResult> {
  const { documents, documentIds, getFile, fiscalYear, properties } = params;

  if (isRevenusMockEnabled()) {
    console.warn("[revenus-pipeline] NEXT_PUBLIC_REVENUS_MOCK=true — using dev mock lines only");
    logRevenueGridSource("mock_lines", { fn: "runRevenusDocumentPipeline", devFlag: true });
    return {
      linesByPropertyId: buildMockLinesByProperty(properties, fiscalYear),
      processedDocumentIds: documentIds,
      failedDocumentIds: [],
      ocrFailedDocumentIds: [],
      gridSource: "mock_lines",
      success: true,
    };
  }

  const linesByPropertyId = new Map<string, RevenueRawLine[]>();
  for (const property of properties) {
    linesByPropertyId.set(property.id, []);
  }

  const processedDocumentIds: string[] = [];
  const failedDocumentIds: string[] = [];
  const ocrFailedDocumentIds: string[] = [];
  const primaryId = properties[0]?.id;

  logRevenueRuntimeStage("ocr_dispatch", {
    fn: "runRevenusDocumentPipeline",
    documentIds,
    pipeline: "revenus-ocr-gpt",
  });

  for (const documentId of documentIds) {
    const document = documents.find((item) => item.id === documentId);
    if (!document) continue;

    try {
      const result = await runRevenusGptPipeline({ document, getFile, fiscalYear });

      if (result.ocrFailure) {
        ocrFailedDocumentIds.push(documentId);
        failedDocumentIds.push(documentId);
        continue;
      }

      if (!result.success || result.lines.length === 0) {
        failedDocumentIds.push(documentId);
        continue;
      }

      if (primaryId) {
        const bucket = linesByPropertyId.get(primaryId) ?? [];
        linesByPropertyId.set(primaryId, [...bucket, ...result.lines]);
      }

      processedDocumentIds.push(documentId);
    } catch (err) {
      console.error("[revenus-pipeline]", document.fileName, err);
      failedDocumentIds.push(documentId);
    }
  }

  const totalLines = [...linesByPropertyId.values()].reduce((sum, lines) => sum + lines.length, 0);
  const success = totalLines > 0;
  const ocrFailure = ocrFailedDocumentIds.length > 0 && !success;

  if (success) {
    logRevenueGridSource("ocr_lines", {
      fn: "runRevenusDocumentPipeline",
      lineCount: totalLines,
      processedDocumentIds,
    });
  } else if (ocrFailure) {
    logRevenueGridSource("ocr_lines", {
      fn: "runRevenusDocumentPipeline",
      status: "ocr_failed_no_mock",
      ocrFailedDocumentIds,
    });
  }

  return {
    linesByPropertyId,
    processedDocumentIds,
    failedDocumentIds,
    ocrFailedDocumentIds,
    gridSource: "ocr_lines",
    success,
    ocrFailure,
    error: ocrFailure
      ? REVENUE_OCR_READ_FAILURE_MESSAGE
      : success
        ? undefined
        : "Aucune ligne financière extraite des documents.",
  };
}

export { RevenueDocumentOcrFailedError, REVENUE_OCR_READ_FAILURE_MESSAGE };
