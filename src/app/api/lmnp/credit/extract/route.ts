import { NextResponse } from "next/server";

import { extractCreditAmortizationWithGpt } from "@/lib/documents/gpt/extract-credit-amortization-with-gpt";
import {
  extractCreditDocumentaryMetadataWithGpt,
  extractCreditLoanOfferWithGpt,
} from "@/lib/documents/gpt/extract-credit-loan-offer-with-gpt";
import { logAmortizationGptServerIngress } from "@/lib/lmnp/services/credit-amortization-gpt-trace";
import {
  attachCreditPipelineServerTiming,
  detachCreditPipelineServerTiming,
  measureCreditPipelineAwait,
} from "@/lib/lmnp/services/credit-pipeline-timing";

export const maxDuration = 60;

export async function POST(request: Request) {
  const traceId =
    request.headers.get("x-credit-pipeline-trace-id") ??
    `credit-pipeline-server-${Date.now()}`;

  try {
    const body = (await request.json()) as {
      rawText?: string;
      fileName?: string;
      documentKind?: "amortization" | "loan_offer" | "documentary_metadata";
      declarationYear?: number;
      revenueYear?: number;
    };

    const rawText = body.rawText ?? "";
    const fileName = body.fileName ?? "document";
    const documentKind = body.documentKind ?? "amortization";
    const declarationYear = body.declarationYear ?? new Date().getFullYear();
    const revenueYear = body.revenueYear ?? declarationYear - 1;

    attachCreditPipelineServerTiming(traceId, {
      segment: "api_credit_extract",
      fileName,
      documentKind,
    });

    if (!rawText.trim()) {
      return NextResponse.json(
        { success: false, extraction: {}, error: "Texte OCR vide." },
        { status: 400 },
      );
    }

    if (documentKind === "loan_offer") {
      const result = await measureCreditPipelineAwait(
        "server_gpt_extract_loan_offer",
        extractCreditLoanOfferWithGpt({ rawText, fileName }),
        { fileName, textLength: rawText.length },
      );
      return NextResponse.json(result);
    }

    if (documentKind === "documentary_metadata") {
      const result = await measureCreditPipelineAwait(
        "server_gpt_extract_documentary_metadata",
        extractCreditDocumentaryMetadataWithGpt({
          rawText,
          fileName,
          sourceDocumentKind: "amortization_schedule",
        }),
        { fileName, textLength: rawText.length },
      );
      return NextResponse.json(result);
    }

    logAmortizationGptServerIngress({
      traceId,
      fileName,
      rawText,
      declarationYear,
      revenueYear,
    });

    const result = await measureCreditPipelineAwait(
      "server_gpt_extract_amortization",
      extractCreditAmortizationWithGpt({
        rawText,
        fileName,
        declarationYear,
        revenueYear,
      }),
      { fileName, textLength: rawText.length },
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction GPT échouée.";
    return NextResponse.json(
      { success: false, extraction: {}, error: message },
      { status: 500 },
    );
  } finally {
    detachCreditPipelineServerTiming();
  }
}
