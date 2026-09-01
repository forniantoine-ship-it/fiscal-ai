// ---------------------------------------------------------------------------
// Business Engine (Layers 1–5)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

export type {
  // Layer 0 — Page segmentation
  PageType,
  PageClassification,
  // Layer 1 — Accounting facts
  AccountingCategory,
  ExtractedAccountingFact,
  // Layer 2 — WorkGroup
  WorkGroup,
  WorkGroupStatus,
  WorkGroupAuditEvent,
  // Layer 3 — Business Assets
  BusinessAsset,
  FiscalTreatmentType,
  // Layer 4 — Fiscal decisions
  FiscalDecision,
  // Layer 5 — Amortization
  AmortizationSchedule,
  AmortizationScheduleRow,
  // Layer 6 — Declaration
  FiscalDeclaration,
  PropertyFiscalSummary,
  // Knowledge + Guidance
  FiscalKnowledgeRule,
  GuidanceMessage,
  GuidanceType,
  GuidanceSeverity,
  // Aggregates
  BusinessEngineResult,
} from "./business-engine.types";

// ---------------------------------------------------------------------------
// Layer 0 — Page segmentation
// ---------------------------------------------------------------------------

export {
  classifyPageText,
  classifyDocumentPages,
  filterAccountingPages,
  getExcludedPageIndices,
  buildPageClassificationSummary,
  getPageTypeLabelFr,
} from "./page-segmentation";

// ---------------------------------------------------------------------------
// Layer 2 — WorkGroup engine
// ---------------------------------------------------------------------------

export {
  proposeWorkGroups,
  confirmWorkGroup,
  rejectWorkGroup,
  splitWorkGroupToSolos,
} from "./work-group-engine";

// ---------------------------------------------------------------------------
// Layer 2 — WorkGroup lifecycle
// ---------------------------------------------------------------------------

export {
  computeGroupFingerprint,
  isRejectedGrouping,
  addRejectionFingerprint,
  initializeAuditTrail,
  confirmWorkGroupWithAudit,
  rejectWorkGroupWithAudit,
  editWorkGroupMetadata,
  manualMergeInvoices,
  splitInvoiceFromGroup,
  mergeWorkGroups,
  proposeWorkGroupsSafe,
} from "./work-group-lifecycle";

// ---------------------------------------------------------------------------
// Layer 3 — Business Asset engine
// ---------------------------------------------------------------------------

export {
  workGroupToBusinessAsset,
  mergeWorkGroupsToBusinessAsset,
  buildAmortizationSchedule,
  getAnnualAmortizationForYear,
  buildBusinessEngineResult,
  decideFiscalTreatment,
  resolveAmortizationYears,
  CATEGORY_AMORTIZATION_YEARS,
  CATEGORY_LABELS_FR,
} from "./business-asset-engine";
// ---------------------------------------------------------------------------
// Layer 3 → F-014 — PlanAmortissement adapter (Input Contract)
// ---------------------------------------------------------------------------

export {
  buildPlanAmortissement,
  type PlanAmortissement,
  type ComposantAmortissement,
  type LignePlan,
} from "./plan-amortissement-adapter";

// ---------------------------------------------------------------------------
// Layer 4 — Fiscal decision engine
// ---------------------------------------------------------------------------

export {
  applyFiscalDecision,
  buildFiscalExplanation,
  buildFiscalSummary,
  buildAmortizationGuidanceText,
  getCategoryDurationLabel,
  type FiscalSummary,
} from "./fiscal-decision-engine";

// ---------------------------------------------------------------------------
// Layer 5 — Fiscal knowledge rules
// ---------------------------------------------------------------------------

export {
  FISCAL_KNOWLEDGE_RULES,
  getKnowledgeRule,
  renderExplanationTemplate,
  generateConsistentExplanation,
  getDurationRangeLabel,
  isDurationReasonable,
  getDurationWarning,
} from "./fiscal-knowledge-rules";

// ---------------------------------------------------------------------------
// Layer 6 — Declaration aggregation
// ---------------------------------------------------------------------------

export {
  buildPropertyFiscalSummary,
  buildFiscalDeclaration,
  aggregateByCategory,
  buildDeclarationSummaryText,
  checkDeclarationReadiness,
  type CategoryAggregation,
  type ChargeItem,
} from "./declaration-aggregation-engine";

// ---------------------------------------------------------------------------
// Smart user guidance
// ---------------------------------------------------------------------------

export {
  generateWorkGroupGuidance,
  generateAssetGuidance,
  generateDeclarationGuidance,
  getPrimaryGuidance,
  assetNeedsAttention,
} from "./user-guidance-engine";

// ---------------------------------------------------------------------------
// Existing workspace engine
// ---------------------------------------------------------------------------

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
export {
  resolveDeclarationProgress,
  type DeclarationProgress,
  type DeclarationStepView,
} from "./declaration-progress";

import type { Alert, AssistantBrief, DeclarationDraft, LmnpJourney, UserConfidenceScore, NextAction } from "../types";
import type { PersistedWorkspace } from "../store/persistence";
import { resolveDeclarationProgress, type DeclarationProgress } from "./declaration-progress";
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
  declaration: DeclarationProgress;
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
  declarationDraft?: DeclarationDraft,
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

  const persisted: PersistedWorkspace = {
    fiscalYear,
    properties,
    documents,
    validationItems,
    ledgerEntries,
    extractions,
    declarationDraft,
  };
  const declaration = resolveDeclarationProgress(persisted);

  return {
    alerts,
    confidence: computeUserConfidence(ctxWithAlerts, canClose),
    journey,
    assistant,
    nextAction,
    declaration,
    pendingValidationCount,
    blockingAlertCount,
    canClose,
    ...progress,
  };
}
