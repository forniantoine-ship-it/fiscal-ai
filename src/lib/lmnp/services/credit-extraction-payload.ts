import type { CreditAmortizationExtraction } from "@/lib/documents/gpt/schemas/credit-amortization.schema";
import type { CreditLoanOfferExtraction } from "@/lib/documents/gpt/schemas/credit-loan-offer.schema";

import type { CreditGptPipelineResult } from "./credit-gpt-pipeline";
import type { CreditExtractionSession } from "./credit-gpt-ui-prefill";

const LOG_PREFIX = "[credit-extraction-payload]";

export type CreditExtractionPayloadPhase =
  | "extraction_resolved"
  | "extraction_threw"
  | "extraction_empty"
  | "pre_apply_pipeline_result"
  | "merge_credit_extraction_session";

export type CreditExtractionPayloadLog = {
  phase: CreditExtractionPayloadPhase;
  at: string;
  documentId?: string;
  kind?: "loan_offer" | "amortization" | "unknown";
  success?: boolean;
  hasLoanOffer?: boolean;
  hasAmortization?: boolean;
  extractionEmpty?: boolean;
  extractionMissing?: boolean;
  pipelineError?: string;
  gptSuccess?: boolean;
  gptError?: string;
  extractionKeys: string[];
  amortizationKeys: string[];
  loanOfferKeys: string[];
  annualInterest?: number | null;
  annualInsurance?: number | null;
  remainingPrincipal?: number | null;
  loanAmount?: number | null;
  durationMonths?: number | null;
  installmentCount?: number;
  rawExtraction?: unknown;
  rawGptWrapper?: unknown;
  mergeInput?: {
    sessionLoanOfferKeys: string[];
    sessionAmortizationKeys: string[];
    extractionKeys: string[];
    extraction: unknown;
  };
  mergedSession?: {
    sessionLoanOfferKeys: string[];
    sessionAmortizationKeys: string[];
    mergedLoanOfferKeys: string[];
    mergedAmortizationKeys: string[];
    merged: CreditExtractionSession;
  };
};

function objectKeys(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.keys(value as Record<string, unknown>);
}

function isExtractionEffectivelyEmpty(extraction: unknown): boolean {
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

function scalarFieldsFromExtraction(
  extraction: CreditAmortizationExtraction | CreditLoanOfferExtraction | undefined,
  kind: "loan_offer" | "amortization" | "unknown",
): Pick<
  CreditExtractionPayloadLog,
  | "annualInterest"
  | "annualInsurance"
  | "remainingPrincipal"
  | "loanAmount"
  | "durationMonths"
  | "installmentCount"
> {
  if (!extraction) {
    return {
      annualInterest: null,
      annualInsurance: null,
      remainingPrincipal: null,
      loanAmount: null,
      durationMonths: null,
    };
  }

  if (kind === "amortization") {
    const amort = extraction as CreditAmortizationExtraction;
    return {
      annualInterest: amort.yearlyInterestTotal ?? null,
      annualInsurance: amort.yearlyInsuranceTotal ?? null,
      remainingPrincipal: amort.remainingPrincipal ?? null,
      loanAmount: amort.loanAmount ?? null,
      durationMonths: amort.loanDurationMonths ?? null,
      installmentCount: amort.installments?.length ?? 0,
    };
  }

  const offer = extraction as CreditLoanOfferExtraction;
  return {
    annualInterest: null,
    annualInsurance: offer.insuranceMonthlyAmount ?? null,
    remainingPrincipal: null,
    loanAmount: offer.loanAmount ?? null,
    durationMonths: offer.loanDurationMonths ?? null,
  };
}

function buildPayloadFromPipeline(
  result: CreditGptPipelineResult,
  phase: CreditExtractionPayloadPhase,
): CreditExtractionPayloadLog {
  const kind: CreditExtractionPayloadLog["kind"] =
    result.documentKind === "loan_offer" ? "loan_offer" : "amortization";
  const rawGptWrapper = kind === "loan_offer" ? result.loanOffer : result.amortization;
  const rawExtraction = rawGptWrapper?.extraction;
  const extractionMissing = rawExtraction === undefined;
  const extractionEmpty = isExtractionEffectivelyEmpty(rawExtraction);

  return {
    phase,
    at: new Date().toISOString(),
    documentId: result.documentId,
    kind,
    success: result.success,
    hasLoanOffer: Boolean(result.loanOffer),
    hasAmortization: Boolean(result.amortization),
    extractionEmpty,
    extractionMissing,
    pipelineError: result.error,
    gptSuccess: rawGptWrapper?.success,
    gptError: rawGptWrapper?.error,
    extractionKeys: objectKeys(rawExtraction),
    amortizationKeys: objectKeys(result.amortization?.extraction),
    loanOfferKeys: objectKeys(result.loanOffer?.extraction),
    ...scalarFieldsFromExtraction(rawExtraction, kind),
    rawExtraction,
    rawGptWrapper,
  };
}

export function logCreditExtractionPayload(log: CreditExtractionPayloadLog): void {
  console.log(LOG_PREFIX, log);
}

export function logCreditExtractionFromGptResponse(params: {
  documentId: string;
  documentKind: "loan_offer" | "amortization";
  gptResult: {
    success: boolean;
    extraction?: CreditAmortizationExtraction | CreditLoanOfferExtraction;
    error?: string;
  };
  threw?: boolean;
  throwMessage?: string;
}): void {
  const { documentId, documentKind, gptResult, threw, throwMessage } = params;

  if (threw) {
    logCreditExtractionPayload({
      phase: "extraction_threw",
      at: new Date().toISOString(),
      documentId,
      kind: documentKind,
      success: false,
      hasLoanOffer: documentKind === "loan_offer",
      hasAmortization: documentKind === "amortization",
      extractionEmpty: true,
      extractionMissing: true,
      pipelineError: throwMessage,
      gptSuccess: false,
      gptError: throwMessage,
      extractionKeys: [],
      amortizationKeys: [],
      loanOfferKeys: [],
      ...scalarFieldsFromExtraction(undefined, documentKind),
    });
    return;
  }

  const rawExtraction = gptResult.extraction;
  const extractionEmpty = isExtractionEffectivelyEmpty(rawExtraction);
  const base: CreditExtractionPayloadLog = {
    phase: extractionEmpty ? "extraction_empty" : "extraction_resolved",
    at: new Date().toISOString(),
    documentId,
    kind: documentKind,
    success: gptResult.success,
    hasLoanOffer: documentKind === "loan_offer",
    hasAmortization: documentKind === "amortization",
    extractionEmpty,
    extractionMissing: rawExtraction === undefined,
    gptSuccess: gptResult.success,
    gptError: gptResult.error,
    extractionKeys: objectKeys(rawExtraction),
    amortizationKeys: documentKind === "amortization" ? objectKeys(rawExtraction) : [],
    loanOfferKeys: documentKind === "loan_offer" ? objectKeys(rawExtraction) : [],
    ...scalarFieldsFromExtraction(rawExtraction, documentKind),
    rawExtraction,
    rawGptWrapper: gptResult,
  };

  logCreditExtractionPayload(base);
}

export function logCreditExtractionPipelineResult(
  result: CreditGptPipelineResult,
  phase: "extraction_resolved" | "pre_apply_pipeline_result",
): void {
  const log = buildPayloadFromPipeline(result, phase);
  if (log.extractionEmpty && log.success) {
    log.phase = "extraction_empty";
  }
  logCreditExtractionPayload(log);
}

export function logCreditExtractionMerge(params: {
  documentId?: string;
  kind: "amortization" | "loan_offer";
  current: CreditExtractionSession;
  extraction: CreditAmortizationExtraction | CreditLoanOfferExtraction;
  merged: CreditExtractionSession;
}): void {
  const { documentId, kind, current, extraction, merged } = params;
  logCreditExtractionPayload({
    phase: "merge_credit_extraction_session",
    at: new Date().toISOString(),
    documentId,
    kind,
    success: true,
    hasLoanOffer: Boolean(merged.loanOffer),
    hasAmortization: Boolean(merged.amortization),
    extractionEmpty: isExtractionEffectivelyEmpty(extraction),
    extractionMissing: extraction === undefined,
    extractionKeys: objectKeys(extraction),
    amortizationKeys: objectKeys(merged.amortization),
    loanOfferKeys: objectKeys(merged.loanOffer),
    ...scalarFieldsFromExtraction(extraction, kind),
    rawExtraction: extraction,
    mergeInput: {
      sessionLoanOfferKeys: objectKeys(current.loanOffer),
      sessionAmortizationKeys: objectKeys(current.amortization),
      extractionKeys: objectKeys(extraction),
      extraction,
    },
    mergedSession: {
      sessionLoanOfferKeys: objectKeys(current.loanOffer),
      sessionAmortizationKeys: objectKeys(current.amortization),
      mergedLoanOfferKeys: objectKeys(merged.loanOffer),
      mergedAmortizationKeys: objectKeys(merged.amortization),
      merged,
    },
  });
}
