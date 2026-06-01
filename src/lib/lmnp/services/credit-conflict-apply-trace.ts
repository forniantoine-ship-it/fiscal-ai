/**
 * Deterministic ordering trace for applyPipelineResult amortization conflict path.
 * Logger: [credit-conflict-apply-order]
 *
 * Uses inline ref snapshots passed by callers — never relies on async React snapshot readers.
 */

import type { CreditAmortizationExtraction } from "@/lib/documents/gpt/schemas/credit-amortization.schema";

export type PendingConflictAmortRefSnapshot = {
  pendingConflictAmortSet: boolean;
  pendingDocumentId: string | null;
  pendingExtractionKeys: string[];
  extractionUndefined: boolean;
  extractionNull: boolean;
  installmentCount: number;
};

export type ExtractionPayloadSnapshot = {
  extractionDefined: boolean;
  extractionKeys: string[];
  extractionEffectivelyEmpty: boolean;
  loanAmount: number | null;
  loanDurationMonths: number | null;
  remainingPrincipal: number | null;
  yearlyInterestTotal: number | null;
  yearlyInsuranceTotal: number | null;
  installmentCount: number;
};

let traceSession = 0;
let order = 0;
let activeDocumentId: string | null = null;

function objectKeys(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.keys(value as Record<string, unknown>);
}

function isEffectivelyEmpty(extraction: unknown): boolean {
  if (extraction == null) return true;
  if (typeof extraction !== "object") return true;
  const record = extraction as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) return true;
  return keys.every((key) => {
    const value = record[key];
    if (value === undefined || value === null) return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  });
}

export function snapshotExtractionPayload(
  extraction: CreditAmortizationExtraction | undefined,
): ExtractionPayloadSnapshot {
  const amort = extraction;
  return {
    extractionDefined: amort !== undefined,
    extractionKeys: objectKeys(amort),
    extractionEffectivelyEmpty: isEffectivelyEmpty(amort),
    loanAmount: amort?.loanAmount ?? null,
    loanDurationMonths: amort?.loanDurationMonths ?? null,
    remainingPrincipal: amort?.remainingPrincipal ?? null,
    yearlyInterestTotal: amort?.yearlyInterestTotal ?? null,
    yearlyInsuranceTotal: amort?.yearlyInsuranceTotal ?? null,
    installmentCount: amort?.installments?.length ?? 0,
  };
}

export function snapshotPendingConflictAmortRef(
  pending: {
    extraction: CreditAmortizationExtraction;
    documentId: string;
  } | null,
): PendingConflictAmortRefSnapshot {
  return {
    pendingConflictAmortSet: Boolean(pending),
    pendingDocumentId: pending?.documentId ?? null,
    pendingExtractionKeys: objectKeys(pending?.extraction),
    extractionUndefined: pending != null && pending.extraction === undefined,
    extractionNull: pending != null && pending.extraction === null,
    installmentCount: pending?.extraction?.installments?.length ?? 0,
  };
}

export function resetCreditConflictApplyTrace(documentId: string | null): void {
  traceSession += 1;
  order = 0;
  activeDocumentId = documentId;
  console.log("[credit-conflict-apply-order]", {
    event: "trace_session_reset",
    traceSession,
    at: new Date().toISOString(),
    documentId,
  });
}

export function traceCreditConflictApplyOrder(
  step: string,
  payload: Record<string, unknown> = {},
): void {
  order += 1;
  console.log("[credit-conflict-apply-order]", {
    traceSession,
    order,
    step,
    at: new Date().toISOString(),
    documentId: activeDocumentId,
    ...payload,
  });
}

export function traceCreditConflictPendingRefClear(
  reason: string,
  location: string,
  refSnapshot: PendingConflictAmortRefSnapshot,
): void {
  traceCreditConflictApplyOrder("pending_conflict_amort_ref_cleared", {
    reason,
    location,
    refBeforeClear: refSnapshot,
  });
}
