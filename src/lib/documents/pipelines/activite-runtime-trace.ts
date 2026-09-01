import type { DocumentExtractor } from "../extractors/extractor.types";
import type { ExtractionResult } from "../types/extraction-result";
import type { DocumentPipelineContext } from "../types/pipeline-context";

export const RUNTIME_OCR_PREVIEW_LENGTH = 2000;

export const INPI_RUNTIME_FOCUS_KEYS = [
  "nom",
  "prenom",
  "siren",
  "siret",
  "activite",
] as const;

export type RuntimeFieldSnapshot = {
  key: string;
  value: unknown;
  confidence?: number;
};

export function countNewlines(text: string): number {
  return (text.match(/\n/g) ?? []).length;
}

export function snapshotExtractionFields(
  fields: ExtractionResult["fields"],
): RuntimeFieldSnapshot[] {
  return fields.map((field) => ({
    key: field.key,
    value: field.value,
    confidence: field.confidence.value,
  }));
}

export function logExtractorResolution(params: {
  runId: string;
  documentType: string;
  extractor: DocumentExtractor | undefined;
  registryEntries: Array<{ id: string; version: string; documentType: string }>;
}): void {
  console.log("[runtime] extractor resolution", {
    runId: params.runId,
    documentType: params.documentType,
    extractorId: params.extractor?.id ?? null,
    extractorVersion: params.extractor?.version ?? null,
    extractorModule: params.extractor?.id === "extractor.inpi" ? "extract-inpi.ts" : null,
    registryEntries: params.registryEntries,
  });
}

export function logOcrStageOutput(params: {
  runId: string;
  rawInputLength: number;
  normalizedLength: number;
  normalizer: string;
  preview: string;
}): void {
  console.log("[runtime] ocr stage output", {
    runId: params.runId,
    rawInputLength: params.rawInputLength,
    normalizedLength: params.normalizedLength,
    normalizedNewlineCount: countNewlines(params.preview),
    normalizer: params.normalizer,
    preview: params.preview,
    truncated: params.normalizer.includes("truncate") ? undefined : params.normalizer,
  });
}

export function logExtractInpiOcrInput(params: {
  documentId: string;
  pipelineRawTextLength: number;
  pipelineRawTextPreview: string;
  extractorNormalizedLength: number;
  extractorNormalizedPreview: string;
  contextualReceivesNormalizedText: boolean;
}): void {
  console.log("[runtime] extract-inpi ocr input", {
    documentId: params.documentId,
    pipelineRawTextLength: params.pipelineRawTextLength,
    pipelineNewlineCount: countNewlines(params.pipelineRawTextPreview),
    pipelineRawTextPreview: params.pipelineRawTextPreview,
    extractorNormalizedLength: params.extractorNormalizedLength,
    extractorNormalizedNewlineCount: countNewlines(params.extractorNormalizedPreview),
    extractorNormalizedPreview: params.extractorNormalizedPreview,
    contextualReceivesNormalizedText: params.contextualReceivesNormalizedText,
    extractorNormalizer: "inpi-ocr-normalize.ts",
    pipelineNormalizer: "documents/normalizers/normalize-ocr-text.ts",
  });
}

export function logContextualExtractorEntered(params: {
  fieldName?: string;
  textLength: number;
  lineCount: number;
}): void {
  console.log("[runtime] contextual extractor entered", params);
}

export function logFallbackExtractorEntered(params: {
  fieldName?: string;
  contextualMiss: boolean;
}): void {
  console.log("[runtime] fallback extractor entered", params);
}

export function logSemanticFallbackEntered(params: {
  field: "siren" | "siret" | "activite";
  reason: string;
}): void {
  console.log("[runtime] semantic fallback entered", params);
}

export function logExtractionFieldsPayload(params: {
  documentId: string;
  extractorId: string;
  extractorVersion: string;
  fields: RuntimeFieldSnapshot[];
  data: Record<string, unknown>;
  focusFields: Record<string, unknown>;
}): void {
  console.log("[runtime] extraction.fields payload", params);
}

export function logMapPipelineInput(params: {
  runId: string;
  documentType: string;
  extractionFields: RuntimeFieldSnapshot[];
  extractionData: Record<string, unknown>;
  focusExtraction: Record<string, unknown>;
  validationValid: boolean | null;
  validationErrors: Array<{ fieldKey: string; code: string; message: string }>;
}): void {
  console.log("[runtime] map-pipeline input", params);
}

export function logMapPipelineOutput(params: {
  runId: string;
  mappedKeys: string[];
  missingFocusKeys: string[];
  propagatedFieldCount: number;
  formFocusValues: Record<string, unknown>;
}): void {
  console.log("[runtime] map-pipeline output", params);
}

export function logValidationStageReadOnly(params: {
  runId: string;
  fieldKeysBefore: string[];
  fieldKeysAfter: string[];
  valid: boolean;
  fieldErrors: Array<{ fieldKey: string; code: string }>;
  mutatesExtraction: false;
}): void {
  console.log("[runtime] validation stage", params);
}

export function logLearningStageReadOnly(params: {
  runId: string;
  action: "skipped" | "case_created";
  mutatesExtraction: false;
  reason?: string;
  caseId?: string;
}): void {
  console.log("[runtime] learning stage", params);
}

export function logUiPropagationStage(params: {
  runId: string;
  decisions: Array<{ field: string; decision: string; reason?: string }>;
  mutatesExtraction: false;
}): void {
  console.log("[runtime] ui-propagation stage", params);
}

export function logEndToEndTrace(params: {
  runId: string;
  documentId: string;
  ocr: {
    length: number;
    newlineCount: number;
    preview: string;
  };
  extractionCandidates: RuntimeFieldSnapshot[];
  validatedExtraction: {
    valid: boolean | null;
    fieldErrors: Array<{ fieldKey: string; code: string }>;
    focusFields: Record<string, unknown>;
  };
  propagatedFields: Record<string, unknown>;
  finalUiValues: Record<string, unknown>;
}): void {
  console.log("[runtime] end-to-end trace", params);
}

export function buildFocusFieldMap(
  data: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!data) return out;
  for (const key of INPI_RUNTIME_FOCUS_KEYS) {
    if (key in data) out[key] = data[key];
  }
  return out;
}

export function buildActiviteFormFocusValues(formValues: {
  firstName?: string;
  lastName?: string;
  siren?: string;
  siret?: string;
  activityType?: string;
}): Record<string, unknown> {
  return {
    firstName: formValues.firstName,
    lastName: formValues.lastName,
    siren: formValues.siren,
    siret: formValues.siret,
    activityType: formValues.activityType,
  };
}

export function missingFocusMappedKeys(
  mappedKeys: string[],
): string[] {
  const expected = ["firstName", "lastName", "siren", "siret", "activityType"];
  return expected.filter((key) => !mappedKeys.includes(key));
}

export function logActivitePipelineComplete(
  ctx: DocumentPipelineContext,
  ui: {
    formValues: {
      firstName?: string;
      lastName?: string;
      siren?: string;
      siret?: string;
      activityType?: string;
    };
  },
): void {
  const ocrText = ctx.ocr?.rawText ?? "";
  const extraction = ctx.extraction;
  const focusExtraction = buildFocusFieldMap(
    extraction?.data as Record<string, unknown> | undefined,
  );

  logEndToEndTrace({
    runId: ctx.runId,
    documentId: ctx.documentId,
    ocr: {
      length: ocrText.length,
      newlineCount: countNewlines(ocrText),
      preview: ocrText.slice(0, RUNTIME_OCR_PREVIEW_LENGTH),
    },
    extractionCandidates: snapshotExtractionFields(extraction?.fields ?? []),
    validatedExtraction: {
      valid: ctx.validation?.valid ?? null,
      fieldErrors: (ctx.validation?.fieldErrors ?? []).map((e) => ({
        fieldKey: e.fieldKey,
        code: e.code,
      })),
      focusFields: focusExtraction,
    },
    propagatedFields: ui.formValues,
    finalUiValues: buildActiviteFormFocusValues(ui.formValues),
  });
}
