import type { CreditAmortizationGptExtractionResult } from "@/lib/documents/gpt/extract-credit-amortization-with-gpt";
import type { CreditLoanOfferGptExtractionResult } from "@/lib/documents/gpt/extract-credit-loan-offer-with-gpt";
import { normalizeOcrText } from "@/lib/documents/normalizers";
import {
  DocumentOcrFailedError,
  resolveDocumentTextOrThrow,
} from "@/lib/documents/ocr";
import { isPdfFile } from "@/lib/documents/ocr/pdf-native-text";
import { parseSpatialAmortizationFromFile } from "@/lib/lmnp/parsers/spatial-amortization-browser";
import {
  buildSpatialPrimaryGptResult,
  logSpatialParserPrimary,
  shouldUseSpatialAsPrimary,
} from "@/lib/lmnp/parsers/spatial-amortization-primary";
import type { LmnpDocument } from "@/lib/lmnp/types";

import {
  classifyCreditDocument,
  revenueYearFromDeclaration,
  type CreditDocumentKind,
} from "./credit-profile";
import {
  logPipelineEntry,
  logPipelineEntryCatch,
  logPipelineEntryEarlyReturn,
} from "./pipeline-entry-debug";
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

  logPipelineEntry({
    functionName: "runCreditGptPipeline",
    entered: true,
    documentId: document.id,
    fileName: document.fileName,
  });

  const documentKind = measureCreditPipelineSync("classify_credit_document", () =>
    classifyCreditDocument(document),
  );
  const revenueYear = revenueYearFromDeclaration(fiscalYear);

  logPipelineEntry({
    functionName: "runCreditGptPipeline.documentKindDetected",
    entered: true,
    returned: true,
    documentType: documentKind,
    documentId: document.id,
    fileName: document.fileName,
    extra: { isAmortization: documentKind === "amortization", isLoanOffer: documentKind === "loan_offer" },
  });

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

    logPipelineEntry({
      functionName: "runCreditGptPipeline",
      returned: true,
      success: pipelineResult.success,
      documentType: documentKind,
      ocrProvider: ocrResult.provider,
      documentId: document.id,
      fileName: document.fileName,
      failureReason: pipelineResult.error ?? null,
      extra: { branch: "loan_offer" },
    });

    return pipelineResult;
  }

  logPipelineEntry({
    functionName: "runCreditGptPipeline.amortizationBranch",
    entered: true,
    documentType: "amortization",
    documentId: document.id,
    fileName: document.fileName,
  });

  traceCreditAnalysisTimeline("extraction_started", document.id, undefined, {
    documentKind: "amortization",
  });

  const isPdf = isPdfFile(file);
  let spatialParse = null;

  logPipelineEntry({
    functionName: "runCreditGptPipeline.spatialParseGate",
    entered: true,
    documentType: "amortization",
    ocrProvider: ocrResult.provider,
    documentId: document.id,
    fileName: document.fileName,
    extra: { isPdf, willEnterSpatialParser: isPdf },
  });

  if (isPdf) {
    traceCreditPipelineStep("spatial_parser_start", {
      documentId: document.id,
      fileName: document.fileName,
    });
    logPipelineEntry({
      functionName: "parseSpatialAmortizationFromFile",
      entered: true,
      documentType: "amortization",
      ocrProvider: ocrResult.provider,
      documentId: document.id,
      fileName: document.fileName,
    });
    try {
      spatialParse = await measureCreditPipelineAwait(
        "spatial_amortization_parse",
        parseSpatialAmortizationFromFile(file),
        { documentId: document.id, fileName: document.fileName },
      );
      const datedCount =
        spatialParse?.installments.filter((row) => Boolean(row.date?.trim())).length ?? 0;
      logPipelineEntry({
        functionName: "parseSpatialAmortizationFromFile",
        returned: true,
        success: spatialParse?.success ?? null,
        documentType: "amortization",
        ocrProvider: ocrResult.provider,
        documentId: document.id,
        fileName: document.fileName,
        installmentCount: spatialParse?.installments.length ?? null,
        datedInstallmentCount: datedCount,
        extra: { confidenceScore: spatialParse?.confidenceScore ?? null },
      });
      console.log("[amortization-pipeline-debug] credit_pipeline_bridge", {
        documentId: document.id,
        fileName: document.fileName,
        phase: "spatial_parse_ok",
        spatialParse: spatialParse
          ? {
              success: spatialParse.success,
              confidenceScore: spatialParse.confidenceScore,
              installmentCount: spatialParse.installments.length,
              datedInstallmentCount: datedCount,
            }
          : null,
      });
    } catch (spatialErr) {
      logPipelineEntryCatch("runCreditGptPipeline.parseSpatialAmortizationFromFile", spatialErr, {
        documentType: "amortization",
        ocrProvider: ocrResult.provider,
        documentId: document.id,
        fileName: document.fileName,
        extra: { fallback: "continue_with_spatialParse_null" },
      });
      console.warn("[spatial-parser-primary]", {
        documentId: document.id,
        fileName: document.fileName,
        sourceUsed: "gpt_fallback",
        confidenceScore: 0,
        installmentCount: 0,
        ocrProvider: ocrResult.provider,
        reason: "spatial_parse_threw",
        error: spatialErr instanceof Error ? spatialErr.message : String(spatialErr),
      });
    }
    traceCreditPipelineStep("spatial_parser_end", {
      documentId: document.id,
      installmentCount: spatialParse?.installments.length ?? 0,
      confidenceScore: spatialParse?.confidenceScore ?? 0,
    });

    if (spatialParse) {
      console.log("[spatial-parser-trace]", {
        functionName: "credit-gpt-pipeline.afterSpatialParse",
        entered: false,
        rowCount: spatialParse.installments.length,
        extra: {
          documentId: document.id,
          fileName: document.fileName,
          confidenceScore: spatialParse.confidenceScore,
          sampleInstallments: spatialParse.installments.slice(0, 5).map((row) => ({
            date: row.date,
            payment: row.payment,
            principal: row.principal,
            interest: row.interest,
            insurance: row.insurance,
            remainingCapital: row.remainingCapital,
          })),
        },
      });
    }
  } else {
    logPipelineEntryEarlyReturn("runCreditGptPipeline.spatialParseGate", "not_pdf_skip_spatial_parser", {
      documentType: "amortization",
      ocrProvider: ocrResult.provider,
      documentId: document.id,
      fileName: document.fileName,
      extra: { isPdf: false },
    });
  }

  const spatialPrimaryDecision = shouldUseSpatialAsPrimary({
    isPdf,
    ocrProvider: ocrResult.provider,
    spatial: spatialParse,
  });

  logPipelineEntry({
    functionName: "shouldUseSpatialAsPrimary",
    returned: true,
    success: spatialPrimaryDecision.useSpatial,
    failureReason: spatialPrimaryDecision.useSpatial ? null : spatialPrimaryDecision.reason,
    documentType: "amortization",
    ocrProvider: ocrResult.provider,
    documentId: document.id,
    fileName: document.fileName,
    installmentCount: spatialParse?.installments.length ?? null,
    datedInstallmentCount:
      spatialParse?.installments.filter((row) => Boolean(row.date?.trim())).length ?? null,
    extra: {
      useSpatial: spatialPrimaryDecision.useSpatial,
      reason: spatialPrimaryDecision.reason,
      spatialParseSuccess: spatialParse?.success ?? null,
      spatialConfidence: spatialParse?.confidenceScore ?? null,
    },
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
    traceCreditPipelineStep("gpt_request_start", {
      documentKind: "amortization",
      spatialPrimary: spatialPrimaryDecision.useSpatial,
    });

    const gptResult = (await measureCreditPipelineAwait(
      "gpt_extract_amortization",
      requestCreditGptExtraction({
        rawText,
        fileName: document.fileName,
        documentKind: "amortization",
        declarationYear: fiscalYear,
        revenueYear,
      }),
      { documentKind: "amortization", textLength: rawText.length },
    )) as CreditAmortizationGptExtractionResult;

    if (spatialPrimaryDecision.useSpatial && spatialParse) {
      amortization = buildSpatialPrimaryGptResult(spatialParse, revenueYear, gptResult);
      logPipelineEntry({
        functionName: "runCreditGptPipeline.buildSpatialPrimaryGptResult",
        returned: true,
        success: amortization.success,
        failureReason: amortization.error ?? null,
        documentType: "amortization",
        ocrProvider: ocrResult.provider,
        documentId: document.id,
        fileName: document.fileName,
        installmentCount: amortization.extraction.installments?.length ?? null,
        extra: { branch: "spatial_primary" },
      });
      console.log("[amortization-pipeline-debug] credit_pipeline_bridge", {
        documentId: document.id,
        fileName: document.fileName,
        phase: "spatial_primary_build_result",
        amortizationSuccess: amortization.success,
        amortizationError: amortization.error ?? null,
        extractionInstallmentCount: amortization.extraction.installments?.length ?? 0,
        loanInstallmentCount: amortization.extraction.installments?.filter((row) => row.date?.trim())
          .length ?? 0,
      });
      logSpatialParserPrimary({
        sourceUsed: "spatial",
        confidenceScore: spatialParse.confidenceScore,
        installmentCount: amortization.extraction.installments?.length ?? 0,
        ocrProvider: ocrResult.provider,
        reason: spatialPrimaryDecision.reason,
        documentId: document.id,
        fileName: document.fileName,
      });
    } else {
      amortization = gptResult;
      logPipelineEntry({
        functionName: "runCreditGptPipeline.gptFallback",
        returned: true,
        success: amortization.success,
        failureReason: amortization.error ?? null,
        documentType: "amortization",
        ocrProvider: ocrResult.provider,
        documentId: document.id,
        fileName: document.fileName,
        installmentCount: gptResult.extraction.installments?.length ?? null,
        extra: { branch: "gpt_fallback", spatialPrimaryReason: spatialPrimaryDecision.reason },
      });
      logSpatialParserPrimary({
        sourceUsed: "gpt_fallback",
        confidenceScore: spatialParse?.confidenceScore ?? 0,
        installmentCount: gptResult.extraction.installments?.length ?? 0,
        ocrProvider: ocrResult.provider,
        reason: spatialPrimaryDecision.reason,
        documentId: document.id,
        fileName: document.fileName,
      });
    }

    traceCreditPipelineStep("gpt_request_end", {
      documentKind: "amortization",
      success: amortization.success,
      sourceUsed: spatialPrimaryDecision.useSpatial ? "spatial" : "gpt_fallback",
      installmentCount: amortization.extraction.installments?.length ?? 0,
    });
    logCreditExtractionFromGptResponse({
      documentId: document.id,
      documentKind: "amortization",
      gptResult: amortization,
    });
  } catch (err) {
    logPipelineEntryCatch("runCreditGptPipeline.amortizationExtraction", err, {
      documentType: "amortization",
      ocrProvider: ocrResult.provider,
      documentId: document.id,
      fileName: document.fileName,
    });
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

  logPipelineEntry({
    functionName: "runCreditGptPipeline",
    returned: true,
    success: pipelineResult.success,
    failureReason: pipelineResult.error ?? null,
    documentType: documentKind,
    ocrProvider: ocrResult.provider,
    documentId: document.id,
    fileName: document.fileName,
    installmentCount:
      pipelineResult.amortization?.extraction &&
      "installments" in pipelineResult.amortization.extraction
        ? (pipelineResult.amortization.extraction.installments?.length ?? null)
        : null,
    extra: { branch: "amortization_final" },
  });

  console.log("[amortization-pipeline-debug] credit_pipeline_bridge", {
    documentId: document.id,
    fileName: document.fileName,
    phase: "final_credit_result",
    creditResultSuccess: pipelineResult.success,
    creditResultError: pipelineResult.error ?? null,
    spatialPrimaryUsed: spatialPrimaryDecision.useSpatial,
    spatialPrimaryReason: spatialPrimaryDecision.reason,
    installmentCount:
      pipelineResult.amortization?.extraction &&
      "installments" in pipelineResult.amortization.extraction
        ? (pipelineResult.amortization.extraction.installments?.length ?? 0)
        : 0,
    uiLikelyOutcome: pipelineResult.success ? "analyzed" : "analysis_failed_analyse_impossible",
  });

  return pipelineResult;
}
