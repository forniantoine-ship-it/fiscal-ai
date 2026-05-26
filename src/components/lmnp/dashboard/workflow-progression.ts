import type { DashboardWorkspace, DashboardWorkflowStepId } from "@/components/lmnp/dashboard/dashboard-workflow-model";
import {
  resolveActiveWorkflowStep,
  resolveDashboardWorkflow,
} from "@/components/lmnp/dashboard/dashboard-workflow-model";
import { isDocumentJourneyStarted } from "@/lib/lmnp/engine/document-journey-progress";
import { documentJourneyRoute, LMNP_ROUTES } from "@/lib/lmnp/routes";

/** Ordered workflow steps shown on the dashboard. */
export const WORKFLOW_STEP_SEQUENCE: DashboardWorkflowStepId[] = [
  "activite",
  "logement",
  "credit",
  "revenus",
  "charges",
  "amortissement",
  "validation",
];

const STEP_SHORT_LABELS: Record<DashboardWorkflowStepId, string> = {
  dashboard: "Tableau de bord",
  activite: "Activité",
  logement: "Logement",
  credit: "Crédit",
  revenus: "Revenus",
  charges: "Charges",
  amortissement: "Amortissements",
  validation: "Validation",
};

const STEP_CONFIGURE_LABELS: Record<DashboardWorkflowStepId, string> = {
  dashboard: "Tableau de bord",
  activite: "Configurer l'Activité",
  logement: "Configurer le Logement",
  credit: "Configurer le Crédit",
  revenus: "Configurer les Revenus",
  charges: "Configurer les Charges",
  amortissement: "Configurer les Amortissements",
  validation: "Valider le dossier",
};

const STEP_COMPLETED_TITLES: Partial<Record<DashboardWorkflowStepId, string>> = {
  activite: "Activité configurée",
  logement: "Logement configuré",
  credit: "Crédit configuré",
  revenus: "Revenus configurés",
  charges: "Charges configurées",
  amortissement: "Amortissements configurés",
};

const STEP_COMPLETED_MESSAGES: Partial<Record<DashboardWorkflowStepId, string>> = {
  activite: "Votre activité LMNP a bien été enregistrée.",
  logement: "Votre logement a bien été enregistré.",
  credit: "Votre crédit a bien été enregistré.",
  revenus: "Vos revenus ont bien été enregistrés.",
  charges: "Vos charges ont bien été enregistrées.",
  amortissement: "Vos amortissements ont bien été enregistrés.",
};

const DEFAULT_HERO = {
  title: "Votre déclaration LMNP",
  explanation: [
    "Déposez les documents demandés par l'IA.",
    "L'IA extrait automatiquement les données importantes.",
    "Vous n'avez plus qu'à corriger ou valider.",
  ].join("\n"),
};

export type WorkflowProgressionCta = {
  continueLabel: string;
  continueHref: string;
  nextStepLabel: string | null;
};

export type DashboardHeroState = {
  title: string;
  explanation: string;
  primaryLabel: string;
  primaryHref?: string;
  startJourney?: boolean;
};

export function stepShortLabel(stepId: DashboardWorkflowStepId): string {
  return STEP_SHORT_LABELS[stepId];
}

export function resolveNextWorkflowStep(
  currentStepId: DashboardWorkflowStepId,
): DashboardWorkflowStepId | null {
  const index = WORKFLOW_STEP_SEQUENCE.indexOf(currentStepId);
  if (index < 0 || index >= WORKFLOW_STEP_SEQUENCE.length - 1) return null;
  return WORKFLOW_STEP_SEQUENCE[index + 1] ?? null;
}

export function resolveWorkflowProgressionCta(
  currentStepId: DashboardWorkflowStepId,
): WorkflowProgressionCta | null {
  const nextStepId = resolveNextWorkflowStep(currentStepId);
  if (!nextStepId) {
    if (currentStepId === "validation") {
      return {
        continueLabel: "Préparer la déclaration",
        continueHref: LMNP_ROUTES.declarations,
        nextStepLabel: null,
      };
    }
    return null;
  }

  const nextLabel = stepShortLabel(nextStepId);
  return {
    continueLabel: `Continuer vers ${nextLabel}`,
    continueHref: resolveStepHref(nextStepId),
    nextStepLabel: nextLabel,
  };
}

function resolveStepHref(stepId: DashboardWorkflowStepId): string {
  switch (stepId) {
    case "activite":
      return documentJourneyRoute("inpi");
    case "logement":
      return documentJourneyRoute("logement");
    case "credit":
      return documentJourneyRoute("credit");
    case "revenus":
      return documentJourneyRoute("revenus");
    case "charges":
      return documentJourneyRoute("charges");
    case "amortissement":
      return documentJourneyRoute("amortissements");
    case "validation":
      return documentJourneyRoute("validation");
    default:
      return LMNP_ROUTES.dashboard;
  }
}

function stepBefore(stepId: DashboardWorkflowStepId): DashboardWorkflowStepId | null {
  const index = WORKFLOW_STEP_SEQUENCE.indexOf(stepId);
  if (index <= 0) return null;
  return WORKFLOW_STEP_SEQUENCE[index - 1] ?? null;
}

function hasPendingChargeSuggestions(workspace: DashboardWorkspace): boolean {
  const draft = workspace.declarationDraft;
  if (draft?.chargesConfirmedAt) return false;
  const suggestions = draft?.chargesExtraction?.amortizationSuggestions ?? [];
  return suggestions.some((item) => item.status === "pending");
}

function businessStepsComplete(workspace: DashboardWorkspace): boolean {
  const steps = resolveDashboardWorkflow(workspace);
  return WORKFLOW_STEP_SEQUENCE.filter((id) => id !== "validation").every((id) => {
    const step = steps.find((item) => item.id === id);
    return step?.status === "completed";
  });
}

export function resolveDashboardHeroState(workspace: DashboardWorkspace): DashboardHeroState {
  const started = isDocumentJourneyStarted({
    fiscalYear: workspace.fiscalYear,
    properties: workspace.properties,
    documents: workspace.documents,
    extractions: workspace.extractions,
    validationItems: workspace.validationItems,
    ledgerEntries: workspace.ledgerEntries,
    declarationDraft: workspace.declarationDraft,
  });

  if (!started) {
    return {
      ...DEFAULT_HERO,
      primaryLabel: "Commencer votre déclaration",
      startJourney: true,
    };
  }

  const steps = resolveDashboardWorkflow(workspace);
  const activeStep = resolveActiveWorkflowStep(workspace);

  const stepWithCorrections = steps.find(
    (step) => step.id !== "validation" && step.correctionsRemaining > 0,
  );
  if (stepWithCorrections) {
    const label = stepShortLabel(stepWithCorrections.id);
    return {
      title: "Informations à confirmer",
      explanation: `Certaines données ${label === "Activité" ? "de l'activité" : `du ${label.toLowerCase()}`} nécessitent votre validation avant de poursuivre.`,
      primaryLabel: `Corriger ${label === "Activité" ? "l'Activité" : `le ${label}`}`,
      primaryHref: stepWithCorrections.uploadHref,
    };
  }

  if (hasPendingChargeSuggestions(workspace)) {
    return {
      title: "Analyse terminée",
      explanation:
        "L'IA a identifié plusieurs charges pouvant être amorties. Examinez les suggestions avant de poursuivre.",
      primaryLabel: "Voir les suggestions",
      primaryHref: documentJourneyRoute("charges"),
    };
  }

  if (businessStepsComplete(workspace)) {
    return {
      title: "Votre dossier LMNP est prêt",
      explanation:
        "Votre déclaration est désormais prête pour la génération finale.",
      primaryLabel: "Préparer la déclaration",
      primaryHref: documentJourneyRoute("validation"),
    };
  }

  const previousStepId = stepBefore(activeStep.id);
  const previousStep = previousStepId
    ? steps.find((step) => step.id === previousStepId)
    : null;

  if (previousStep?.status === "completed" && activeStep.status !== "completed") {
    const nextLabel = stepShortLabel(activeStep.id);
    const completedTitle = STEP_COMPLETED_TITLES[previousStep.id] ?? `${stepShortLabel(previousStep.id)} configuré`;
    const completedMessage =
      STEP_COMPLETED_MESSAGES[previousStep.id] ??
      `Votre ${stepShortLabel(previousStep.id).toLowerCase()} a bien été enregistré.`;

    return {
      title: completedTitle,
      explanation: `${completedMessage}\nPassez maintenant à l'étape ${nextLabel}.`,
      primaryLabel: STEP_CONFIGURE_LABELS[activeStep.id],
      primaryHref: activeStep.uploadHref,
    };
  }

  return {
    title: "Poursuivre votre déclaration",
    explanation: activeStep.documentPrompt,
    primaryLabel: "Poursuivre votre déclaration",
    primaryHref: activeStep.uploadHref,
  };
}
