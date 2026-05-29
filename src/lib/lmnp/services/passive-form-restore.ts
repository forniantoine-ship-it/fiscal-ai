import type { CreditFormValues } from "@/lib/lmnp/services/credit-profile";
import { creditFromDraft } from "@/lib/lmnp/services/credit-profile";
import type { LogementFormValues } from "@/lib/lmnp/services/logement-profile";
import { logementFromWorkspace, propertyToFormValues } from "@/lib/lmnp/services/logement-profile";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

export type LogementUiHydration = {
  formValues: LogementFormValues;
  hasPersistedData: boolean;
  workflowComplete: boolean;
};

export function hasPersistedLogementWorkflowState(draft?: DeclarationDraft): boolean {
  return Boolean(
    draft?.logementDocumentId || draft?.logementWorkspaceForm || draft?.logementConfirmedAt,
  );
}

export function logementWorkflowComplete(draft?: DeclarationDraft): boolean {
  return Boolean(draft?.logementWorkspaceForm || draft?.logementConfirmedAt);
}

/**
 * Read-only restore — persisted draft/workspace only.
 * Does NOT merge governedFields, rerun GPT, or cross-tunnel prefill.
 */
export function restoreCreditFormPassive(draft?: DeclarationDraft): CreditFormValues {
  if (draft?.creditWorkspaceForm) {
    return draft.creditWorkspaceForm;
  }
  return creditFromDraft(draft);
}

export function restoreLogementFormPassive(workspace: PersistedWorkspace): LogementFormValues {
  const draft = workspace.declarationDraft;
  if (draft?.logementWorkspaceForm) {
    console.log("[logement-passive-restore]", { source: "logementWorkspaceForm" });
    return draft.logementWorkspaceForm;
  }
  if (draft?.logementConfirmedAt) {
    console.log("[logement-passive-restore]", { source: "confirmed_property" });
    return logementFromWorkspace(workspace);
  }
  console.log("[logement-passive-restore]", { source: "empty_property" });
  return propertyToFormValues(workspace.properties[0]);
}

/** One-time passive UI restore — mirrors hydrateActiviteFormFromWorkspace. */
export function hydrateLogementUiFromWorkspace(workspace: PersistedWorkspace): LogementUiHydration {
  const draft = workspace.declarationDraft;
  const formValues = restoreLogementFormPassive(workspace);
  const hasPersistedData = hasPersistedLogementWorkflowState(draft);
  const workflowComplete = logementWorkflowComplete(draft);

  console.log("[logement-hydration]", {
    hasPersistedData,
    workflowComplete,
    confirmed: Boolean(draft?.logementConfirmedAt),
    hasSnapshot: Boolean(draft?.logementWorkspaceForm),
  });

  return { formValues, hasPersistedData, workflowComplete };
}

export function creditWorkspaceFormPatch(values: CreditFormValues): Partial<DeclarationDraft> {
  return { creditWorkspaceForm: values };
}

export function logementWorkspaceFormPatch(values: LogementFormValues): Partial<DeclarationDraft> {
  return { logementWorkspaceForm: values };
}
