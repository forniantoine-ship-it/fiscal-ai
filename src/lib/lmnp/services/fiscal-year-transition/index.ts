/**
 * Lot 3 — barrel exports for fiscal-year server transition.
 */
export { commitFiscalYearTransition, assertSnapshotWritableForAutosave } from "./commit-transition";
export { prepareFiscalYearTransitionCandidate } from "./prepare-transition";
export {
  handleFiscalYearTransitionRequest,
  createDefaultTransitionHandlerDeps,
  createStoreBackedTransitionHandlerDeps,
} from "./transition-handler";
export {
  TransitionCommitError,
  type TransitionCommitResult,
  type TransitionCommitInput,
  type FiscalYearTransitionStore,
} from "./types";
