/**
 * Documentary metadata extraction debug — rate, fees, bank from non-table PDF sections.
 */

import type { CreditLoanOfferExtraction } from "@/lib/documents/gpt/schemas/credit-loan-offer.schema";

export const DOCUMENTARY_EXTRACTION_DEBUG_PREFIX = "[documentary-extraction-debug]";

export function logDocumentaryExtractionBefore(params: {
  documentId?: string;
  fileName?: string;
  useSpatial: boolean;
  spatialSuccess?: boolean | null;
  spatialInstallmentCount?: number | null;
  pageCount?: number | null;
  ocrTextCharCount?: number;
  ocrProvider?: string;
}): void {
  console.log(DOCUMENTARY_EXTRACTION_DEBUG_PREFIX, "before_gpt_documentary", {
    documentId: params.documentId ?? null,
    fileName: params.fileName ?? null,
    useSpatial: params.useSpatial,
    spatialSuccess: params.spatialSuccess ?? null,
    spatialInstallmentCount: params.spatialInstallmentCount ?? null,
    pageCount: params.pageCount ?? null,
    scannedPages: params.pageCount ?? null,
    ocrTextCharCount: params.ocrTextCharCount ?? null,
    ocrProvider: params.ocrProvider ?? null,
    note: "Full OCR text is sent to GPT documentary extraction (all pages, not table-filtered).",
  });
}

export function logDocumentaryExtractionAfter(params: {
  documentId?: string;
  fileName?: string;
  success: boolean;
  error?: string | null;
  extraction?: CreditLoanOfferExtraction;
}): void {
  const extraction = params.extraction ?? {};
  console.log(DOCUMENTARY_EXTRACTION_DEBUG_PREFIX, "after_gpt_documentary", {
    documentId: params.documentId ?? null,
    fileName: params.fileName ?? null,
    success: params.success,
    error: params.error ?? null,
    nominalRate: extraction.interestRate ?? null,
    dossierFees: extraction.applicationFees ?? null,
    guaranteeFees: extraction.guaranteeFees ?? null,
    bankName: extraction.bankName ?? null,
    loanType: extraction.loanType ?? null,
    deferredLoanType: extraction.deferredLoanType ?? null,
  });
}

export function logDocumentaryFormHydration(params: {
  documentId?: string;
  revenueYear?: number;
  sessionHasLoanOffer: boolean;
  rate?: string;
  loanApplicationFees?: string;
  loanGuaranteeFees?: string;
  bank?: string;
  fieldSources?: Record<string, string | undefined>;
}): void {
  console.log(DOCUMENTARY_EXTRACTION_DEBUG_PREFIX, "before_form_hydration", {
    documentId: params.documentId ?? null,
    revenueYear: params.revenueYear ?? null,
    sessionHasLoanOffer: params.sessionHasLoanOffer,
    rate: params.rate ?? "",
    loanApplicationFees: params.loanApplicationFees ?? "",
    loanGuaranteeFees: params.loanGuaranteeFees ?? "",
    bank: params.bank ?? "",
    fieldSources: params.fieldSources ?? null,
  });
}

export function logDocumentaryUiRender(params: {
  rate?: string;
  loanApplicationFees?: string;
  loanGuaranteeFees?: string;
  bank?: string;
}): void {
  console.log(DOCUMENTARY_EXTRACTION_DEBUG_PREFIX, "before_ui_render", {
    rate: params.rate ?? "",
    loanApplicationFees: params.loanApplicationFees ?? "",
    loanGuaranteeFees: params.loanGuaranteeFees ?? "",
    bank: params.bank ?? "",
  });
}
