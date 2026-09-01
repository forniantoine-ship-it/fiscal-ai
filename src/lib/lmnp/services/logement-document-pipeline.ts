import type { LogementGptPipelineResult } from "./logement-gpt-pipeline";
import { runLogementGptPipeline, type RunLogementGptPipelineParams } from "./logement-gpt-pipeline";

export type RunLogementDocumentPipelineParams = RunLogementGptPipelineParams;

/**
 * Logement tunnel entry point — GPT-first acte notarié extraction.
 */
export async function runLogementDocumentPipeline(
  params: RunLogementDocumentPipelineParams,
): Promise<LogementGptPipelineResult> {
  return runLogementGptPipeline(params);
}

export { runLogementGptPipeline, type LogementGptPipelineResult } from "./logement-gpt-pipeline";
