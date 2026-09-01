/**
 * Immutable amortization extraction pipeline.
 * @see run-amortization-pipeline.ts
 */

export { runAmortizationPipeline, type RunAmortizationPipelineOptions } from "./run-amortization-pipeline";
export { logPipelineTrace, logPipelineSummary } from "./pipeline-debug";
export {
  logPipelineDebug,
  logPipelineResultValidity,
  logUiAnalyseImpossible,
  logCreditPipelineSpatialBridge,
  PIPELINE_DEBUG_PREFIX,
} from "./pipeline-instrumentation";
export type {
  AmortizationPipelineResult,
  AmortizationPipelineTrace,
  RawPdfCell,
  ReconstructedRow,
  ColumnRoleCandidate,
  ColumnCandidatesArtifact,
  PhaseSegment,
  PhaseTransition,
  MappingHypothesis,
  MappingHypothesesArtifact,
  ValidatedInstallment,
  FinancialValidationArtifact,
  FiscalProjectionArtifact,
  ConfidenceArtifact,
  LoanPhaseType,
  ColumnSemanticRole,
  RowValidationStatus,
} from "./types";
