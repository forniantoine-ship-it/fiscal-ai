import { classifyCreditDocument } from "./credit-profile";
import type { CreditGptPipelineResult } from "./credit-gpt-pipeline";
import { runCreditGptPipeline, type RunCreditGptPipelineParams } from "./credit-gpt-pipeline";
import {
  logPipelineEntry,
  logPipelineEntryCatch,
} from "./pipeline-entry-debug";
import {
  endCreditPipelineTiming,
  startCreditPipelineTiming,
} from "./credit-pipeline-timing";

export type RunCreditDocumentPipelineParams = RunCreditGptPipelineParams;

/**
 * Crédit tunnel entry point — GPT-first financing document extraction.
 */
export async function runCreditDocumentPipeline(
  params: RunCreditDocumentPipelineParams,
): Promise<CreditGptPipelineResult> {
  const { document } = params;
  const documentKind = classifyCreditDocument(document);

  logPipelineEntry({
    functionName: "runCreditDocumentPipeline",
    entered: true,
    documentType: documentKind,
    documentId: document.id,
    fileName: document.fileName,
  });

  startCreditPipelineTiming({
    documentId: document.id,
    fileName: document.fileName,
    documentKind,
  });

  try {
    const result = await runCreditGptPipeline(params);
    logPipelineEntry({
      functionName: "runCreditDocumentPipeline",
      returned: true,
      success: result.success,
      failureReason: result.error ?? null,
      documentType: result.documentKind,
      ocrProvider: result.ocrProvider,
      documentId: result.documentId,
      fileName: result.fileName,
    });
    return result;
  } catch (error) {
    logPipelineEntryCatch("runCreditDocumentPipeline", error, {
      documentType: documentKind,
      documentId: document.id,
      fileName: document.fileName,
    });
    throw error;
  } finally {
    endCreditPipelineTiming();
  }
}

export { runCreditGptPipeline, type CreditGptPipelineResult } from "./credit-gpt-pipeline";
