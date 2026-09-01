import type { RevenueRawLine } from "@/lib/lmnp/types";
import type { RevenueSupervisionStatus } from "@/lib/lmnp/types/revenue-supervision";

export type RevenuePipelineId =
  | "spreadsheet"
  | "pdf_structured"
  | "vision"
  | "documentary";

export type RevenueDetectedSourceType =
  | "spreadsheet"
  | "native_pdf_table"
  | "scanned_pdf"
  | "image_capture"
  | "documentary_pdf";

export type RevenuePipelineRunResult = {
  pipelineId: RevenuePipelineId;
  detectedSourceType: RevenueDetectedSourceType;
  documentId: string;
  fileName: string;
  rawText: string;
  ocrProvider: string;
  ocrStrategy?: string;
  ocrQualityScore?: number;
  lines: RevenueRawLine[];
  success: boolean;
  ocrFailure?: boolean;
  error?: string;
  supervision?: RevenueSupervisionStatus;
  skippedPipelines?: RevenuePipelineId[];
};

export type RevenuePipelineContext = {
  file: File;
  documentId: string;
  fileName: string;
  fiscalYear: number;
  sourceType: import("@/lib/lmnp/types").RevenueRawLineSourceType;
};
