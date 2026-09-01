/**
 * Deep timing instrumentation for runCreditDocumentPipeline.
 * Logger: [credit-pipeline-timing]
 */

export type CreditPipelineTimingSide = "client" | "server";

type TimingStep = {
  order: number;
  step: string;
  side: CreditPipelineTimingSide;
  durationMs: number;
  cumulativeMs: number;
  at: string;
  extra?: Record<string, unknown>;
};

type TimingSession = {
  traceId: string;
  documentId: string;
  fileName: string;
  documentKind: string;
  side: CreditPipelineTimingSide;
  startedAt: number;
  lastMarkAt: number;
  steps: TimingStep[];
  counters: Record<string, number>;
};

let activeSession: TimingSession | null = null;
let runSequence = 0;

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function logPayload(payload: Record<string, unknown>): void {
  console.log("[credit-pipeline-timing]", payload);
}

export function getCreditPipelineTraceId(): string | null {
  return activeSession?.traceId ?? null;
}

export function incrementCreditPipelineCounter(name: string, by = 1): void {
  if (!activeSession) return;
  activeSession.counters[name] = (activeSession.counters[name] ?? 0) + by;
}

export function startCreditPipelineTiming(params: {
  documentId: string;
  fileName: string;
  documentKind: string;
  side?: CreditPipelineTimingSide;
}): string {
  runSequence += 1;
  const traceId = `credit-pipeline-${params.documentId}-${runSequence}`;
  const now = performance.now();
  activeSession = {
    traceId,
    documentId: params.documentId,
    fileName: params.fileName,
    documentKind: params.documentKind,
    side: params.side ?? "client",
    startedAt: now,
    lastMarkAt: now,
    steps: [],
    counters: {},
  };

  logPayload({
    event: "pipeline_started",
    traceId,
    documentId: params.documentId,
    fileName: params.fileName,
    documentKind: params.documentKind,
    side: activeSession.side,
    at: new Date().toISOString(),
  });

  return traceId;
}

/** Server routes: attach to client trace when X-Credit-Pipeline-Trace-Id is sent. */
export function attachCreditPipelineServerTiming(
  traceId: string,
  meta: { documentKind?: string; fileName?: string; segment: string },
): void {
  const now = performance.now();
  activeSession = {
    traceId,
    documentId: traceId,
    fileName: meta.fileName ?? "—",
    documentKind: meta.documentKind ?? "—",
    side: "server",
    startedAt: now,
    lastMarkAt: now,
    steps: [],
    counters: {},
  };

  logPayload({
    event: "server_segment_started",
    traceId,
    segment: meta.segment,
    at: new Date().toISOString(),
  });
}

export function detachCreditPipelineServerTiming(): void {
  if (activeSession?.side === "server") {
    endCreditPipelineTiming({ reason: "server_segment_complete" });
  }
}

function recordStep(
  step: string,
  durationMs: number,
  side: CreditPipelineTimingSide,
  extra?: Record<string, unknown>,
): void {
  if (!activeSession) {
    logPayload({
      event: "orphan_step",
      step,
      side,
      durationMs: roundMs(durationMs),
      ...extra,
    });
    return;
  }

  const cumulativeMs = roundMs(performance.now() - activeSession.startedAt);
  activeSession.steps.push({
    order: activeSession.steps.length + 1,
    step,
    side,
    durationMs: roundMs(durationMs),
    cumulativeMs,
    at: new Date().toISOString(),
    extra,
  });
  activeSession.lastMarkAt = performance.now();

  logPayload({
    event: "step",
    traceId: activeSession.traceId,
    documentId: activeSession.documentId,
    documentKind: activeSession.documentKind,
    side,
    order: activeSession.steps.length,
    step,
    durationMs: roundMs(durationMs),
    cumulativeMs,
    counters: { ...activeSession.counters },
    ...extra,
  });
}

export function traceCreditPipelineStep(
  step: string,
  extra?: Record<string, unknown>,
  side: CreditPipelineTimingSide = activeSession?.side ?? "client",
): void {
  if (!activeSession) {
    logPayload({ event: "orphan_marker", step, side, ...extra });
    return;
  }
  const durationMs = performance.now() - activeSession.lastMarkAt;
  recordStep(step, durationMs, side, extra);
}

export function measureCreditPipelineSync<T>(
  step: string,
  fn: () => T,
  extra?: Record<string, unknown>,
  side: CreditPipelineTimingSide = activeSession?.side ?? "client",
): T {
  const startedAt = performance.now();
  try {
    return fn();
  } finally {
    recordStep(step, performance.now() - startedAt, side, extra);
  }
}

export async function measureCreditPipelineAwait<T>(
  step: string,
  promise: Promise<T>,
  extra?: Record<string, unknown>,
  side: CreditPipelineTimingSide = activeSession?.side ?? "client",
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await promise;
  } finally {
    recordStep(step, performance.now() - startedAt, side, extra);
  }
}

export function endCreditPipelineTiming(extra?: Record<string, unknown>): void {
  if (!activeSession) return;

  const totalMs = roundMs(performance.now() - activeSession.startedAt);
  const ranked = [...activeSession.steps].sort((a, b) => b.durationMs - a.durationMs);
  const longest = ranked[0];
  const sequentialAwaitMs = roundMs(
    activeSession.steps.reduce((sum, step) => sum + step.durationMs, 0),
  );

  const duplicateHints: string[] = [];
  if ((activeSession.counters.pdf_get_document ?? 0) > 1) {
    duplicateHints.push(
      `pdf.js getDocument called ${activeSession.counters.pdf_get_document} times (native + raster often sequential)`,
    );
  }
  if ((activeSession.counters.vision_ocr_requests ?? 0) > 1) {
    duplicateHints.push(`vision OCR requests: ${activeSession.counters.vision_ocr_requests}`);
  }
  if ((activeSession.counters.gpt_extract_requests ?? 0) > 1) {
    duplicateHints.push(`GPT extract requests: ${activeSession.counters.gpt_extract_requests}`);
  }

  logPayload({
    event: "pipeline_complete",
    traceId: activeSession.traceId,
    documentId: activeSession.documentId,
    fileName: activeSession.fileName,
    documentKind: activeSession.documentKind,
    side: activeSession.side,
    totalMs,
    sequentialAwaitMs,
    stepCount: activeSession.steps.length,
    counters: activeSession.counters,
    longestStep: longest
      ? { step: longest.step, durationMs: longest.durationMs, cumulativeMs: longest.cumulativeMs }
      : null,
    topSteps: ranked.slice(0, 8).map((s) => ({
      step: s.step,
      durationMs: s.durationMs,
      cumulativeMs: s.cumulativeMs,
    })),
    parallelizationHints: duplicateHints,
    note: "coherence_comparison runs in applyPipelineResult after pipeline returns (client, not included)",
    ...extra,
  });

  activeSession = null;
}
