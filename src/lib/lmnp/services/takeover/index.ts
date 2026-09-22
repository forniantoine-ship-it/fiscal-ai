/**
 * Lot 4B — candidate facts documentaires de reprise comptable.
 *
 * Frontière : DOCUMENT EXTRACTION → Candidate Facts
 * (réconciliation / Opening / moteurs = lots suivants).
 *
 * Emplacement `takeover/` : couche d'entrée documentaire distincte de
 * `fiscal-year-opening/` (état d'ouverture accepté/validable).
 */

export {
  applyCandidateCorrection,
  confirmCandidate,
  documentAbsentCandidate,
  extractionImpossibleCandidate,
  isCandidateAbsent,
  isCandidatePresent,
  missingCandidate,
  presentCandidate,
  type CandidateCorrectionTrail,
  type CandidateProvenance,
  type CandidateReviewState,
  type CandidateValue,
  type CandidateValueAbsent,
  type CandidateValueNature,
  type CandidateValuePresent,
  type TakeoverDocumentRole,
} from "./candidate-value";

export type {
  CandidateAssetClassification,
  CandidateAssetKey,
  CandidateDepreciationMethod,
  CandidateHistoricalAsset,
} from "./asset-candidates";

export {
  assertNotCase318AmortStockSource,
  type AmortissementsReportesCandidateSource,
  type CandidateDeficitRow,
  type CandidateFiscalStocks,
} from "./fiscal-stocks-candidates";

export type { TakeoverCandidatePackage } from "./package";

export {
  mapAcceptedCandidateAssetsToOpening,
  mapAcceptedCandidateStocksToOpening,
  type MapAcceptedAssetsInput,
  type MapAcceptedAssetsResult,
  type MapAcceptedIssue,
  type MapAcceptedStocksInput,
  type MapAcceptedStocksResult,
} from "./map-accepted-to-opening";

export {
  fixtureAssetRegisterCandidates,
  fixtureTaxPackageCandidates,
  fixtureTakeoverCandidatePackage,
} from "./fixtures";

export {
  extractDepreciationRegisterFromSpreadsheet,
  parseRegisterAmount,
  parseRegisterDurationYears,
  parseRegisterStartDate,
  type DepreciationRegisterDiagnostic,
  type DepreciationRegisterDiagnosticCode,
  type DepreciationRegisterExtractionResult,
  type DepreciationRegisterExtractionStatus,
  type DepreciationRegisterSheetMeta,
  type ExtractDepreciationRegisterInput,
  type RegisterColumnRole,
} from "./extract-depreciation-register-spreadsheet";
