/**
 * Deep diagnostics for amortization GPT extraction (gpt_extract_amortization bottleneck).
 * Logger: [credit-gpt-amortization-trace]
 * TRACE ONLY — no extraction behavior changes.
 */

const LOG_PREFIX = "[credit-gpt-amortization-trace]";

export type AmortizationGptClientTraceContext = {
  traceId?: string | null;
  documentId?: string;
  fileName?: string;
  ocrPageCount?: number;
  ocrProvider?: string;
  ocrTextCharCount?: number;
  pdfPagesRasterized?: number;
};

export type AmortizationGptPhaseDurations = {
  promptBuildMs?: number;
  openAiCompletionMs?: number;
  jsonParseMs?: number;
  schemaValidationMs?: number;
  normalizationMs?: number;
  clientNetworkFetchMs?: number;
  clientResponseJsonParseMs?: number;
};

let clientContext: AmortizationGptClientTraceContext | null = null;
let serverSessionStartedAt: number | null = null;

export function setAmortizationGptClientTraceContext(ctx: AmortizationGptClientTraceContext): void {
  clientContext = ctx;
}

export function clearAmortizationGptClientTraceContext(): void {
  clientContext = null;
}

export function startAmortizationGptServerTrace(): void {
  serverSessionStartedAt = performance.now();
}

export function endAmortizationGptServerTrace(): void {
  serverSessionStartedAt = null;
}

/** Rough token estimate (chars / 4) for diagnostics only. */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function firstOcrLines(rawText: string, lineCount = 20): string[] {
  return rawText.split(/\r?\n/).slice(0, lineCount);
}

function log(event: string, payload: Record<string, unknown>): void {
  console.log(LOG_PREFIX, {
    event,
    at: new Date().toISOString(),
    msSinceServerStart:
      serverSessionStartedAt != null
        ? Math.round((performance.now() - serverSessionStartedAt) * 100) / 100
        : null,
    ...payload,
  });
}

export function logAmortizationGptClientRequestStart(params: {
  rawText: string;
  fileName: string;
  declarationYear: number;
  revenueYear: number;
  requestBodyBytes: number;
}): void {
  log("client_request_start", {
    side: "client",
    traceId: clientContext?.traceId ?? null,
    documentId: clientContext?.documentId,
    fileName: params.fileName,
    declarationYear: params.declarationYear,
    revenueYear: params.revenueYear,
    ocrPageCount: clientContext?.ocrPageCount ?? null,
    ocrProvider: clientContext?.ocrProvider ?? null,
    pdfPagesRasterized: clientContext?.pdfPagesRasterized ?? null,
    ocrTextCharCount: params.rawText.length,
    ocrTextEstimatedTokens: estimateTokenCount(params.rawText),
    requestBodyBytes: params.requestBodyBytes,
    ocrFirst20Lines: firstOcrLines(params.rawText),
  });
}

export function logAmortizationGptClientRequestEnd(params: {
  networkFetchMs: number;
  responseJsonParseMs: number;
  httpStatus: number;
  responseBodyBytes?: number;
  success?: boolean;
  installmentCount?: number;
}): void {
  log("client_request_end", {
    side: "client",
    traceId: clientContext?.traceId ?? null,
    networkRequestDurationMs: Math.round(params.networkFetchMs * 100) / 100,
    clientResponseJsonParseMs: Math.round(params.responseJsonParseMs * 100) / 100,
    clientTotalMs: Math.round((params.networkFetchMs + params.responseJsonParseMs) * 100) / 100,
    httpStatus: params.httpStatus,
    responseBodyBytes: params.responseBodyBytes ?? null,
    success: params.success ?? null,
    installmentCount: params.installmentCount ?? null,
    note: "networkRequestDurationMs includes server OpenAI + server post-processing + transfer",
  });
}

export function logAmortizationGptServerIngress(params: {
  traceId: string;
  fileName: string;
  rawText: string;
  declarationYear: number;
  revenueYear: number;
}): void {
  log("server_request_received", {
    side: "server",
    traceId: params.traceId,
    fileName: params.fileName,
    declarationYear: params.declarationYear,
    revenueYear: params.revenueYear,
    ocrTextCharCount: params.rawText.length,
    ocrTextEstimatedTokens: estimateTokenCount(params.rawText),
    ocrFirst20Lines: firstOcrLines(params.rawText),
  });
}

export function logAmortizationGptPromptMetrics(params: {
  model: string;
  systemPromptCharCount: number;
  userPromptCharCount: number;
  userPromptTruncated: boolean;
  ocrCharsInPrompt: number;
  systemPromptEstimatedTokens: number;
  userPromptEstimatedTokens: number;
  combinedPromptEstimatedTokens: number;
  jsonSchemaName: string;
  durationMs: number;
}): void {
  log("server_prompt_built", {
    side: "server",
    openAiModel: params.model,
    systemPromptCharCount: params.systemPromptCharCount,
    userPromptCharCount: params.userPromptCharCount,
    userPromptTruncated: params.userPromptTruncated,
    ocrCharsEmbeddedInUserPrompt: params.ocrCharsInPrompt,
    systemPromptEstimatedTokens: params.systemPromptEstimatedTokens,
    userPromptEstimatedTokens: params.userPromptEstimatedTokens,
    combinedPromptEstimatedTokens: params.combinedPromptEstimatedTokens,
    jsonSchemaName: params.jsonSchemaName,
    promptBuildDurationMs: Math.round(params.durationMs * 100) / 100,
  });
}

export function logAmortizationGptOpenAiComplete(params: {
  model: string;
  openAiCompletionDurationMs: number;
  responseCharCount: number;
  responseEstimatedTokens: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  finishReason?: string | null;
}): void {
  log("server_openai_completion", {
    side: "server",
    openAiModel: params.model,
    openAiCompletionDurationMs: Math.round(params.openAiCompletionDurationMs * 100) / 100,
    responseCharCount: params.responseCharCount,
    responseEstimatedTokens: params.responseEstimatedTokens,
    openAiUsage: {
      promptTokens: params.promptTokens ?? null,
      completionTokens: params.completionTokens ?? null,
      totalTokens: params.totalTokens ?? null,
    },
    finishReason: params.finishReason ?? null,
  });
}

export function logAmortizationGptPostProcess(params: {
  jsonParseMs: number;
  schemaValidationMs: number;
  normalizationMs: number;
  installmentCount: number;
  success: boolean;
}): void {
  log("server_post_process", {
    side: "server",
    jsonParseDurationMs: Math.round(params.jsonParseMs * 100) / 100,
    schemaValidationDurationMs: Math.round(params.schemaValidationMs * 100) / 100,
    normalizationDurationMs: Math.round(params.normalizationMs * 100) / 100,
    postProcessTotalMs: Math.round(
      (params.jsonParseMs + params.schemaValidationMs + params.normalizationMs) * 100,
    ) / 100,
    installmentCount: params.installmentCount,
    success: params.success,
  });
}

export function logAmortizationGptSummary(params: {
  model: string;
  ocrTextCharCount: number;
  ocrTextEstimatedTokens: number;
  systemPromptCharCount: number;
  userPromptCharCount: number;
  responseCharCount: number;
  responseEstimatedTokens: number;
  durations: AmortizationGptPhaseDurations;
  openAiUsage?: {
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
  };
  success: boolean;
  error?: string;
}): void {
  const phases: Array<{ name: string; ms: number }> = [
    { name: "promptBuild", ms: params.durations.promptBuildMs ?? 0 },
    { name: "openAiCompletion", ms: params.durations.openAiCompletionMs ?? 0 },
    { name: "jsonParse", ms: params.durations.jsonParseMs ?? 0 },
    { name: "schemaValidation", ms: params.durations.schemaValidationMs ?? 0 },
    { name: "normalization", ms: params.durations.normalizationMs ?? 0 },
    { name: "clientNetworkFetch", ms: params.durations.clientNetworkFetchMs ?? 0 },
    { name: "clientResponseJsonParse", ms: params.durations.clientResponseJsonParseMs ?? 0 },
  ].filter((p) => p.ms > 0);

  const ranked = [...phases].sort((a, b) => b.ms - a.ms);
  const longest = ranked[0];

  log("amortization_gpt_summary", {
    openAiModel: params.model,
    ocrTextCharCount: params.ocrTextCharCount,
    ocrTextEstimatedTokens: params.ocrTextEstimatedTokens,
    systemPromptCharCount: params.systemPromptCharCount,
    userPromptCharCount: params.userPromptCharCount,
    responseCharCount: params.responseCharCount,
    responseEstimatedTokens: params.responseEstimatedTokens,
    durationsMs: params.durations,
    openAiUsage: params.openAiUsage ?? null,
    longestPhase: longest ?? null,
    bottleneckHypothesis: longest
      ? longest.name === "openAiCompletion"
        ? "model_latency_or_prompt_tokens"
        : longest.name === "clientNetworkFetch"
          ? "network_plus_server_total"
          : longest.name === "jsonParse" || longest.name === "schemaValidation"
            ? "post_processing"
            : longest.name === "promptBuild"
              ? "prompt_size"
              : longest.name
      : null,
    success: params.success,
    error: params.error ?? null,
  });
}
