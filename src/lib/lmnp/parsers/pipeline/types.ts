/**
 * Immutable artifact types for the amortization extraction pipeline.
 * Each stage produces a new artifact — previous stages are never mutated.
 */

import type { SpatialInstallment, SpatialTableRow } from "../spatial-amortization-core";

/** Stage A — raw PDF text cells (no interpretation). */
export type RawPdfCell = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageNumber: number;
};

/** Stage B — visually reconstructed table row with fixed X-bucket columns. */
export type ReconstructedRow = {
  pageNumber: number;
  y: number;
  /** Gap-based columns from Y clustering (preserved for audit). */
  gapBasedColumns: string[];
  /** X-bucket aligned columns (fixed slots, no left-shift). */
  bucketColumns: string[];
  raw: string;
  sourceRowIndex: number;
  /** Whether bucket alignment was applied. */
  bucketAligned: boolean;
};

export type ColumnSemanticRole =
  | "payment"
  | "principal"
  | "interest"
  | "insurance"
  | "remainingCapital"
  | "rank"
  | "date"
  | "unknown";

/** Stage C — scored column role candidate (non-definitive). */
export type ColumnRoleCandidate = {
  role: ColumnSemanticRole;
  columnIndex: number;
  confidence: number;
  reason: string;
};

export type ColumnCandidatesArtifact = {
  headerLabels: string[];
  candidates: ColumnRoleCandidate[];
  /** Best-effort header mapping for downstream use (not authoritative). */
  preferredMapping: Map<number, ColumnSemanticRole>;
  columnStats: ColumnStatsSnapshot[];
};

export type ColumnStatsSnapshot = {
  columnIndex: number;
  mean: number;
  median: number;
  max: number;
  zeroRatio: number;
  monotonicDecreaseRatio: number;
  flatRatio: number;
  sampleCount: number;
};

export type LoanPhaseType =
  | "deferred_total"
  | "deferred_partial"
  | "amortization"
  | "ptz"
  | "intercalary"
  | "transition"
  | "unknown";

/** Stage D — detected loan phase segment. */
export type PhaseSegment = {
  phase: LoanPhaseType;
  startRowIndex: number;
  endRowIndex: number;
  /** Index into validated installment list once parsed. */
  startInstallmentIndex?: number;
  endInstallmentIndex?: number;
};

export type PhaseTransition = {
  fromPhase: LoanPhaseType;
  toPhase: LoanPhaseType;
  rowIndex: number;
  installmentIndex?: number;
  reason: string;
};

export type PhaseCandidatesArtifact = {
  segments: PhaseSegment[];
  transitions: PhaseTransition[];
};

/** Stage E — competing mapping interpretation for a phase segment. */
export type MappingHypothesis = {
  hypothesisId: string;
  phase: LoanPhaseType;
  segmentStart: number;
  segmentEnd: number;
  columnMapping: Map<number, ColumnSemanticRole>;
  confidence: number;
  balanceScore: number;
  crdConsistencyScore: number;
  temporalConsistencyScore: number;
  reason: string;
  /** Scoped heuristics applied (must not leak across phases). */
  appliedHeuristics: string[];
  installments: SpatialInstallment[];
  rejected: boolean;
  rejectionReasons: string[];
};

export type MappingHypothesesArtifact = {
  hypotheses: MappingHypothesis[];
  chosenHypothesisId: string | null;
  rejectedHypothesisIds: string[];
};

export type RowValidationStatus =
  | "valid"
  | "invalid"
  | "ambiguous"
  | "low_confidence"
  | "unclassified";

/** Stage F — validated installment with audit metadata. */
export type ValidatedInstallment = {
  installment: SpatialInstallment;
  sourceRowIndex: number;
  phase: LoanPhaseType;
  status: RowValidationStatus;
  validationErrors: string[];
  confidence: number;
  hypothesisId: string;
};

export type FinancialValidationArtifact = {
  installments: ValidatedInstallment[];
  aggregateBalanceScore: number;
  aggregateCrdConsistencyScore: number;
  aggregateTemporalScore: number;
  invalidRowCount: number;
  ambiguousRowCount: number;
};

/** Stage G — fiscal year projection. */
export type FiscalProjectionArtifact = {
  fiscalYear: number;
  yearlyInterest: number;
  yearlyInsurance: number;
  yearlyPrincipal: number;
  crdYearEnd?: number;
  crdAsOf?: string;
  installmentCountInYear: number;
  confidence: {
    interests: number;
    insurance: number;
    crd: number;
    overall: number;
  };
};

/** Stage H — confidence and fallback decision. */
export type ConfidenceArtifact = {
  overallConfidence: number;
  fieldConfidences: Record<string, number>;
  recommendGptFallback: boolean;
  fallbackReason?: string;
  success: boolean;
};

/** Full immutable pipeline trace — every stage artifact preserved. */
export type AmortizationPipelineTrace = {
  source: string;
  totalPages: number;
  stageA: { rawPdfCells: RawPdfCell[] };
  stageB: { reconstructedRows: ReconstructedRow[]; columnSlots: ColumnSlotSnapshot[] };
  stageC: ColumnCandidatesArtifact;
  stageD: PhaseCandidatesArtifact;
  stageE: MappingHypothesesArtifact;
  stageF: FinancialValidationArtifact;
  stageG?: FiscalProjectionArtifact;
  stageH: ConfidenceArtifact;
};

export type ColumnSlotSnapshot = {
  columnIndex: number;
  role: ColumnSemanticRole | null;
  minX: number;
  maxX: number;
};

/** Public pipeline result — backward-compatible with SpatialAmortizationParseResult. */
export type AmortizationPipelineResult = {
  success: boolean;
  confidenceScore: number;
  installments: SpatialInstallment[];
  detectedColumns: string[];
  detectedInstallmentRows: number;
  trace: AmortizationPipelineTrace;
};

/** Row record used internally between stages B→E. */
export type InstallmentRowRecord = {
  sourceRowIndex: number;
  row: ReconstructedRow;
  spatialRow: SpatialTableRow;
};
