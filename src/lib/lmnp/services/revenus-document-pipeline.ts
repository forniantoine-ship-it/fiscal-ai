import {
  REVENUE_OCR_READ_FAILURE_MESSAGE,
  RevenueDocumentOcrFailedError,
} from "@/lib/documents/ocr";
import type { LmnpDocument, Property, RevenueRawLine } from "@/lib/lmnp/types";
import type { RevenueSupervisionStatus } from "@/lib/lmnp/services/revenue-supervision";

import { runRoutedRevenuePipeline } from "./pipelines/revenus/run-routed-revenue-pipeline";
import type { RevenuePipelineId } from "./pipelines/revenus/revenue-pipeline-types";
import { buildMockLinesByProperty, isRevenusMockEnabled } from "./revenus-mock";
import { hashDocumentContent } from "./revenue-batch-hash";
import {
  logRevenueGridSource,
  logRevenueRuntimeStage,
  logRevenueSourceOfTruth,
} from "./revenus-runtime-trace";

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
  pipelineId?: RevenuePipelineId;
  supervision?: RevenueSupervisionStatus;
};

export type RunRevenusGptPipelineParams = {
  document: LmnpDocument;
  getFile: (documentId: string) => File | undefined;
  fiscalYear: number;
};

/**
 * Single-document revenue extraction — routed to specialized pipelines.
 * @deprecated Name kept for callers; implementation is multi-engine, not GPT-only.
 */
export async function runRevenusGptPipeline(
  params: RunRevenusGptPipelineParams,
): Promise<RevenusGptPipelineResult> {
  const { document, fiscalYear, getFile } = params;

  const result = await runRoutedRevenuePipeline({ document, getFile, fiscalYear });

  logRevenueRuntimeStage("ocr_complete", {
    fn: "runRevenusGptPipeline",
    documentId: document.id,
    pipelineId: result.pipelineId,
    provider: result.ocrProvider,
    strategy: result.ocrStrategy,
    qualityScore: result.ocrQualityScore,
    textLength: result.rawText.length,
    lineCount: result.lines.length,
  });

  if (result.lines.length > 0) {
    logRevenueSourceOfTruth(
      result.pipelineId === "spreadsheet" || result.pipelineId === "pdf_structured"
        ? "structured_table_parser"
        : result.pipelineId === "vision"
          ? "gpt_extraction"
          : "ocr_extraction",
      {
        fn: "runRevenusGptPipeline",
        documentId: document.id,
        pipelineId: result.pipelineId,
        lineCount: result.lines.length,
      },
    );
  }

  return {
    documentId: result.documentId,
    fileName: result.fileName,
    rawText: result.rawText,
    ocrProvider: result.ocrProvider,
    ocrStrategy: result.ocrStrategy,
    ocrQualityScore: result.ocrQualityScore,
    lines: result.lines,
    success: result.success,
    ocrFailure: result.ocrFailure,
    error: result.error,
    pipelineId: result.pipelineId,
    supervision: result.supervision,
  };
}

export type RevenusDocumentPipelineResult = {
  linesByPropertyId: Map<string, RevenueRawLine[]>;
  processedDocumentIds: string[];
  failedDocumentIds: string[];
  ocrFailedDocumentIds: string[];
  /** Documents lus avec succès mais dont le contenu est identique à un document déjà traité dans ce même lot — Cycle 15A. */
  duplicateDocumentIds: string[];
  gridSource: "ocr_lines" | "mock_lines";
  success: boolean;
  ocrFailure?: boolean;
  error?: string;
  supervision?: RevenueSupervisionStatus;
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
      duplicateDocumentIds: [],
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
  const duplicateDocumentIds: string[] = [];
  const seenContentHashes = new Set<string>();
  const primaryId = properties[0]?.id;
  let lastSupervision: RevenueSupervisionStatus | undefined;

  logRevenueRuntimeStage("ocr_dispatch", {
    fn: "runRevenusDocumentPipeline",
    documentIds,
    pipeline: "revenus-routed",
  });

  for (const documentId of documentIds) {
    const document = documents.find((item) => item.id === documentId);
    if (!document) continue;

    try {
      const result = await runRevenusGptPipeline({ document, getFile, fiscalYear });
      if (result.supervision) lastSupervision = result.supervision;

      if (result.ocrFailure) {
        ocrFailedDocumentIds.push(documentId);
        failedDocumentIds.push(documentId);
        continue;
      }

      if (!result.success || result.lines.length === 0) {
        failedDocumentIds.push(documentId);
        continue;
      }

      const contentHash = hashDocumentContent(result.lines);
      if (seenContentHashes.has(contentHash)) {
        // Document lu avec succès mais dont le contenu est identique à un document
        // déjà intégré dans ce même lot — ni un échec, ni une ligne supplémentaire.
        duplicateDocumentIds.push(documentId);
        processedDocumentIds.push(documentId);
        continue;
      }
      seenContentHashes.add(contentHash);

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
    duplicateDocumentIds,
    gridSource: "ocr_lines",
    success,
    ocrFailure,
    supervision: lastSupervision,
    error: ocrFailure
      ? REVENUE_OCR_READ_FAILURE_MESSAGE
      : success
        ? undefined
        : "Aucune ligne financière extraite des documents.",
  };
}

export { RevenueDocumentOcrFailedError, REVENUE_OCR_READ_FAILURE_MESSAGE };
