export { buildEngineContext, getRequiredFields, hasActiveLedgerForField } from "./context";
export { recomputeAlerts } from "./alerts";
export { computeUserConfidence, pickNextAction, getConfidenceBand } from "./confidence";

import type { Alert, UserConfidenceScore, NextAction } from "../types";
import { buildEngineContext, type EngineContext } from "./context";
import { recomputeAlerts } from "./alerts";
import { computeUserConfidence, pickNextAction } from "./confidence";

export interface WorkspaceDerivatives {
  alerts: Alert[];
  confidence: UserConfidenceScore;
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
  const canClose =
    blockingAlertCount === 0 &&
    pendingValidationCount === 0 &&
    Boolean(fiscalYear.regimeConfirmedAt);

  return {
    alerts,
    confidence: computeUserConfidence(ctxWithAlerts, canClose),
    nextAction: pickNextAction(ctxWithAlerts),
    pendingValidationCount,
    blockingAlertCount,
    canClose,
  };
}
