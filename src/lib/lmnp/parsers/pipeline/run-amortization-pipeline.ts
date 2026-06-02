/**
 * Immutable amortization extraction pipeline orchestrator.
 *
 * Stage A → rawPdfCells
 * Stage B → reconstructedRows
 * Stage C → columnCandidates
 * Stage D → phaseCandidates
 * Stage E → mappingCandidates
 * Stage F → validatedInstallments
 * Stage G → fiscalProjection
 * Stage H → confidence/fallback
 */

import {
  collectGlobalHeaderMapping,
  computeColumnNumericStats,
  isProbableInstallmentRow,
  isTotalOrSubtotalRow,
  mappingColumnSpan,
  refineColumnRoleMapping,
  rowToInstallment,
  type SpatialInstallment,
  type SpatialTableRow,
} from "../spatial-amortization-core";
import {
  countInstallmentSurvival,
  logDeferredSurvivalTimeline,
  logInstallmentSurvivalStage,
  logValidationSurvival,
} from "./installment-survival-debug";
import { logPipelineSummary, logPipelineTrace } from "./pipeline-debug";
import {
  logPipelineEntry,
  logPipelineEntryCatch,
} from "@/lib/lmnp/services/pipeline-entry-debug";
import {
  logPipelineDebug,
  logPipelineResultValidity,
  runPipelineStage,
  type PipelineInstrumentationContext,
} from "./pipeline-instrumentation";
import { runStageA_RawPdfCells } from "./stage-a-raw-cells";
import { reconstructedRowToSpatialRow, runStageB_ReconstructedRows } from "./stage-b-reconstructed-rows";
import {
  preferredMappingToColumnRoleMapping,
  runStageC_ColumnCandidates,
} from "./stage-c-column-candidates";
import { runStageD_PhaseDetection } from "./stage-d-phase-detection";
import {
  mergeSegmentInstallments,
  runStageE_MappingHypotheses,
} from "./stage-e-mapping-hypotheses";
import { runStageF_FinancialValidation } from "./stage-f-validation";
import { runStageG_FiscalProjection } from "./stage-g-fiscal-projection";
import { runStageH_Confidence } from "./stage-h-confidence";
import type { AmortizationPipelineResult, LoanPhaseType } from "./types";

export type RunAmortizationPipelineOptions = {
  source: string;
  totalPages: number;
  fiscalYear?: number;
  enableDebugLogs?: boolean;
};

function countProbableRows(rows: SpatialTableRow[]): number {
  return rows.filter(
    (row) => !isTotalOrSubtotalRow(row) && isProbableInstallmentRow(row.columns),
  ).length;
}

function bootstrapInstallments(
  rowRecords: ReturnType<typeof runStageD_PhaseDetection>["rowRecords"],
  baseMapping: ReturnType<typeof preferredMappingToColumnRoleMapping>,
): SpatialInstallment[] {
  const headerColumnCount = mappingColumnSpan(baseMapping) || rowRecords[0]?.spatialRow.columns.length || 0;
  const installments: SpatialInstallment[] = [];

  for (const record of rowRecords) {
    const { installment } = rowToInstallment(record.spatialRow, baseMapping, headerColumnCount, {
      loanPhase: "unknown",
      enableDeferredHeuristics: false,
      enableDeferredDuplicatePreservation: false,
      preserveOrderedAmountRepeats: false,
    });
    installments.push(installment);
  }

  return installments;
}

function resolvePhaseForRow(
  rowIndex: number,
  segments: ReturnType<typeof runStageD_PhaseDetection>["artifact"]["segments"],
): LoanPhaseType {
  for (const segment of segments) {
    const start = segment.startInstallmentIndex ?? 0;
    const end = segment.endInstallmentIndex ?? Infinity;
    if (rowIndex >= start && rowIndex <= end) return segment.phase;
  }
  return "unknown";
}

export function runAmortizationPipeline(
  inputRows: SpatialTableRow[],
  options: RunAmortizationPipelineOptions,
): AmortizationPipelineResult {
  const { source, totalPages, fiscalYear, enableDebugLogs = true } = options;
  const ctx: PipelineInstrumentationContext = { source, errors: [] };

  logPipelineEntry({
    functionName: "runAmortizationPipeline",
    entered: true,
    extra: { source, totalPages, inputRowCount: inputRows.length, fiscalYear: fiscalYear ?? null },
  });

  logPipelineDebug("orchestrator_enter", {
    source,
    totalPages,
    inputRowCount: inputRows.length,
    fiscalYear: fiscalYear ?? null,
  });

  try {
    const rawPdfCells = runPipelineStage({
      ctx,
      stage: "A",
      artifactLabel: "rawPdfCells",
      run: () => runStageA_RawPdfCells(inputRows),
      assert: (cells) => (cells.length === 0 ? "stage_a_zero_cells" : null),
    });

    const bootstrap = runPipelineStage({
      ctx,
      stage: "B_bootstrap",
      artifactLabel: "headerMappingBootstrap",
      run: () => {
        const globalHeader = collectGlobalHeaderMapping(inputRows);
        const bootstrapSpatialRows = inputRows.filter(
          (row) => !isTotalOrSubtotalRow(row) && isProbableInstallmentRow(row.columns),
        );
        const bootstrapStats = computeColumnNumericStats(bootstrapSpatialRows);
        const refinedGlobalMapping = refineColumnRoleMapping(globalHeader.mapping, bootstrapStats, {
          loanPhase: "unknown",
        });
        return { globalHeader, refinedGlobalMapping };
      },
    });

    const stageB = runPipelineStage({
      ctx,
      stage: "B",
      artifactLabel: "reconstructedRows",
      run: () => runStageB_ReconstructedRows(inputRows, bootstrap.refinedGlobalMapping),
      assert: (result) =>
        result.reconstructedRows.length !== inputRows.length
          ? `stage_b_row_count_mismatch:${result.reconstructedRows.length}_vs_${inputRows.length}`
          : null,
    });

    const stageC = runPipelineStage({
      ctx,
      stage: "C",
      artifactLabel: "columnCandidates",
      run: () => runStageC_ColumnCandidates(stageB.reconstructedRows),
      assert: (artifact) =>
        artifact.candidates.length === 0 ? "stage_c_zero_column_candidates" : null,
    });

    const baseMapping = preferredMappingToColumnRoleMapping(stageC.preferredMapping);

    const preliminaryRecords = stageB.reconstructedRows
      .filter((row) => {
        if (isTotalOrSubtotalRow(reconstructedRowToSpatialRow(row))) return false;
        return isProbableInstallmentRow(row.gapBasedColumns);
      })
      .map((row) => ({
        sourceRowIndex: row.sourceRowIndex,
        row,
        spatialRow: reconstructedRowToSpatialRow(row),
      }));

    logPipelineDebug("preliminary_records", {
      source,
      preliminaryRecordCount: preliminaryRecords.length,
    });

    const bootstrapInst = runPipelineStage({
      ctx,
      stage: "D",
      artifactLabel: "bootstrapInstallments",
      run: () => bootstrapInstallments(preliminaryRecords, baseMapping),
    });

    const stageDResult = runPipelineStage({
      ctx,
      stage: "D",
      artifactLabel: "phaseDetection",
      run: () =>
        runStageD_PhaseDetection(stageB.reconstructedRows, bootstrap.globalHeader.mapping, bootstrapInst),
      assert: (result) => {
        if (preliminaryRecords.length > 0 && result.rowRecords.length === 0) {
          return "stage_d_lost_all_row_records";
        }
        return null;
      },
    });

    const stageD = stageDResult.artifact;
    const rowRecords = stageDResult.rowRecords;

    logDeferredSurvivalTimeline({
      checkpoint: "stage_d_bootstrap_before_merge",
      installments: bootstrapInst,
      segments: stageD.segments,
      extra: {
        reconstructedRowCount: stageB.reconstructedRows.length,
        rowRecordCount: rowRecords.length,
        segmentCount: stageD.segments.length,
        segments: stageD.segments.map((segment) => ({
          phase: segment.phase,
          start: segment.startInstallmentIndex,
          end: segment.endInstallmentIndex,
        })),
      },
    });

    const stageE = runPipelineStage({
      ctx,
      stage: "E",
      artifactLabel: "mappingHypotheses",
      run: () => runStageE_MappingHypotheses(rowRecords, stageD.segments, baseMapping),
      assert: (artifact) => {
        if (rowRecords.length > 0 && artifact.hypotheses.length === 0) {
          return "stage_e_zero_hypotheses_with_row_records";
        }
        if (rowRecords.length > 0 && !artifact.chosenHypothesisId) {
          return "stage_e_no_chosen_hypothesis";
        }
        return null;
      },
    });

    const chosenHypotheses = stageE.hypotheses.filter((h) => !h.rejected);

    logInstallmentSurvivalStage("stage_e_pre_merge_bootstrap", bootstrapInst, {
      segmentCount: stageD.segments.length,
      rowRecordCount: rowRecords.length,
    });

    logDeferredSurvivalTimeline({
      checkpoint: "stage_e_pre_merge_bootstrap",
      installments: bootstrapInst,
      segments: stageD.segments,
      extra: { deferredRowCountBeforeMerge: countInstallmentSurvival(bootstrapInst).deferred },
    });

    const mergedInstallments = runPipelineStage({
      ctx,
      stage: "E",
      artifactLabel: "mergedInstallments",
      run: () =>
        mergeSegmentInstallments(
          stageD.segments,
          stageE.hypotheses,
          rowRecords.length,
          bootstrapInst,
        ),
      assert: (installments) => {
        if (rowRecords.length > 0 && installments.length === 0) {
          return "stage_e_merge_produced_zero_installments";
        }
        if (installments.length !== rowRecords.length) {
          return `stage_e_merge_length_mismatch:${installments.length}_vs_${rowRecords.length}`;
        }
        const undefinedCount = installments.filter((row) => row === undefined).length;
        if (undefinedCount > 0) {
          return `stage_e_merge_has_${undefinedCount}_undefined_slots`;
        }
        return null;
      },
    });

    logInstallmentSurvivalStage("stage_e_post_merge", mergedInstallments, {
      rowRecordCount: rowRecords.length,
    });

    logDeferredSurvivalTimeline({
      checkpoint: "stage_e_post_merge",
      installments: mergedInstallments,
      segments: stageD.segments,
      extra: { deferredRowCountAfterMerge: countInstallmentSurvival(mergedInstallments).deferred },
    });

    const validationRowRecords = rowRecords.map((record, index) => ({
      sourceRowIndex: record.sourceRowIndex,
      phase: resolvePhaseForRow(index, stageD.segments),
    }));

    const stageF = runPipelineStage({
      ctx,
      stage: "F",
      artifactLabel: "financialValidation",
      run: () =>
        runStageF_FinancialValidation(validationRowRecords, chosenHypotheses, mergedInstallments),
      assert: (artifact) =>
        mergedInstallments.length > 0 && artifact.installments.length === 0
          ? "stage_f_zero_validated_rows"
          : null,
    });

    logValidationSurvival(stageF.installments);

    logDeferredSurvivalTimeline({
      checkpoint: "stage_f_post_validation",
      installments: mergedInstallments,
      segments: stageD.segments,
      phaseByIndex: validationRowRecords.map((record) => record.phase),
      extra: {
        deferredRowCountAfterValidation: countInstallmentSurvival(
          mergedInstallments,
          validationRowRecords.map((record) => record.phase),
        ).deferred,
        invalidRowCount: stageF.invalidRowCount,
        ambiguousRowCount: stageF.ambiguousRowCount,
      },
    });

    logInstallmentSurvivalStage("stage_f_post_validation", mergedInstallments, {
      validatedRowCount: stageF.installments.length,
      invalidRowCount: stageF.invalidRowCount,
      ambiguousRowCount: stageF.ambiguousRowCount,
    });

    const stageG = fiscalYear
      ? runPipelineStage({
          ctx,
          stage: "G",
          artifactLabel: "fiscalProjection",
          run: () => runStageG_FiscalProjection(stageF.installments, fiscalYear),
        })
      : undefined;

    const stageH = runPipelineStage({
      ctx,
      stage: "H",
      artifactLabel: "confidence",
      run: () =>
        runStageH_Confidence({
          installments: mergedInstallments,
          probableRowCount: countProbableRows(inputRows),
          parsedRowCount: mergedInstallments.length,
          headerRoleCount: bootstrap.globalHeader.mapping.size,
          validation: stageF,
          fiscal: stageG,
        }),
    });

    const trace = {
      source,
      totalPages,
      stageA: { rawPdfCells },
      stageB: {
        reconstructedRows: stageB.reconstructedRows,
        columnSlots: stageB.columnSlotSnapshots,
      },
      stageC,
      stageD,
      stageE,
      stageF,
      stageG,
      stageH,
    };

    const pipelineResult: AmortizationPipelineResult = {
      success: stageH.success,
      confidenceScore: stageH.overallConfidence,
      installments: mergedInstallments,
      detectedColumns: stageC.headerLabels,
      detectedInstallmentRows: mergedInstallments.length,
      trace,
    };

    logPipelineResultValidity({
      source,
      pipelineResult,
      ctxErrors: ctx.errors,
    });

    if (enableDebugLogs) {
      logPipelineTrace(trace);
      logPipelineSummary({
        source,
        success: stageH.success,
        confidenceScore: stageH.overallConfidence,
        installmentCount: mergedInstallments.length,
        recommendGptFallback: stageH.recommendGptFallback,
      });
    }

    if (ctx.errors.length > 0) {
      logPipelineDebug("orchestrator_completed_with_invariant_warnings", {
        source,
        errorCount: ctx.errors.length,
        errors: ctx.errors,
      });
    }

    logPipelineDebug("orchestrator_exit", {
      source,
      success: pipelineResult.success,
      installmentCount: pipelineResult.installments.length,
      confidenceScore: pipelineResult.confidenceScore,
    });

    logPipelineEntry({
      functionName: "runAmortizationPipeline",
      returned: true,
      success: pipelineResult.success,
      failureReason: pipelineResult.success ? null : `confidence_${pipelineResult.confidenceScore}`,
      installmentCount: pipelineResult.installments.length,
      datedInstallmentCount: pipelineResult.installments.filter((row) => Boolean(row.date?.trim()))
        .length,
      extra: { source, ctxErrorCount: ctx.errors.length },
    });

    return pipelineResult;
  } catch (error) {
    logPipelineEntryCatch("runAmortizationPipeline", error, {
      extra: { source, accumulatedErrors: ctx.errors },
    });
    logPipelineDebug("orchestrator_throw", {
      source,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      accumulatedErrors: ctx.errors,
    });
    throw error;
  }
}
