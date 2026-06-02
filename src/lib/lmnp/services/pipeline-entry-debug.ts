/**
 * TEMPORARY execution-flow tracing — upload → pipeline → UI.
 * Prefix: [pipeline-entry-debug]
 * Remove once the first missing boundary is confirmed.
 */

export const PIPELINE_ENTRY_DEBUG_PREFIX = "[pipeline-entry-debug]";

export type PipelineEntryDebugPayload = {
  functionName: string;
  entered?: boolean;
  returned?: boolean;
  success?: boolean | null;
  failureReason?: string | null;
  documentType?: string | null;
  ocrProvider?: string | null;
  installmentCount?: number | null;
  datedInstallmentCount?: number | null;
  documentId?: string | null;
  fileName?: string | null;
  extra?: Record<string, unknown>;
};

export function logPipelineEntry(payload: PipelineEntryDebugPayload): void {
  console.log(PIPELINE_ENTRY_DEBUG_PREFIX, payload);
}

export function logPipelineEntryCatch(
  functionName: string,
  error: unknown,
  context?: Omit<PipelineEntryDebugPayload, "functionName" | "entered" | "returned" | "success">,
): void {
  console.error(PIPELINE_ENTRY_DEBUG_PREFIX, {
    functionName,
    entered: false,
    returned: true,
    success: false,
    failureReason: error instanceof Error ? error.message : String(error),
    ...context,
    extra: {
      ...context?.extra,
      stack: error instanceof Error ? error.stack : undefined,
    },
  });
}

export function logPipelineEntryEarlyReturn(
  functionName: string,
  failureReason: string,
  context?: Omit<PipelineEntryDebugPayload, "functionName" | "entered" | "returned" | "failureReason">,
): void {
  console.log(PIPELINE_ENTRY_DEBUG_PREFIX, {
    functionName,
    entered: true,
    returned: true,
    success: context?.success ?? null,
    failureReason,
    ...context,
  });
}
