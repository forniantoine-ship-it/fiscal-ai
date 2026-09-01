import type { ActiviteDocumentState } from "@/lib/lmnp/services/activite-document-state";

export type ActiviteDocumentStepViewInput = {
  documentState: ActiviteDocumentState;
  manualMode: boolean;
  confirmed: boolean;
  validatedSuccess: boolean;
  isEditing: boolean;
  hasUploaded: boolean;
  hasPersistedData: boolean;
  hasInpiDocumentId: boolean;
  hasInpiDoc: boolean;
  aiAnimationDone: boolean;
  pipelineRunning: boolean;
  showOcrFailureMessage: boolean;
  inpiDocFailed: boolean;
};

export type ActiviteDocumentStepView = {
  showInitialExtras: boolean;
  showReanalyzeAction: boolean;
  showAiProcessing: boolean;
  showInterrupted: boolean;
  showExtractionForm: boolean;
  showConfiguredCard: boolean;
  /** Conservé — logique historique, non utilisé pour l'écran INTERRUPTED. */
  isProcessing: boolean;
  /** Conservé — logique historique, non utilisé pour l'écran INTERRUPTED. */
  isFailed: boolean;
};

export function deriveActiviteDocumentStepView(
  input: ActiviteDocumentStepViewInput,
): ActiviteDocumentStepView {
  const {
    documentState,
    manualMode,
    confirmed,
    validatedSuccess,
    isEditing,
    hasUploaded,
    hasPersistedData,
    hasInpiDocumentId,
    hasInpiDoc,
    aiAnimationDone,
    pipelineRunning,
    showOcrFailureMessage,
    inpiDocFailed,
  } = input;

  const isOptimisticProcessing =
    hasUploaded &&
    !hasInpiDocumentId &&
    !manualMode &&
    !confirmed &&
    !aiAnimationDone;

  const isProcessing =
    (hasUploaded && !confirmed && !manualMode && (!aiAnimationDone || pipelineRunning)) ||
    pipelineRunning;

  const isFailed =
    (showOcrFailureMessage || inpiDocFailed) && !manualMode && !pipelineRunning;

  const effectiveDone =
    documentState === "done" || hasPersistedData || manualMode;

  const showInterrupted =
    documentState === "interrupted" && !manualMode && !pipelineRunning && !hasPersistedData;

  const showAiProcessing =
    !manualMode &&
    !confirmed &&
    !showInterrupted &&
    !hasPersistedData &&
    (documentState === "processing" ||
      pipelineRunning ||
      isOptimisticProcessing ||
      (documentState === "done" && !aiAnimationDone));

  const showConfiguredCard = (validatedSuccess || confirmed) && !isEditing;

  const showExtractionForm =
    !showAiProcessing &&
    !showInterrupted &&
    !showConfiguredCard &&
    !showOcrFailureMessage &&
    effectiveDone &&
    (aiAnimationDone || manualMode || hasPersistedData);

  const showInitialExtras =
    documentState === "empty" && !hasUploaded && !manualMode && !confirmed;

  const showReanalyzeAction =
    hasInpiDoc &&
    documentState === "done" &&
    !showAiProcessing &&
    !showInitialExtras &&
    !manualMode;

  return {
    showInitialExtras,
    showReanalyzeAction,
    showAiProcessing,
    showInterrupted,
    showExtractionForm,
    showConfiguredCard,
    isProcessing,
    isFailed,
  };
}
