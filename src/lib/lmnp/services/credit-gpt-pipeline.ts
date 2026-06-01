import type { CreditAmortizationGptExtractionResult } from "@/lib/documents/gpt/extract-credit-amortization-with-gpt";
import type { CreditLoanOfferGptExtractionResult } from "@/lib/documents/gpt/extract-credit-loan-offer-with-gpt";
import { normalizeOcrText } from "@/lib/documents/normalizers";
import {
  DocumentOcrFailedError,
  resolveDocumentTextOrThrow,
} from "@/lib/documents/ocr";
import type { LmnpDocument } from "@/lib/lmnp/types";

import {
  classifyCreditDocument,
  revenueYearFromDeclaration,
  type CreditDocumentKind,
} from "./credit-profile";
import { traceCreditAnalysisTimeline } from "./credit-analysis-timeline";
import {
  logCreditExtractionFromGptResponse,
  logCreditExtractionPipelineResult,
} from "./credit-extraction-payload";
import { setAmortizationGptClientTraceContext } from "./credit-amortization-gpt-trace";
import {
  getCreditPipelineTraceId,
  measureCreditPipelineAwait,
  measureCreditPipelineSync,
  traceCreditPipelineStep,
} from "./credit-pipeline-timing";
import { requestCreditGptExtraction } from "./credit-gpt-extract-client";
import { resolveDocumentFile } from "./resolve-document-file";

export { DocumentOcrFailedError };

export type CreditGptPipelineResult = {
  documentId: string;
  fileName: string;
  documentKind: CreditDocumentKind;
  rawText: string;
  ocrProvider: string;
  amortization?: CreditAmortizationGptExtractionResult;
  loanOffer?: CreditLoanOfferGptExtractionResult;
  success: boolean;
  error?: string;
};

export type RunCreditGptPipelineParams = {
  document: LmnpDocument;
  getFile: (documentId: string) => File | undefined;
  fiscalYear?: number;
};

/**
 * GPT-first Crédit pipeline: OCR → classify → GPT structured extraction.
 * Runs only on upload or explicit reanalyze — never on passive hydration.
 */
export async function runCreditGptPipeline(
  params: RunCreditGptPipelineParams,
): Promise<CreditGptPipelineResult> {
  const { document, getFile, fiscalYear = new Date().getFullYear() } = params;

  const documentKind = measureCreditPipelineSync("classify_credit_document", () =>
    classifyCreditDocument(document),
  );
  const revenueYear = revenueYearFromDeclaration(fiscalYear);

  traceCreditAnalysisTimeline("OCR_started", document.id);

  const file = await measureCreditPipelineAwait(
    "pdf_file_resolve",
    resolveDocumentFile(document, getFile),
    { fileName: document.fileName },
  );

  traceCreditPipelineStep("pdf_file_loaded", {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });

  traceCreditPipelineStep("ocr_request_start", {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });

  const ocrResult = await measureCreditPipelineAwait(
    "ocr_resolve_document_text",
    resolveDocumentTextOrThrow(file),
    { fileName: file.name },
  );

  traceCreditPipelineStep("ocr_request_end", {
    provider: ocrResult.provider,
    pageCount: ocrResult.pageCount,
    textLength: ocrResult.rawText.length,
  });

  const rawText = measureCreditPipelineSync(
    "ocr_text_normalize",
    () => normalizeOcrText(ocrResult.rawText),
    { textLength: ocrResult.rawText.length },
  );

  traceCreditAnalysisTimeline("OCR_finished", document.id, undefined, {
    provider: ocrResult.provider,
    textLength: rawText.length,
    documentKind,
  });

  if (documentKind === "loan_offer") {
    traceCreditAnalysisTimeline("extraction_started", document.id, undefined, {
      documentKind: "loan_offer",
    });
    let loanOffer;
    try {
      traceCreditPipelineStep("gpt_request_start", { documentKind: "loan_offer" });
      loanOffer = await measureCreditPipelineAwait(
        "gpt_extract_loan_offer",
        requestCreditGptExtraction({
          rawText,
          fileName: document.fileName,
          documentKind,
          declarationYear: fiscalYear,
          revenueYear,
        }),
        { documentKind: "loan_offer", textLength: rawText.length },
      );
      traceCreditPipelineStep("gpt_request_end", {
        documentKind: "loan_offer",
        success: loanOffer.success,
      });
      logCreditExtractionFromGptResponse({
        documentId: document.id,
        documentKind: "loan_offer",
        gptResult: loanOffer,
      });
    } catch (err) {
      logCreditExtractionFromGptResponse({
        documentId: document.id,
        documentKind: "loan_offer",
        gptResult: { success: false },
        threw: true,
        throwMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    traceCreditAnalysisTimeline("extraction_finished", document.id, undefined, {
      documentKind: "loan_offer",
      success: loanOffer.success,
    });

    const pipelineResult: CreditGptPipelineResult = {
      documentId: document.id,
      fileName: document.fileName,
      documentKind,
      rawText,
      ocrProvider: ocrResult.provider,
      loanOffer: loanOffer as CreditLoanOfferGptExtractionResult,
      success: loanOffer.success,
      error: loanOffer.error,
    };

    logCreditExtractionPipelineResult(pipelineResult, "extraction_resolved");

    return pipelineResult;
  }

  traceCreditAnalysisTimeline("extraction_started", document.id, undefined, {
    documentKind: "amortization",
  });

  let amortization;
  try {
    setAmortizationGptClientTraceContext({
      traceId: getCreditPipelineTraceId(),
      documentId: document.id,
      fileName: document.fileName,
      ocrPageCount: ocrResult.pageCount,
      ocrProvider: ocrResult.provider,
      ocrTextCharCount: rawText.length,
    });
    traceCreditPipelineStep("gpt_request_start", { documentKind: "amortization" });
    amortization = await measureCreditPipelineAwait(
      "gpt_extract_amortization",
      requestCreditGptExtraction({
        rawText,
        fileName: document.fileName,
        documentKind: "amortization",
        declarationYear: fiscalYear,
        revenueYear,
      }),
      { documentKind: "amortization", textLength: rawText.length },
    );
    traceCreditPipelineStep("gpt_request_end", {
      documentKind: "amortization",
      success: amortization.success,
      installmentCount:
        "installments" in amortization.extraction
          ? (amortization.extraction.installments?.length ?? 0)
          : 0,
    });
    logCreditExtractionFromGptResponse({
      documentId: document.id,
      documentKind: "amortization",
      gptResult: amortization,
    });
  } catch (err) {
    logCreditExtractionFromGptResponse({
      documentId: document.id,
      documentKind: "amortization",
      gptResult: { success: false },
      threw: true,
      throwMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  traceCreditAnalysisTimeline("extraction_finished", document.id, undefined, {
    documentKind: "amortization",
    success: amortization.success,
    loanAmount: amortization.extraction?.loanAmount,
    loanDurationMonths: amortization.extraction?.loanDurationMonths,
    installmentCount:
      "installments" in amortization.extraction
        ? (amortization.extraction.installments?.length ?? 0)
        : 0,
  });

  const pipelineResult: CreditGptPipelineResult = {
    documentId: document.id,
    fileName: document.fileName,
    documentKind,
    rawText,
    ocrProvider: ocrResult.provider,
    amortization: amortization as CreditAmortizationGptExtractionResult,
    success: amortization.success,
    error: amortization.error,
  };

  logCreditExtractionPipelineResult(pipelineResult, "extraction_resolved");

  return pipelineResult;
}
