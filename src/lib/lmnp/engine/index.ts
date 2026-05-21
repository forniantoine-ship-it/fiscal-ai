export { buildEngineContext, getRequiredFields, hasActiveLedgerForField } from "./context";
export { recomputeAlerts } from "./alerts";
export { computeUserConfidence, pickNextAction, getConfidenceBand } from "./confidence";
export {
  computeJourneyFlags,
  resolveJourney,
  pickJourneyAction,
  journeyAllowsRoute,
} from "./journey";
export { buildAssistantBrief } from "./assistant-brief";
export {
  computeDossierProgress,
  resolveFiscalYearStatus,
  type DossierProgressSnapshot,
} from "./workspace-progress";

import type { Alert, AssistantBrief, LmnpJourney, UserConfidenceScore, NextAction } from "../types";
import { buildAssistantBrief } from "./assistant-brief";
import { buildEngineContext } from "./context";
import { recomputeAlerts } from "./alerts";
import { computeUserConfidence } from "./confidence";
import { resolveJourney, pickJourneyAction, computeJourneyFlags } from "./journey";
import { computeDossierProgress, type DossierProgressSnapshot } from "./workspace-progress";

export interface WorkspaceDerivatives extends DossierProgressSnapshot {
  alerts: Alert[];
  confidence: UserConfidenceScore;
  journey: LmnpJourney;
  assistant: AssistantBrief;
  nextAction: NextAction;
  pendingValidationCount: number;
  blockingAlertCount: number;
  canClose: boolean;
}

export function deriveWorkspace(
  fiscalYear: Parameters<typeof buildEngineContext>[0],
  properties: Parameters<typeof buildEngineContext>[1],
  documents: Parameters<typeof buildEngineContext>[2],
  validationItems: Parameters<typeof buildEngineContext>[3],
  ledgerEntries: Parameters<typeof buildEngineContext>[4],
  extractions: import("../types").Extraction[] = [],
): WorkspaceDerivatives {
  const ctx = buildEngineContext(
    fiscalYear,
    properties,
    documents,
    validationItems,
    ledgerEntries,
    [],
  );
  const alerts = recomputeAlerts(ctx);
  const ctxWithAlerts = { ...ctx, alerts };
  const blockingAlertCount = alerts.filter((a) => a.severity === "blocking").length;
  const pendingValidationCount = validationItems.filter((v) => v.status === "pending").length;
  const journeyFlags = computeJourneyFlags(ctxWithAlerts);
  const canClose = journeyFlags.dossierDone;

  const progress = computeDossierProgress(documents, validationItems, alerts);
  const journey = resolveJourney(ctxWithAlerts);
  const assistant = buildAssistantBrief(ctxWithAlerts, journey, extractions);
  const nextAction = pickJourneyAction(ctxWithAlerts, journey, extractions);

  return {
    alerts,
    confidence: computeUserConfidence(ctxWithAlerts, canClose),
    journey,
    assistant,
    nextAction,
    pendingValidationCount,
    blockingAlertCount,
    canClose,
    ...progress,
  };
}
