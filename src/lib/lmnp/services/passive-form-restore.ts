import type { CreditFormValues } from "@/lib/lmnp/services/credit-profile";
import { creditFromDraft, readCreditUserValidatedFields } from "@/lib/lmnp/services/credit-gpt-ui-prefill";
import type { LogementFormValues } from "@/lib/lmnp/services/logement-profile";
import {
  logementBackgroundFromFormValues,
  logementFromWorkspace,
  normalizeLogementFormValues,
  propertyToFormValues,
} from "@/lib/lmnp/services/logement-profile";
import {
  createEmptyRevenueSession,
  hasRevenueSessionData,
} from "@/lib/lmnp/services/revenue-gpt-ui-prefill";
import {
  logRevenueGridSource,
  logRevenueHydrationBranch,
  logRevenueSourceOfTruth,
} from "@/lib/lmnp/services/revenus-runtime-trace";
import type { DeclarationDraft, RevenueGptSession } from "@/lib/lmnp/types";
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
 * Read-only restore — session-first (draft.creditGptSession), then confirmed financing.
 * Does NOT prefer stale creditWorkspaceForm snapshots over extraction.
 */
export function restoreCreditFormPassive(
  draft?: DeclarationDraft,
  revenueYear?: number,
): CreditFormValues {
  return creditFromDraft(draft, revenueYear, readCreditUserValidatedFields(draft));
}

export function restoreLogementFormPassive(workspace: PersistedWorkspace): LogementFormValues {
  const draft = workspace.declarationDraft;
  if (draft?.logementWorkspaceForm) {
    return normalizeLogementFormValues(
      draft.logementWorkspaceForm,
      draft.propertyBackgroundExtraction,
    );
  }
  if (draft?.logementConfirmedAt) {
    console.log("[logement-passive-restore]", { source: "confirmed_property" });
    return normalizeLogementFormValues(
      logementFromWorkspace(workspace),
      draft.propertyBackgroundExtraction,
    );
  }
  console.log("[logement-passive-restore]", { source: "empty_property" });
  return normalizeLogementFormValues(
    propertyToFormValues(workspace.properties[0]),
    draft?.propertyBackgroundExtraction,
  );
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

export function logementWorkspaceFormPatch(
  values: LogementFormValues,
  existingBackground?: import("@/lib/lmnp/types").PropertyBackgroundExtraction,
): Partial<DeclarationDraft> {
  return {
    logementWorkspaceForm: values,
    propertyBackgroundExtraction: logementBackgroundFromFormValues(values, existingBackground),
  };
}

export function restoreRevenueSessionPassive(
  draft: DeclarationDraft | undefined,
  fiscalYear: number,
  properties: PersistedWorkspace["properties"],
): RevenueGptSession {
  if (draft?.revenueGptSession?.properties.length) {
    logRevenueHydrationBranch("revenue_gpt_session", {
      fn: "restoreRevenueSessionPassive",
      propertyCount: draft.revenueGptSession.properties.length,
    });
    logRevenueGridSource("persisted_session", { fn: "restoreRevenueSessionPassive" });
    logRevenueSourceOfTruth("persisted_revenue_gpt_session", {
      fn: "restoreRevenueSessionPassive",
    });
    return draft.revenueGptSession;
  }

  if (draft?.revenusConfirmedAt || hasRevenueSessionData(draft?.revenueGptSession)) {
    logRevenueHydrationBranch("confirmed_empty_fallback", {
      fn: "restoreRevenueSessionPassive",
    });
    return draft?.revenueGptSession ?? createEmptyRevenueSession(properties, fiscalYear);
  }

  logRevenueHydrationBranch("create_empty_session", {
    fn: "restoreRevenueSessionPassive",
  });
  logRevenueGridSource("user_manual", { fn: "restoreRevenueSessionPassive" });
  logRevenueSourceOfTruth("manual_empty_session", {
    fn: "restoreRevenueSessionPassive",
  });
  return createEmptyRevenueSession(properties, fiscalYear);
}

export function hasPersistedRevenueSession(draft?: DeclarationDraft): boolean {
  return Boolean(draft?.revenueGptSession?.properties.length);
}

export function revenueSessionPatch(session: RevenueGptSession): Partial<DeclarationDraft> {
  return { revenueGptSession: session };
}
