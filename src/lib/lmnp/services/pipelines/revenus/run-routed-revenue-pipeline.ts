import type { LmnpDocument } from "@/lib/lmnp/types";
import { routeRevenueDocument } from "@/lib/lmnp/services/revenue-document-router";
import { resolveDocumentFile } from "@/lib/lmnp/services/resolve-document-file";
import { logRevenueRuntimeStage } from "@/lib/lmnp/services/revenus-runtime-trace";

import { runDocumentaryRevenuePipeline } from "./documentary-revenue-pipeline";
import { runPdfStructuredRevenuePipeline } from "./pdf-structured-revenue-pipeline";
import { runRevenueVisionPipeline } from "./revenue-vision-pipeline";
import { runSpreadsheetRevenuePipeline } from "./spreadsheet-revenue-pipeline";
import type { RevenuePipelineContext, RevenuePipelineRunResult } from "./revenue-pipeline-types";

export type RunRoutedRevenuePipelineParams = {
  document: LmnpDocument;
  getFile: (documentId: string) => File | undefined;
  fiscalYear: number;
};

async function runSelectedPipeline(
  route: Awaited<ReturnType<typeof routeRevenueDocument>>,
  ctx: RevenuePipelineContext,
  document: LmnpDocument,
): Promise<RevenuePipelineRunResult> {
  const skipped = route.skippedPipelines;

  switch (route.selectedPipeline) {
    case "spreadsheet":
      return runSpreadsheetRevenuePipeline(ctx, skipped);
    case "pdf_structured":
      return runPdfStructuredRevenuePipeline(ctx, skipped);
    case "vision":
      return runRevenueVisionPipeline(ctx, skipped, document);
    case "documentary":
      return runDocumentaryRevenuePipeline(ctx, skipped, document);
    default:
      return runRevenueVisionPipeline(ctx, skipped, document);
  }
}

/**
 * Revenue tunnel entry: route → specialized deterministic / vision pipeline.
 */
export async function runRoutedRevenuePipeline(
  params: RunRoutedRevenuePipelineParams,
): Promise<RevenuePipelineRunResult> {
  const { document, getFile, fiscalYear } = params;
  const file = await resolveDocumentFile(document, getFile);
  const route = await routeRevenueDocument(file, document);

  logRevenueRuntimeStage("ocr_dispatch", {
    fn: "runRoutedRevenuePipeline",
    documentId: document.id,
    selectedPipeline: route.selectedPipeline,
    detectedSourceType: route.detectedSourceType,
  });

  const ctx: RevenuePipelineContext = {
    file,
    documentId: document.id,
    fileName: document.fileName,
    fiscalYear,
    sourceType: route.sourceType,
  };

  const primary = await runSelectedPipeline(route, ctx, document);

  if (primary.success && primary.lines.length > 0) {
    return primary;
  }

  const fallbacks: Array<typeof route.selectedPipeline> = [];
  if (route.selectedPipeline === "pdf_structured") fallbacks.push("vision");
  if (route.selectedPipeline === "documentary" && primary.lines.length === 0) {
    fallbacks.push("vision");
  }

  for (const fallbackId of fallbacks) {
    console.log("[revenus-routing-debug]", {
      stage: "fallback",
      from: route.selectedPipeline,
      to: fallbackId,
      documentId: document.id,
    });

    const mergedSkipped = [
      ...(primary.skippedPipelines ?? []),
      route.selectedPipeline,
    ];

    const fallbackResult =
      fallbackId === "vision"
        ? await runRevenueVisionPipeline(ctx, mergedSkipped, document)
        : primary;

    if (fallbackResult.success && fallbackResult.lines.length > 0) {
      return {
        ...fallbackResult,
        skippedPipelines: mergedSkipped,
      };
    }
  }

  return primary;
}
