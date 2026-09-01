/**
 * Pipeline debug logging — every stage artifact is inspectable.
 */

import { columnRoleMappingToObject } from "../spatial-amortization-core";
import type { AmortizationPipelineTrace } from "./types";

const LOG_PREFIX = "[amortization-pipeline]";

export function logPipelineTrace(trace: AmortizationPipelineTrace): void {
  console.log(LOG_PREFIX, "stage_a_raw_cells", {
    cellCount: trace.stageA.rawPdfCells.length,
    sample: trace.stageA.rawPdfCells.slice(0, 5),
  });

  console.log(LOG_PREFIX, "stage_b_reconstructed_rows", {
    rowCount: trace.stageB.reconstructedRows.length,
    columnSlots: trace.stageB.columnSlots,
    sample: trace.stageB.reconstructedRows.slice(0, 3).map((row) => ({
      page: row.pageNumber,
      gapBased: row.gapBasedColumns,
      bucket: row.bucketColumns,
      aligned: row.bucketAligned,
    })),
  });

  console.log(LOG_PREFIX, "stage_c_column_candidates", {
    headerLabels: trace.stageC.headerLabels,
    topCandidates: trace.stageC.candidates.slice(0, 10),
    preferredMapping: columnRoleMappingToObject(
      new Map([...trace.stageC.preferredMapping.entries()].map(([k, v]) => [k, v as never])),
    ),
  });

  console.log(LOG_PREFIX, "stage_d_phase_detection", {
    segments: trace.stageD.segments,
    transitions: trace.stageD.transitions,
  });

  console.log(LOG_PREFIX, "stage_e_mapping_hypotheses", {
    chosen: trace.stageE.chosenHypothesisId,
    rejected: trace.stageE.rejectedHypothesisIds,
    hypotheses: trace.stageE.hypotheses.map((h) => ({
      id: h.hypothesisId,
      phase: h.phase,
      confidence: h.confidence,
      balanceScore: h.balanceScore,
      crdScore: h.crdConsistencyScore,
      temporalScore: h.temporalConsistencyScore,
      heuristics: h.appliedHeuristics,
      rejected: h.rejected,
      rejectionReasons: h.rejectionReasons,
      installmentCount: h.installments.length,
    })),
  });

  console.log(LOG_PREFIX, "stage_f_validation", {
    totalRows: trace.stageF.installments.length,
    invalid: trace.stageF.invalidRowCount,
    ambiguous: trace.stageF.ambiguousRowCount,
    aggregateBalanceScore: trace.stageF.aggregateBalanceScore,
    aggregateCrdScore: trace.stageF.aggregateCrdConsistencyScore,
    invalidSample: trace.stageF.installments
      .filter((row) => row.status !== "valid")
      .slice(0, 5)
      .map((row) => ({
        date: row.installment.date,
        status: row.status,
        errors: row.validationErrors,
      })),
  });

  if (trace.stageG) {
    console.log(LOG_PREFIX, "stage_g_fiscal_projection", trace.stageG);
  }

  console.log(LOG_PREFIX, "stage_h_confidence", trace.stageH);
}

export function logPipelineSummary(params: {
  source: string;
  success: boolean;
  confidenceScore: number;
  installmentCount: number;
  recommendGptFallback: boolean;
}): void {
  console.log(LOG_PREFIX, "summary", params);
}
