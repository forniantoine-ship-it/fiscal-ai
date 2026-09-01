/**
 * TEMPORARY pipeline debug instrumentation.
 * Purpose: surface hidden technical failures masked as "Analyse impossible".
 * Remove once root cause is confirmed.
 */

import type { AmortizationPipelineResult, AmortizationPipelineTrace } from "./types";

export const PIPELINE_DEBUG_PREFIX = "[amortization-pipeline-debug]";

export type PipelineStageName =
  | "A"
  | "B"
  | "B_bootstrap"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "orchestrator";

export type PipelineStageError = {
  stage: PipelineStageName;
  message: string;
  stack?: string;
  artifactSnapshot?: unknown;
  invariant?: string;
};

export type PipelineInstrumentationContext = {
  source: string;
  errors: PipelineStageError[];
};

function captureStack(error: unknown): string | undefined {
  if (error instanceof Error) return error.stack;
  return new Error(String(error)).stack;
}

function summarizeArtifact(stage: PipelineStageName, artifact: unknown): unknown {
  if (artifact === null) return { kind: "null" };
  if (artifact === undefined) return { kind: "undefined" };
  if (Array.isArray(artifact)) {
    return {
      kind: "array",
      length: artifact.length,
      sample: artifact.slice(0, 2),
    };
  }
  if (typeof artifact !== "object") return { kind: typeof artifact, value: artifact };

  const record = artifact as Record<string, unknown>;

  if (stage === "A" && Array.isArray(record.rawPdfCells)) {
    return { rawPdfCellCount: record.rawPdfCells.length };
  }

  if (stage === "B" && Array.isArray(record.reconstructedRows)) {
    return {
      reconstructedRowCount: record.reconstructedRows.length,
      columnSlotCount: Array.isArray(record.columnSlots) ? record.columnSlots.length : null,
      bucketAlignedCount: (record.reconstructedRows as Array<{ bucketAligned?: boolean }>).filter(
        (row) => row.bucketAligned,
      ).length,
    };
  }

  if (stage === "C" && Array.isArray(record.candidates)) {
    return {
      candidateCount: record.candidates.length,
      headerLabelCount: Array.isArray(record.headerLabels) ? record.headerLabels.length : null,
      preferredMappingSize:
        record.preferredMapping instanceof Map ? record.preferredMapping.size : null,
    };
  }

  if (stage === "D") {
    return {
      segmentCount: Array.isArray(record.segments) ? record.segments.length : null,
      transitionCount: Array.isArray(record.transitions) ? record.transitions.length : null,
      rowRecordCount: typeof record.rowRecordCount === "number" ? record.rowRecordCount : undefined,
    };
  }

  if (stage === "E" && Array.isArray(record.hypotheses)) {
    const hypotheses = record.hypotheses as Array<{
      hypothesisId: string;
      rejected: boolean;
      confidence: number;
      installmentCount?: number;
      installments?: unknown[];
    }>;
    return {
      hypothesisCount: hypotheses.length,
      chosenHypothesisId: record.chosenHypothesisId ?? null,
      rejectedHypothesisIds: record.rejectedHypothesisIds ?? [],
      hypotheses: hypotheses.map((h) => ({
        id: h.hypothesisId,
        rejected: h.rejected,
        confidence: h.confidence,
        installmentCount: h.installments?.length ?? h.installmentCount ?? null,
      })),
    };
  }

  if (stage === "F" && Array.isArray(record.installments)) {
    const rows = record.installments as Array<{ status?: string }>;
    return {
      validatedRowCount: rows.length,
      invalidRowCount: record.invalidRowCount ?? null,
      ambiguousRowCount: record.ambiguousRowCount ?? null,
      statusBreakdown: rows.reduce<Record<string, number>>((acc, row) => {
        const key = row.status ?? "unknown";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }

  if (stage === "G") {
    return {
      fiscalYear: record.fiscalYear ?? null,
      installmentCountInYear: record.installmentCountInYear ?? null,
      confidence: record.confidence ?? null,
    };
  }

  if (stage === "H") {
    return {
      overallConfidence: record.overallConfidence ?? null,
      success: record.success ?? null,
      recommendGptFallback: record.recommendGptFallback ?? null,
      fallbackReason: record.fallbackReason ?? null,
      fieldConfidences: record.fieldConfidences ?? null,
    };
  }

  return {
    keys: Object.keys(record),
    preview: record,
  };
}

export function logPipelineDebug(
  event: string,
  payload: Record<string, unknown>,
): void {
  console.log(PIPELINE_DEBUG_PREFIX, event, payload);
}

export function runPipelineStage<T>(params: {
  ctx: PipelineInstrumentationContext;
  stage: PipelineStageName;
  run: () => T;
  artifactLabel?: string;
  assert?: (artifact: T) => string | null;
}): T {
  const { ctx, stage, run, artifactLabel, assert } = params;

  logPipelineDebug("stage_enter", {
    stage,
    source: ctx.source,
    artifactLabel: artifactLabel ?? null,
  });

  try {
    const artifact = run();

    if (artifact === undefined) {
      const error: PipelineStageError = {
        stage,
        message: "Stage returned undefined artifact",
        invariant: "artifact_must_be_defined",
        artifactSnapshot: summarizeArtifact(stage, artifact),
      };
      ctx.errors.push(error);
      logPipelineDebug("stage_invariant_failed", error);
    }

    if (artifact === null) {
      logPipelineDebug("stage_null_artifact", {
        stage,
        source: ctx.source,
        artifactLabel: artifactLabel ?? null,
      });
    }

    const invariantFailure = assert?.(artifact) ?? null;
    if (invariantFailure) {
      const error: PipelineStageError = {
        stage,
        message: invariantFailure,
        invariant: invariantFailure,
        artifactSnapshot: summarizeArtifact(stage, artifact),
      };
      ctx.errors.push(error);
      logPipelineDebug("stage_invariant_failed", error);
    }

    logPipelineDebug("stage_exit", {
      stage,
      source: ctx.source,
      artifactLabel: artifactLabel ?? null,
      artifact: summarizeArtifact(stage, artifact as unknown),
    });

    return artifact;
  } catch (error) {
    const stageError: PipelineStageError = {
      stage,
      message: error instanceof Error ? error.message : String(error),
      stack: captureStack(error),
    };
    ctx.errors.push(stageError);

    logPipelineDebug("stage_throw", {
      ...stageError,
      source: ctx.source,
      artifactLabel: artifactLabel ?? null,
    });

    throw error;
  }
}

export function logPipelineResultValidity(params: {
  source: string;
  pipelineResult: AmortizationPipelineResult;
  ctxErrors: PipelineStageError[];
}): void {
  const { pipelineResult, ctxErrors, source } = params;
  const datedInstallments = pipelineResult.installments.filter((row) => Boolean(row.date?.trim()));
  const trace = pipelineResult.trace;

  logPipelineDebug("pipeline_result_validity", {
    source,
    success: pipelineResult.success,
    confidenceScore: pipelineResult.confidenceScore,
    installmentCount: pipelineResult.installments.length,
    datedInstallmentCount: datedInstallments.length,
    undatedInstallmentCount: pipelineResult.installments.length - datedInstallments.length,
    detectedInstallmentRows: pipelineResult.detectedInstallmentRows,
    stageErrors: ctxErrors,
    traceShape: summarizeTraceShape(trace),
    stageH: trace.stageH,
    rejectedHypotheses: trace.stageE.hypotheses
      .filter((h) => h.rejected)
      .map((h) => ({
        id: h.hypothesisId,
        reasons: h.rejectionReasons,
        confidence: h.confidence,
        installmentCount: h.installments.length,
      })),
    chosenHypothesisId: trace.stageE.chosenHypothesisId,
    mergedInstallmentSample: pipelineResult.installments.slice(0, 3),
  });

  if (!pipelineResult.success) {
    logPipelineDebug("pipeline_result_not_success", {
      source,
      reason: inferPipelineFailureReason(pipelineResult, ctxErrors),
      stageH: trace.stageH,
    });
  }

  if (pipelineResult.installments.length > 0 && datedInstallments.length === 0) {
    logPipelineDebug("pipeline_result_all_installments_undated", {
      source,
      installmentCount: pipelineResult.installments.length,
      sample: pipelineResult.installments.slice(0, 5),
      likelyImpact: "spatialInstallmentsToLoanInstallments will filter all rows → UI success=false",
    });
  }
}

function summarizeTraceShape(trace: AmortizationPipelineTrace): Record<string, unknown> {
  return {
    stageA_cells: trace.stageA.rawPdfCells.length,
    stageB_rows: trace.stageB.reconstructedRows.length,
    stageC_candidates: trace.stageC.candidates.length,
    stageD_segments: trace.stageD.segments.length,
    stageE_hypotheses: trace.stageE.hypotheses.length,
    stageF_validated: trace.stageF.installments.length,
    stageG_present: trace.stageG !== undefined,
    stageH_success: trace.stageH.success,
  };
}

function inferPipelineFailureReason(
  pipelineResult: AmortizationPipelineResult,
  ctxErrors: PipelineStageError[],
): string {
  if (ctxErrors.length > 0) {
    return `stage_error:${ctxErrors[ctxErrors.length - 1]!.stage}:${ctxErrors[ctxErrors.length - 1]!.message}`;
  }
  if (pipelineResult.installments.length < 3) {
    return `installment_count_${pipelineResult.installments.length}_below_min_3`;
  }
  if (pipelineResult.confidenceScore < 35) {
    return `confidence_${pipelineResult.confidenceScore}_below_min_35`;
  }
  if (pipelineResult.trace.stageH.recommendGptFallback) {
    return pipelineResult.trace.stageH.fallbackReason ?? "gpt_fallback_recommended";
  }
  return "unknown_pipeline_not_success";
}

export function logCreditPipelineSpatialBridge(params: {
  documentId: string;
  fileName: string;
  phase:
    | "spatial_parse_start"
    | "spatial_parse_ok"
    | "spatial_parse_threw"
    | "spatial_primary_decision"
    | "spatial_primary_build_result"
    | "final_credit_result";
  spatialParse?: {
    success: boolean;
    confidenceScore: number;
    installmentCount: number;
    datedInstallmentCount?: number;
  } | null;
  spatialPrimaryDecision?: { useSpatial: boolean; reason: string };
  amortizationSuccess?: boolean;
  amortizationError?: string;
  error?: unknown;
}): void {
  logPipelineDebug("credit_pipeline_bridge", {
    ...params,
    errorMessage: params.error instanceof Error ? params.error.message : String(params.error ?? ""),
    errorStack: params.error instanceof Error ? params.error.stack : undefined,
  });
}

export function logUiAnalyseImpossible(params: {
  source: string;
  documentId?: string;
  fileName?: string;
  reason: string;
  succeeded?: number;
  failed?: number;
  pipelineSuccess?: boolean;
  creditResultSuccess?: boolean;
  spatialConfidence?: number;
  spatialInstallmentCount?: number;
  stack?: string;
  extra?: Record<string, unknown>;
}): void {
  logPipelineDebug("ui_analyse_impossible", {
    ...params,
    stack: params.stack ?? new Error(`ui_analyse_impossible:${params.source}`).stack,
  });
}
