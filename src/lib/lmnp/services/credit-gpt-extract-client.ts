import type { CreditAmortizationGptExtractionResult } from "@/lib/documents/gpt/extract-credit-amortization-with-gpt";
import type { CreditLoanOfferGptExtractionResult } from "@/lib/documents/gpt/extract-credit-loan-offer-with-gpt";
import type { CreditDocumentKind } from "@/lib/lmnp/services/credit-profile";

import {
  clearAmortizationGptClientTraceContext,
  logAmortizationGptClientRequestEnd,
  logAmortizationGptClientRequestStart,
} from "./credit-amortization-gpt-trace";
import {
  getCreditPipelineTraceId,
  incrementCreditPipelineCounter,
  measureCreditPipelineAwait,
} from "./credit-pipeline-timing";

export class CreditGptExtractError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CreditGptExtractError";
  }
}

export async function requestCreditGptExtraction(params: {
  rawText: string;
  fileName: string;
  documentKind: CreditDocumentKind;
  declarationYear: number;
  revenueYear: number;
}): Promise<CreditAmortizationGptExtractionResult | CreditLoanOfferGptExtractionResult> {
  incrementCreditPipelineCounter("gpt_extract_requests");

  const traceId = getCreditPipelineTraceId();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (traceId) {
    headers["X-Credit-Pipeline-Trace-Id"] = traceId;
  }

  const bodyJson = JSON.stringify(params);
  const isAmortization = params.documentKind === "amortization";

  if (isAmortization) {
    logAmortizationGptClientRequestStart({
      rawText: params.rawText,
      fileName: params.fileName,
      declarationYear: params.declarationYear,
      revenueYear: params.revenueYear,
      requestBodyBytes: new TextEncoder().encode(bodyJson).length,
    });
  }

  const networkFetchStart = performance.now();
  const response = await measureCreditPipelineAwait(
    "gpt_http_fetch",
    fetch("/api/lmnp/credit/extract", {
      method: "POST",
      headers,
      body: bodyJson,
    }),
    { documentKind: params.documentKind, textLength: params.rawText.length },
  );
  const networkFetchMs = performance.now() - networkFetchStart;

  if (!response.ok) {
    const errorParseStart = performance.now();
    const payload = await measureCreditPipelineAwait(
      "gpt_error_response_json_parse",
      response.json().catch(() => ({})) as Promise<{ error?: string }>,
    );
    if (isAmortization) {
      logAmortizationGptClientRequestEnd({
        networkFetchMs,
        responseJsonParseMs: performance.now() - errorParseStart,
        httpStatus: response.status,
        success: false,
      });
      clearAmortizationGptClientTraceContext();
    }
    throw new CreditGptExtractError(
      payload.error ?? `GPT extraction failed (${response.status})`,
      response.status,
    );
  }

  const jsonParseStart = performance.now();
  const result = await measureCreditPipelineAwait(
    "gpt_response_json_parse",
    response.json() as Promise<
      CreditAmortizationGptExtractionResult | CreditLoanOfferGptExtractionResult
    >,
    { documentKind: params.documentKind },
  );
  const responseJsonParseMs = performance.now() - jsonParseStart;

  if (isAmortization) {
    const responseBodyBytes = new TextEncoder().encode(JSON.stringify(result)).length;
    logAmortizationGptClientRequestEnd({
      networkFetchMs,
      responseJsonParseMs,
      httpStatus: response.status,
      responseBodyBytes,
      success: result.success,
      installmentCount:
        "installments" in result.extraction ? (result.extraction.installments?.length ?? 0) : 0,
    });
    clearAmortizationGptClientTraceContext();
  }

  return result;
}
