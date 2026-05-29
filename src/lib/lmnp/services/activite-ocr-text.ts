/** @deprecated Use `@/lib/documents/ocr` (`resolveDocumentText`) — legacy field-aggregation OCR. */

import type { DocumentAnalysisResult } from "@/lib/lmnp/ocr/map-to-extractions";
import type { OcrDocumentResult } from "@/lib/lmnp/ocr/schema";
import { OcrClientError, requestDocumentOcr } from "@/lib/lmnp/services/ocr-client";
import { fileToVisionImages } from "@/lib/lmnp/services/pdf-to-images";
import type { LmnpDocument } from "@/lib/lmnp/types";

const MIN_PDF_TEXT_LENGTH = 40;

/**
 * Extracts embedded text from a PDF in the browser (when available).
 */
export async function extractPdfTextClient(file: File): Promise<string> {
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
    return "";
  }

  const pdfjs = await import("pdfjs-dist");

  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pageCount = Math.min(pdf.numPages, 4);
  const parts: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
      .join(" ");
    if (pageText.trim()) parts.push(pageText);
  }

  return parts.join("\n").trim();
}

function ocrFieldsToText(ocr: OcrDocumentResult | undefined, fileName: string): string {
  const parts = [fileName];

  if (ocr?.supplierName?.text) parts.push(ocr.supplierName.text);
  if (ocr?.address?.text) parts.push(ocr.address.text);
  if (ocr?.invoiceDate?.value) parts.push(ocr.invoiceDate.value);
  if (ocr?.totalAmount?.euros) parts.push(String(ocr.totalAmount.euros));

  return parts.filter(Boolean).join("\n");
}

function analysisToText(result: DocumentAnalysisResult, fileName: string): string {
  const fromOcr = ocrFieldsToText(result.ocr, fileName);
  const fromExtractions = result.extractions
    .map((e) => e.rawValue)
    .filter(Boolean)
    .join("\n");

  return [fromOcr, fromExtractions].filter(Boolean).join("\n");
}

/**
 * Resolves OCR raw text for the document intelligence pipeline.
 * Prefers embedded PDF text; falls back to vision OCR field aggregation.
 */
export async function resolveActiviteOcrText(
  file: File,
  doc: LmnpDocument,
  fiscalYear?: number,
): Promise<{ rawText: string; provider: string }> {
  const pdfText = await extractPdfTextClient(file);
  if (pdfText.length >= MIN_PDF_TEXT_LENGTH) {
    return { rawText: pdfText, provider: "pdf_text" };
  }

  try {
    const images = await fileToVisionImages(file);
    const result = await requestDocumentOcr(images, {
      fileName: doc.fileName,
      userCategory: doc.category,
      fiscalYearId: doc.fiscalYearId,
      documentId: doc.id,
      fiscalYear,
    });

    const rawText = [pdfText, analysisToText(result, doc.fileName)].filter(Boolean).join("\n");
    return { rawText: rawText || doc.fileName, provider: "vision" };
  } catch (err) {
    if (err instanceof OcrClientError && err.status === 503) {
      return { rawText: pdfText || doc.fileName, provider: "fallback_filename" };
    }
    throw err;
  }
}
