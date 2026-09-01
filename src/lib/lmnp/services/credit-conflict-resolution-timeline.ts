/**
 * Deterministic trace for amortization conflict resolution (upload #3 regression).
 * One grouped logger: [credit-conflict-resolution] with fixed ordered stage numbers.
 */

import type { CreditAmortizationExtraction } from "@/lib/documents/gpt/schemas/credit-amortization.schema";
import type { CreditFormValues } from "@/lib/lmnp/services/credit-profile";

import type { PendingConflictAmortRefSnapshot } from "./credit-conflict-apply-trace";
import type { CreditExtractionSession } from "./credit-gpt-ui-prefill";

export const CREDIT_CONFLICT_RESOLUTION_STAGES = {
  conflict_detected_dispatched: 1,
  pending_conflict_amort_assigned: 2,
  handle_conflict_use_new_clicked: 3,
  merge_credit_extraction_session: 4,
  commit_credit_form_hydration: 5,
  credit_gpt_session_patch: 6,
  credit_workspace_form_patch: 7,
  apply_governed_extraction_dispatched: 8,
} as const;

export type CreditConflictResolutionStage = keyof typeof CREDIT_CONFLICT_RESOLUTION_STAGES;

export type CreditConflictResolutionSnapshot = {
  pendingConflictAmortSet: boolean;
  pendingDocumentId: string | null;
  pendingExtractionKeys: string[];
  sessionLoanOfferKeys: string[];
  sessionAmortizationKeys: string[];
  draftHasCreditGptSession: boolean;
};

const EMPTY_SNAPSHOT: CreditConflictResolutionSnapshot = {
  pendingConflictAmortSet: false,
  pendingDocumentId: null,
  pendingExtractionKeys: [],
  sessionLoanOfferKeys: [],
  sessionAmortizationKeys: [],
  draftHasCreditGptSession: false,
};

let sessionId = 0;
let lastStageNumber = 0;
let lastStageName: CreditConflictResolutionStage | null = null;

let readSnapshot: (() => CreditConflictResolutionSnapshot) | null = null;

export function registerCreditConflictResolutionSnapshotReader(
  reader: (() => CreditConflictResolutionSnapshot) | null,
): void {
  readSnapshot = reader;
}

export function resetCreditConflictResolutionTimeline(documentId: string | null): void {
  sessionId += 1;
  lastStageNumber = 0;
  lastStageName = null;
  console.log("[credit-conflict-resolution]", {
    event: "session_reset",
    session: sessionId,
    at: new Date().toISOString(),
    documentId,
  });
}

function objectKeys(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.keys(value as Record<string, unknown>);
}

function formHydrationScalars(values: CreditFormValues) {
  return {
    annualInterest: values.summary?.annualInterest ?? null,
    annualInsurance: values.summary?.annualInsurance ?? null,
    remainingCapital: values.summary?.remainingCapital ?? null,
    borrowedAmount: values.loans[0]?.borrowedAmount ?? null,
    durationMonths: values.loans[0]?.durationMonths ?? null,
    installmentCount: values.installments?.length ?? 0,
  };
}

function sessionScalars(session: CreditExtractionSession) {
  const amort = session.amortization;
  return {
    loanOfferKeys: objectKeys(session.loanOffer),
    amortizationKeys: objectKeys(amort),
    annualInterest: amort?.yearlyInterestTotal ?? null,
    annualInsurance: amort?.yearlyInsuranceTotal ?? null,
    remainingPrincipal: amort?.remainingPrincipal ?? null,
    loanAmount: amort?.loanAmount ?? session.loanOffer?.loanAmount ?? null,
    durationMonths: amort?.loanDurationMonths ?? session.loanOffer?.loanDurationMonths ?? null,
    installmentCount: amort?.installments?.length ?? 0,
  };
}

function resolveSnapshot(
  partial?: Partial<CreditConflictResolutionSnapshot>,
): CreditConflictResolutionSnapshot {
  const runtime = readSnapshot?.() ?? EMPTY_SNAPSHOT;
  return { ...runtime, ...partial };
}

export function traceCreditConflictResolution(
  stage: CreditConflictResolutionStage,
  extra?: Record<string, unknown>,
): void {
  const stageNumber = CREDIT_CONFLICT_RESOLUTION_STAGES[stage];
  const at = new Date().toISOString();
  const snapshot = resolveSnapshot();

  if (lastStageName && stageNumber < lastStageNumber) {
    console.warn("[credit-conflict-resolution]", {
      event: "out_of_order_stage",
      session: sessionId,
      at,
      stage,
      stageNumber,
      lastStageName,
      lastStageNumber,
      ...snapshot,
      ...extra,
    });
  }

  lastStageNumber = Math.max(lastStageNumber, stageNumber);
  lastStageName = stage;

  console.log("[credit-conflict-resolution]", {
    session: sessionId,
    stage,
    stageNumber,
    at,
    ...snapshot,
    ...extra,
  });
}

export function traceCreditConflictResolutionPendingAssigned(params: {
  documentId: string;
  extraction: CreditAmortizationExtraction;
  /** Inline ref read immediately after assignment — authoritative, not snapshot reader. */
  refImmediate: PendingConflictAmortRefSnapshot;
}): void {
  traceCreditConflictResolution("pending_conflict_amort_assigned", {
    documentId: params.documentId,
    pendingExtractionKeys: objectKeys(params.extraction),
    refImmediate: params.refImmediate,
    pendingConflictAmortSet: params.refImmediate.pendingConflictAmortSet,
    pendingScalars: {
      loanAmount: params.extraction.loanAmount ?? null,
      loanDurationMonths: params.extraction.loanDurationMonths ?? null,
      remainingPrincipal: params.extraction.remainingPrincipal ?? null,
      yearlyInterestTotal: params.extraction.yearlyInterestTotal ?? null,
      yearlyInsuranceTotal: params.extraction.yearlyInsuranceTotal ?? null,
      installmentCount: params.extraction.installments?.length ?? 0,
    },
  });
}

export function traceCreditConflictResolutionMerge(params: {
  documentId: string;
  baseSession: CreditExtractionSession;
  extraction: CreditAmortizationExtraction;
  mergedSession: CreditExtractionSession;
}): void {
  traceCreditConflictResolution("merge_credit_extraction_session", {
    documentId: params.documentId,
    baseSession: sessionScalars(params.baseSession),
    mergedSession: sessionScalars(params.mergedSession),
    extractionKeys: objectKeys(params.extraction),
  });
}

export function traceCreditConflictResolutionHydration(params: {
  documentId?: string;
  governedKind?: "loan_offer" | "amortization";
  session: CreditExtractionSession;
  nextValues: CreditFormValues;
  governedPayloadKeys?: string[];
  governedDispatchSkipped?: boolean;
}): void {
  traceCreditConflictResolution("commit_credit_form_hydration", {
    documentId: params.documentId,
    governedKind: params.governedKind,
    session: sessionScalars(params.session),
    hydratedForm: formHydrationScalars(params.nextValues),
  });

  traceCreditConflictResolution("credit_gpt_session_patch", {
    documentId: params.documentId,
    creditGptSession: sessionScalars(params.session),
    rawSession: params.session,
  });

  traceCreditConflictResolution("credit_workspace_form_patch", {
    documentId: params.documentId,
    creditWorkspaceForm: formHydrationScalars(params.nextValues),
    rawWorkspaceFormSummary: params.nextValues.summary,
    rawWorkspaceLoans0: params.nextValues.loans[0],
    installmentCount: params.nextValues.installments?.length ?? 0,
  });

  if (params.governedDispatchSkipped) {
    traceCreditConflictResolution("apply_governed_extraction_dispatched", {
      documentId: params.documentId,
      skipped: true,
      reason: "missing documentId or governedKind",
    });
    return;
  }

  traceCreditConflictResolution("apply_governed_extraction_dispatched", {
    documentId: params.documentId,
    governedKind: params.governedKind,
    payloadKeys: params.governedPayloadKeys ?? [],
  });
}

export function getCreditConflictResolutionLastStage(): {
  session: number;
  stage: CreditConflictResolutionStage | null;
  stageNumber: number;
} {
  return {
    session: sessionId,
    stage: lastStageName,
    stageNumber: lastStageNumber,
  };
}
