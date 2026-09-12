/**
 * Compagnon INPI — UI de régularisation (Phase 4.5.5.2).
 *
 * Pur, sans I/O : états d'affichage, limite de collage, sections de résultat.
 * Aucun fetch, aucun OpenAI, aucune persistance ici. Le branchement serveur
 * (kind: regularization_analysis, 4.5.5.3) est fait, mais vit dans
 * `InpiCompanionPanel.tsx` (`RegularisationView.runAnalysis`), pas dans ce
 * module — ce fichier reste volontairement pur.
 *
 * La limite 2000 recopie `INPI_COMPANION_LLM_MESSAGE_MAX` (4.5.4) sans
 * importer le module serveur OpenAI dans le bundle client.
 */

export const REGULARIZATION_MESSAGE_MAX = 2_000;

export type RegularisationAnalysisDisplay = {
  summary: string;
  points: string[];
  uncertainty?: string;
};

export type RegularisationUiPhase = "compose" | "analyzing" | "result" | "error";

export type RegularisationUiState = {
  phase: RegularisationUiPhase;
  validationError: string | undefined;
  analysis: RegularisationAnalysisDisplay | undefined;
};

export const INITIAL_REGULARISATION_UI: RegularisationUiState = {
  phase: "compose",
  validationError: undefined,
  analysis: undefined,
};

export const REGULARISATION_COPY = {
  heading: "L'INPI vous demande une correction ou un complément ?",
  intro:
    "Copiez ici le message reçu sur le site officiel INPI. Je peux vous aider à comprendre ce qui semble être demandé.",
  textareaLabel: "Message reçu de l'INPI",
  placeholder: "Collez ici le message reçu de l'INPI",
  empty: "Copiez d'abord le message reçu sur le site INPI.",
  analyzing: "Analyse du message en cours…",
  reminder:
    "Cette analyse repose uniquement sur le message que vous avez copié. Fiscal AI n'a pas accès directement à votre dossier INPI.",
  error:
    "Je n'arrive pas à analyser ce message automatiquement. Vous pouvez vérifier directement la demande affichée sur le site officiel INPI.",
  summaryTitle: "Ce que le message semble demander",
  pointsTitle: "Points à vérifier",
  uncertaintyTitle: "Ce qui reste incertain",
  analyze: "Analyser le message",
  cancel: "Annuler",
  edit: "Modifier le message",
  retry: "Réessayer",
} as const;

export function canSubmitRegularizationMessage(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.length > 0 && trimmed.length <= REGULARIZATION_MESSAGE_MAX;
}

export function clipRegularizationMessage(message: string): string {
  return message.length <= REGULARIZATION_MESSAGE_MAX
    ? message
    : message.slice(0, REGULARIZATION_MESSAGE_MAX);
}

export function regularisationCounterLabel(message: string): string {
  return `${Math.min(message.length, REGULARIZATION_MESSAGE_MAX)} / ${REGULARIZATION_MESSAGE_MAX}`;
}

export function regularisationResultSections(analysis: RegularisationAnalysisDisplay): {
  summary: string;
  points: string[] | null;
  uncertainty: string | null;
} {
  const uncertainty = analysis.uncertainty?.trim() ? analysis.uncertainty.trim() : null;
  return {
    summary: analysis.summary,
    points: analysis.points.length > 0 ? analysis.points : null,
    uncertainty,
  };
}

export type RegularisationUiAction =
  | { type: "analyze"; message: string }
  | { type: "cancel" }
  | { type: "edit" }
  | { type: "retry" }
  /** Déclenché par `RegularisationView.runAnalysis` (4.5.5.3) avant l'appel réseau. */
  | { type: "analysis_started" }
  | { type: "analysis_succeeded"; analysis: RegularisationAnalysisDisplay }
  | { type: "analysis_failed" };

export function reduceRegularisationUi(
  _state: RegularisationUiState,
  action: RegularisationUiAction,
): RegularisationUiState {
  switch (action.type) {
    case "analyze":
      if (!canSubmitRegularizationMessage(action.message)) {
        return {
          phase: "compose",
          validationError: REGULARISATION_COPY.empty,
          analysis: undefined,
        };
      }
      // 4.5.5.2 : le texte est valide, mais aucun réseau — on reste en compose.
      return { phase: "compose", validationError: undefined, analysis: undefined };
    case "retry":
      return { phase: "compose", validationError: undefined, analysis: undefined };
    case "cancel":
      return INITIAL_REGULARISATION_UI;
    case "edit":
      return { phase: "compose", validationError: undefined, analysis: undefined };
    case "analysis_started":
      return { phase: "analyzing", validationError: undefined, analysis: undefined };
    case "analysis_succeeded":
      return { phase: "result", validationError: undefined, analysis: action.analysis };
    case "analysis_failed":
      return { phase: "error", validationError: undefined, analysis: undefined };
  }
}

/**
 * Non utilisé : le fetch 4.5.5.3 a finalement été implémenté directement dans
 * `RegularisationView.runAnalysis` (InpiCompanionPanel.tsx), pas via ce point
 * d'accroche. Conservé vide pour ne pas simuler OpenAI avec un timer si
 * jamais réutilisé — candidat à suppression lors d'un prochain chantier
 * touchant ce fichier.
 */
export function beginRegularizationAnalysisPlaceholder(): void {}
