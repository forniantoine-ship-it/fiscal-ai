/**
 * Lot 1 — contrat FiscalYearOpening + adaptateur interne.
 * Aucun branchement production.
 */

export {
  available,
  unavailable,
  isAvailable,
  isUnavailable,
  type OpeningFact,
  type OpeningFactAvailable,
  type OpeningFactUnavailable,
} from "./opening-fact";

export type {
  AdaptInternalOpeningResult,
  FiscalCarryforwardStocks,
  FiscalYearOpening,
  OpeningAsset,
  OpeningAssetPlan,
  OpeningDeficitRow,
  OpeningDurableIdentity,
  OpeningEvidence,
  OpeningFieldProvenance,
  OpeningIssue,
  OpeningLoan,
  OpeningLoanTerms,
  OpeningPatrimoine,
  OpeningPropertyPrefill,
  OpeningSource,
  OpeningSourceExternal,
  OpeningSourceInternal,
  OpeningValidation,
} from "./types";

export { adaptInternalOpening, type AdaptInternalOpeningInput } from "./adapt-internal-opening";
export {
  computeOpeningContentHash,
  isOpeningValidationIntact,
  openingContentForHash,
} from "./content-hash";
export { validateFiscalYearOpening } from "./validate-opening";
export {
  resolveOpeningDepreciation,
  applyResolvedOpeningDepreciation,
  type ResolveOpeningDepreciationInput,
  type ResolveOpeningDepreciationResult,
  type ResolveOpeningDepreciationReady,
  type ResolvedOpeningDepreciationEntry,
} from "./resolve-opening-depreciation";
export {
  propagateAnchoredDepreciation,
  type PropagateAnchoredDepreciationInput,
  type PropagateAnchoredDepreciationResult,
} from "./propagate-anchored-depreciation";
export {
  resolveOpeningFiscalStocks,
  resolveCanonicalOpeningFiscalStocks,
  fiscalStocksSemanticallyEqual,
  type OpeningFiscalStocks,
  type ResolveOpeningFiscalStocksInput,
  type ResolveOpeningFiscalStocksResult,
  type ResolveOpeningFiscalStocksReady,
  type ResolveCanonicalOpeningFiscalStocksInput,
  type ResolveCanonicalOpeningFiscalStocksResult,
} from "./resolve-opening-fiscal-stocks";
export {
  fixture1Simple,
  fixture2WithCarryforwardAndAssets,
  fixture3UnavailableFacts,
  fixture4HistoricalAsset,
  fixture5ExistingLoan,
  fixture5LoansUnknown,
  fixture6Patrimoine,
  fixtureClosedFiscalYear,
  fixtureClosure,
  fixtureExternalTakeoverShape,
} from "./fixtures";
