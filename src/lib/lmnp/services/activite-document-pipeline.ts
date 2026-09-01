import type { ActiviteGptPipelineResult } from "./activite-gpt-pipeline";
import { runActiviteGptPipeline, type RunActiviteGptPipelineParams } from "./activite-gpt-pipeline";

export type RunActiviteDocumentPipelineParams = RunActiviteGptPipelineParams;

/**
 * Activité tunnel entry point — GPT-first (legacy deterministic pipeline bypassed).
 */
export async function runActiviteDocumentPipeline(
  params: RunActiviteDocumentPipelineParams,
): Promise<ActiviteGptPipelineResult> {
  return runActiviteGptPipeline(params);
}

export { runActiviteGptPipeline, type ActiviteGptPipelineResult } from "./activite-gpt-pipeline";
