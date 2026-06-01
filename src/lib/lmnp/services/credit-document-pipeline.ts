import { classifyCreditDocument } from "./credit-profile";
import type { CreditGptPipelineResult } from "./credit-gpt-pipeline";
import { runCreditGptPipeline, type RunCreditGptPipelineParams } from "./credit-gpt-pipeline";
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

  startCreditPipelineTiming({
    documentId: document.id,
    fileName: document.fileName,
    documentKind: classifyCreditDocument(document),
  });

  try {
    return await runCreditGptPipeline(params);
  } finally {
    endCreditPipelineTiming();
  }
}

export { runCreditGptPipeline, type CreditGptPipelineResult } from "./credit-gpt-pipeline";
