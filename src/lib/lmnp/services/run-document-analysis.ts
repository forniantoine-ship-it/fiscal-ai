import type { DocumentAnalysisResult } from "../ocr/map-to-extractions";
import { buildEmptyAnalysisResult } from "../ocr/map-to-extractions";
import type { LmnpDocument } from "../types";
import type { LmnpAction } from "../store/reducer";
import { inferDocumentType } from "./document-classifier";
import { extractPdfTextClient } from "./activite-ocr-text";
import { OcrClientError, requestDocumentOcr } from "./ocr-client";
import { fileToVisionImages } from "./pdf-to-images";
import { resolveDocumentFile } from "./resolve-document-file";
import type { OcrDocumentResult } from "../ocr/schema";

export async function runBulkDocumentAnalysis(params: {
  documents: LmnpDocument[];
  documentIds: string[];
  getFile: (documentId: string) => File | undefined;
  dispatch: (action: LmnpAction) => void;
  fiscalYear?: number;
}): Promise<{ succeeded: number; failed: number }> {
  const { documents, documentIds, getFile, dispatch, fiscalYear } = params;
  let succeeded = 0;
  let failed = 0;

  if (documentIds.length === 0) {
    console.log("[analysis] no analyzable documents", {
      pipeline: "runBulkDocumentAnalysis",
      reason: "empty documentIds",
    });
    return { succeeded, failed };
  }

  console.log("[analysis] bulk extraction start", {
    pipeline: "runBulkDocumentAnalysis",
    documentIds,
    documentCount: documentIds.length,
    note: "vision OCR path — does NOT call classifier or invoice-extractor",
  });
  // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
  console.log("[charges-runBulk-entry]", {
    docs: documents
      .filter((d) => documentIds.includes(d.id))
      .map((d) => ({
        id: d.id,
        fileName: d.fileName,
        status: d.status,
      })),
  });

  for (const docId of documentIds) {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) {
      console.log("[analysis] extraction skipped", {
        pipeline: "runBulkDocumentAnalysis",
        reason: "document not found in workspace",
        documentId: docId,
      });
      continue;
    }

    // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
    console.log("[charges-ocr-start]", {
      reason: "runBulkDocumentAnalysis",
      documentIds: [docId],
      fileName: doc.fileName,
      currentStatus: doc.status,
    });

    dispatch({ type: "DOCUMENT_SET_STATUS", documentId: docId, status: "processing" });

    try {
      const file = await resolveDocumentFile(doc, getFile);

      const result = await analyzeDocumentWithVision(doc, file, fiscalYear);
      const ocrTextLength = result.extractions
        .map((entry) => entry.rawValue)
        .join("\n").length;
      console.log("[charges-pno-debug] OCR analysis applied", {
        documentId: docId,
        fileName: doc.fileName,
        detectedDocumentType: result.documentType,
        category: result.category,
        extractionCount: result.extractions.length,
        ocrTextLength,
        fieldKeys: result.extractions.map((entry) => entry.fieldKey),
      });
      dispatch({ type: "APPLY_DOCUMENT_ANALYSIS", documentId: docId, result });
      succeeded++;
      } catch (err) {
        console.error("[runBulkDocumentAnalysis]", doc.fileName, err);
        console.error("[amortization-pipeline-debug] ui_analyse_impossible", {
          source: "runBulkDocumentAnalysis.catch",
          documentId: docId,
          fileName: doc.fileName,
          reason: "analyzeDocumentWithVision_threw",
          errorMessage: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        dispatch({ type: "DOCUMENT_SET_STATUS", documentId: docId, status: "failed" });
      failed++;
    }
  }

  console.log("[analysis] extraction completed", {
    pipeline: "runBulkDocumentAnalysis",
    succeeded,
    failed,
    documentCount: documentIds.length,
  });

  return { succeeded, failed };
}

function ocrFieldsToParserCorpus(ocr: OcrDocumentResult | undefined, fileName: string): string {
  const parts = [fileName];
  if (ocr?.supplierName?.text) parts.push(ocr.supplierName.text);
  if (ocr?.address?.text) parts.push(ocr.address.text);
  if (ocr?.invoiceDate?.value) parts.push(ocr.invoiceDate.value);
  if (ocr?.totalAmount?.euros !== undefined) parts.push(String(ocr.totalAmount.euros));
  return parts.filter(Boolean).join("\n");
}

function buildChargeParserCorpus(
  doc: LmnpDocument,
  file: File,
  result: DocumentAnalysisResult,
  embeddedPdfText: string,
): string | undefined {
  const isChargeDoc =
    doc.category === "charges" ||
    result.category === "charges" ||
    result.documentType === "insurance_invoice" ||
    result.documentType === "condo_charges" ||
    result.documentType === "property_tax" ||
    result.documentType === "works_invoice";
  if (!isChargeDoc) return undefined;

  const extractionText = result.extractions.map((entry) => entry.rawValue).filter(Boolean).join("\n");
  const corpus = [embeddedPdfText, ocrFieldsToParserCorpus(result.ocr, doc.fileName), extractionText]
    .filter((part) => part.trim().length > 0)
    .join("\n")
    .trim();

  return corpus.length > 0 ? corpus : undefined;
}

async function analyzeDocumentWithVision(
  doc: LmnpDocument,
  file: File,
  fiscalYear?: number,
): Promise<DocumentAnalysisResult> {
  try {
    const embeddedPdfText = await extractPdfTextClient(file);
    const images = await fileToVisionImages(file);
    const remote = await requestDocumentOcr(images, {
      fileName: doc.fileName,
      userCategory: doc.category,
      fiscalYearId: doc.fiscalYearId,
      documentId: doc.id,
      fiscalYear,
    });
    const chargeParserCorpus = buildChargeParserCorpus(doc, file, remote, embeddedPdfText);
    return { ...remote, chargeParserCorpus };
  } catch (err) {
    if (err instanceof OcrClientError && err.status === 503) {
      return buildHeuristicFallback(doc);
    }
    throw err;
  }
}

/** No fake amounts — returns empty extractions with clear warning. */
function buildHeuristicFallback(doc: LmnpDocument): DocumentAnalysisResult {
  const inferred = inferDocumentType(doc.fileName, doc.category);
  return buildEmptyAnalysisResult({
    documentType: inferred.documentType,
    warnings: [
      "Analyse IA indisponible — aucun montant n'a été inventé.",
      "Saisissez les champs manuellement ci-dessous.",
    ],
    inconsistencies: [
      {
        code: "NO_FISCAL_AMOUNT",
        severity: "warning",
        message: "Extraction automatique indisponible — saisie manuelle requise.",
      },
    ],
    usedHeuristicFallback: true,
  });
}
