import { extractNativePdfText, isPdfFile } from "@/lib/documents/ocr/pdf-native-text";
import { NATIVE_PDF_TEXT_MIN_LENGTH } from "@/lib/documents/ocr/resolve-document-text";
import type { LmnpDocument } from "@/lib/lmnp/types";

import { inferRevenusSourceType } from "./revenus-ocr-lines-adapter";
import { detectStructuredRevenueTable } from "./revenus-structured-table-parser";
import type {
  RevenueDetectedSourceType,
  RevenuePipelineId,
} from "./pipelines/revenus/revenue-pipeline-types";

export type RevenueRouteDecision = {
  fileName: string;
  mimeType: string;
  extension: string;
  detectedSourceType: RevenueDetectedSourceType;
  selectedPipeline: RevenuePipelineId;
  skippedPipelines: RevenuePipelineId[];
  sourceType: ReturnType<typeof inferRevenusSourceType>;
};

const SPREADSHEET_EXTENSIONS = new Set(["csv", "xlsx", "xls", "ods"]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "bmp"]);
const IMAGE_MIME_PREFIX = "image/";

const ALL_PIPELINES: RevenuePipelineId[] = [
  "spreadsheet",
  "pdf_structured",
  "vision",
  "documentary",
];

function extensionFromFileName(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? (parts.pop() ?? "") : "";
}

function isSpreadsheetFile(file: File): boolean {
  const ext = extensionFromFileName(file.name);
  if (SPREADSHEET_EXTENSIONS.has(ext)) return true;
  return (
    file.type.includes("spreadsheet") ||
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function isImageFile(file: File): boolean {
  const ext = extensionFromFileName(file.name);
  if (IMAGE_EXTENSIONS.has(ext)) return true;
  return file.type.startsWith(IMAGE_MIME_PREFIX);
}

function isDocumentaryHint(sourceType: ReturnType<typeof inferRevenusSourceType>): boolean {
  return sourceType === "rent_receipt" || sourceType === "attestation";
}

function logRevenusRoutingDebug(detail: Record<string, unknown>): void {
  console.log("[revenus-routing-debug]", detail);
}

async function classifyPdfSource(file: File): Promise<RevenueDetectedSourceType> {
  if (!isPdfFile(file)) return "scanned_pdf";

  const native = await extractNativePdfText(file);
  const nativeText = native.text.trim();

  if (nativeText.length <= NATIVE_PDF_TEXT_MIN_LENGTH) {
    return "scanned_pdf";
  }

  if (detectStructuredRevenueTable(nativeText)) {
    return "native_pdf_table";
  }

  return "documentary_pdf";
}

function pipelineForDetectedSource(
  detected: RevenueDetectedSourceType,
  documentaryHint: boolean,
): RevenuePipelineId {
  if (detected === "spreadsheet") return "spreadsheet";
  if (detected === "image_capture" || detected === "scanned_pdf") return "vision";
  if (detected === "native_pdf_table") return "pdf_structured";
  if (documentaryHint || detected === "documentary_pdf") return "documentary";
  return "vision";
}

/**
 * Selects the best revenue extraction engine from file structure and source hints.
 * Does not run extraction — only routing.
 */
export async function routeRevenueDocument(
  file: File,
  document: LmnpDocument,
): Promise<RevenueRouteDecision> {
  const fileName = document.fileName || file.name;
  const mimeType = file.type || "application/octet-stream";
  const extension = extensionFromFileName(fileName);
  const sourceType = inferRevenusSourceType(document);
  const documentaryHint = isDocumentaryHint(sourceType);

  let detectedSourceType: RevenueDetectedSourceType;
  let selectedPipeline: RevenuePipelineId;

  if (isSpreadsheetFile(file)) {
    detectedSourceType = "spreadsheet";
    selectedPipeline = "spreadsheet";
  } else if (isImageFile(file)) {
    detectedSourceType = "image_capture";
    selectedPipeline = "vision";
  } else if (isPdfFile(file)) {
    detectedSourceType = await classifyPdfSource(file);
    selectedPipeline = pipelineForDetectedSource(detectedSourceType, documentaryHint);
  } else {
    detectedSourceType = documentaryHint ? "documentary_pdf" : "scanned_pdf";
    selectedPipeline = documentaryHint ? "documentary" : "vision";
  }

  const skippedPipelines = ALL_PIPELINES.filter((id) => id !== selectedPipeline);

  const decision: RevenueRouteDecision = {
    fileName,
    mimeType,
    extension,
    detectedSourceType,
    selectedPipeline,
    skippedPipelines,
    sourceType,
  };

  logRevenusRoutingDebug({
    fileName: decision.fileName,
    mimeType: decision.mimeType,
    extension: decision.extension,
    detectedSourceType: decision.detectedSourceType,
    selectedPipeline: decision.selectedPipeline,
    skippedPipelines: decision.skippedPipelines,
    sourceType: decision.sourceType,
  });

  return decision;
}
