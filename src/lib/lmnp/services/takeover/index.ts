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

export {
  extractDepreciationRegisterFromPdf,
  parseRegisterDurationAnMois,
  type DepreciationRegisterPdfControlCheck,
  type DepreciationRegisterPdfDiagnostic,
  type DepreciationRegisterPdfDiagnosticCode,
  type DepreciationRegisterPdfExtractionResult,
  type DepreciationRegisterPdfExtractionStatus,
  type ExtractDepreciationRegisterFromPdfInput,
} from "./extract-depreciation-register-pdf";

export type {
  DepreciationRegisterPdfRow,
  DepreciationRegisterPdfRowType,
  DepreciationRegisterVisionPageImage,
  DepreciationRegisterVisionPageInput,
  DepreciationRegisterVisionPageResult,
  DepreciationRegisterVisionRequester,
} from "./depreciation-register-pdf-row";

export {
  createTaxPackageControlFact,
  createTaxPackageControlFacts,
  isTaxPackageControlFact,
  isV1TaxPackageControlCase,
  TAX_PACKAGE_CONTROL_V1_MATRIX,
  validateTaxPackageControlFact,
  type TaxPackageControlFact,
  type TaxPackageControlFactDraft,
  type TaxPackageControlFactIssue,
  type TaxPackageControlFactKind,
  type TaxPackageControlFacts,
  type TaxPackageControlFormType,
  type TaxPackageControlPeriodPosition,
  type TaxPackageControlSourceCase,
  type ValidateTaxPackageControlFactResult,
} from "./tax-package-control-facts";

export {
  createHistoricalControlReconciliation,
  HISTORICAL_CONTROL_RECONCILIATION_V1_PAIRS,
  isHistoricalControlReconciliationResult,
  type CreateHistoricalControlReconciliationInput,
  type CreateHistoricalControlReconciliationResult,
  type HistoricalControlNotComparableReason,
  type HistoricalControlReconciliationIssue,
  type HistoricalControlReconciliationKind,
  type HistoricalControlReconciliationResult,
  type HistoricalControlReconciliationSide,
  type HistoricalControlReconciliationSideSpec,
  type HistoricalControlReconciliationStatus,
} from "./historical-control-reconciliation";

export {
  reconcileHistoricalTaxPackageControls,
  type HistoricalTaxPackageControlsReconciliation,
} from "./reconcile-historical-tax-package-controls";

export {
  buildExternalTakeoverFiscalYearOpening,
  evaluateHistoricalControlsForExternalOpening,
  type BuildExternalTakeoverFiscalYearOpeningInput,
  type BuildExternalTakeoverFiscalYearOpeningResult,
  type ExternalTakeoverOpeningIssue,
  type HistoricalControlsOpeningGate,
} from "./build-external-takeover-opening";

export {
  selectBuiltExternalTakeoverOpening,
  type SelectBuiltExternalTakeoverOpeningResult,
} from "./select-built-external-takeover-opening";

export {
  extractTaxPackageControlFactsFromLiasse,
  type ExtractTaxPackageControlFactsFromLiasseInput,
  type ExtractTaxPackageControlFactsFromLiasseResult,
  type TaxPackageControlFactSkip,
  type TaxPackageLiasseCaseObservation,
} from "./extract-tax-package-control-facts-from-liasse";

export {
  buildTaxPackageLiasseVisionSystemPrompt,
  extractTaxPackageLiasseObservations,
  extractTaxPackageLiassePrintedFormYear,
  identifyTaxPackageLiasseForm,
  isTaxPackageLiasseFormYearCompatible,
  parseTaxPackageLiasseVisionFormPayload,
  readNativeTaxPackageCase,
  TAX_PACKAGE_LIASSE_VISION_JSON_SCHEMA,
  TaxPackageLiasseVisionFormZodSchema,
  type ExtractTaxPackageLiasseObservationsInput,
  type ExtractTaxPackageLiasseObservationsResult,
  type TaxPackageLiasseFormType,
  type TaxPackageLiassePageImage,
  type TaxPackageLiassePageText,
  type TaxPackageLiasseVisionCasePayload,
  type TaxPackageLiasseVisionFormPayload,
  type TaxPackageLiasseVisionRequester,
} from "./extract-tax-package-liasse-observations";

export {
  extractNativeTaxPackageControlFactsFromPdf,
  type ExtractNativeTaxPackageControlFactsFromPdfInput,
  type ExtractNativeTaxPackageControlFactsFromPdfResult,
} from "./extract-native-tax-package-from-pdf";

export {
  extractScannedTaxPackageControlFactsFromPdf,
  type ExtractScannedTaxPackageControlFactsFromPdfInput,
  type ExtractScannedTaxPackageControlFactsFromPdfResult,
  type TaxPackageScanRasterizer,
} from "./extract-scanned-tax-package-from-pdf";

export {
  buildTaxPackageLiassePageClassifierSystemPrompt,
  parseTaxPackageLiassePageClassifierPayload,
  TAX_PACKAGE_LIASSE_PAGE_CLASSIFIER_JSON_SCHEMA,
  TaxPackageLiassePageClassifierZodSchema,
  type TaxPackageLiassePageClassification,
  type TaxPackageLiassePageClassifier,
} from "./classify-tax-package-liasse-page";

// Lot 5.5-A — tax-package-liasse-vision-server.ts n'est plus barrel-exporté :
// il porte désormais une garde `server-only` réelle (createTaxPackageLiasseVisionRequester
// / createTaxPackageLiassePageClassifier appellent OpenAI) et ne doit jamais
// être atteignable depuis un graphe client. Consommé uniquement via import
// dynamique par les routes API dédiées — cf. request-tax-package-liasse-vision.ts
// / request-tax-package-liasse-page-classify.ts.

export {
  explicitAnswer,
  isExplicitAnswer,
  type ExplicitTakeoverAnswer,
  type TakeoverAssetReviewAnswers,
  type TakeoverReviewAnswers,
} from "./review-answers";

export {
  applyExplicitAnswerToCandidate,
  emptyDocumentaryFiscalStocks,
  mergeTakeoverReviewAnswers,
  type MergeTakeoverReviewAnswersInput,
  type MergeTakeoverReviewAnswersResult,
} from "./merge-review-answers";

export {
  mapIssueToTakeoverException,
  mapIssuesToTakeoverExceptions,
  type TakeoverException,
  type TakeoverExceptionAnswerability,
} from "./exceptions";

export {
  prepareExternalTakeover,
  type ExternalTakeoverOrchestrationRole,
  type ExternalTakeoverRegisterDocument,
  type ExternalTakeoverTaxPackageDocument,
  type PrepareExternalTakeoverInput,
  type PrepareExternalTakeoverResult,
} from "./prepare-external-takeover";

export {
  persistExternalTakeoverOpening,
  persistExternalTakeoverReviewAnswers,
  type PersistExternalTakeoverOpeningInput,
  type PersistExternalTakeoverOpeningResult,
  type PersistExternalTakeoverReviewAnswersInput,
} from "./persist-external-takeover-opening";
