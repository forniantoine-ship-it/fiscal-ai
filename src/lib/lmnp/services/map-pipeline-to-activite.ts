import type {
  ActiviteFieldKey,
  ActiviteFormValues,
} from "@/components/lmnp/activite/ActiviteProfileFields";
import { profileToFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";
import type { InpiExtractedData } from "@/lib/documents/extractors/extract-inpi";
import type { P0iExtractedData } from "@/lib/documents/extractors/extract-p0i";
import type { DocumentPipelineContext } from "@/lib/documents/types/pipeline-context";
import type { ConfidenceBand } from "@/lib/documents/types/confidence-score";
import {
  buildActiviteFormFocusValues,
  buildFocusFieldMap,
  logActivitePipelineComplete,
  logMapPipelineInput,
  logMapPipelineOutput,
  logUiPropagationStage,
  missingFocusMappedKeys,
  snapshotExtractionFields,
} from "@/lib/documents/pipelines/activite-runtime-trace";
import { profileFromDraft } from "@/lib/lmnp/services/inpi-profile";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import {
  INPI_MANUAL_WORKFLOW_FIELDS,
  propagateInpiExtractionToUi,
  shouldMarkPipelineFailed,
  shouldShowUnrecognizedMessage,
} from "./activite-ui-propagation";

export type ActivitePipelineUiState = {
  formValues: ActiviteFormValues;
  uncertainFields: ActiviteFieldKey[];
  showUnrecognizedMessage: boolean;
  showManualCompletionMessage: boolean;
  confidenceBand: ConfidenceBand;
  pipelineFailed: boolean;
  propagatedFieldCount: number;
};

function mapP0iToForm(_data: P0iExtractedData): Partial<ActiviteFormValues> {
  return {};
}

function hasMissingManualFields(values: ActiviteFormValues): boolean {
  return INPI_MANUAL_WORKFLOW_FIELDS.some((key) => {
    const value = values[key as keyof ActiviteFormValues];
    return typeof value !== "string" || !value.trim();
  });
}

function resolveOverallBand(
  extractionBand: ConfidenceBand,
  classBand: ConfidenceBand,
  propagatedCount: number,
): ConfidenceBand {
  if (propagatedCount > 0) {
    if (extractionBand === "low" && propagatedCount >= 2) return "medium";
    if (propagatedCount >= 3 && extractionBand !== "low") return "high";
    return extractionBand === "unknown" ? "medium" : extractionBand;
  }
  if (extractionBand === "low" || classBand === "low") return "low";
  if (extractionBand === "medium" || classBand === "medium") return "medium";
  return "high";
}

/**
 * Maps pipeline output to activité form state.
 * Extraction validity (validation) is separate from UI autofill eligibility.
 */
export function mapPipelineToActiviteUi(
  ctx: DocumentPipelineContext,
  workspace: PersistedWorkspace,
): ActivitePipelineUiState {
  const base = profileToFormValues(profileFromDraft(workspace));

  const classification = ctx.classification;
  const extraction = ctx.extraction;
  const docType = classification?.documentType ?? "unknown";
  const classBand = classification?.confidence.band ?? "unknown";

  if (docType === "unknown") {
    return {
      formValues: base,
      uncertainFields: [],
      showUnrecognizedMessage: true,
      showManualCompletionMessage: false,
      confidenceBand: classBand,
      pipelineFailed: true,
      propagatedFieldCount: 0,
    };
  }

  let formValues: ActiviteFormValues = { ...base };
  let uncertainFields: ActiviteFieldKey[] = [];
  let propagatedFieldCount = 0;

  if (docType === "inpi" && extraction) {
    const inpiData = extraction.data as InpiExtractedData;
    const draft = workspace.declarationDraft;

    logMapPipelineInput({
      runId: ctx.runId,
      documentType: docType,
      extractionFields: snapshotExtractionFields(extraction.fields),
      extractionData: inpiData as Record<string, unknown>,
      focusExtraction: buildFocusFieldMap(inpiData as Record<string, unknown>),
      validationValid: ctx.validation?.valid ?? null,
      validationErrors: (ctx.validation?.fieldErrors ?? []).map((e) => ({
        fieldKey: e.fieldKey,
        code: e.code,
        message: e.message,
      })),
    });

    const propagation = propagateInpiExtractionToUi(
      inpiData,
      extraction.fields,
      ctx.validation,
      base,
    );

    logUiPropagationStage({
      runId: ctx.runId,
      decisions: propagation.traceDecisions,
      mutatesExtraction: false,
    });

    propagatedFieldCount = propagation.propagatedFieldCount;
    uncertainFields = [
      ...propagation.uncertainFields,
      ...INPI_MANUAL_WORKFLOW_FIELDS,
    ];

    formValues = {
      ...base,
      ...propagation.values,
    };

    const extractionBand = extraction.confidence.band;
    const overallBand = resolveOverallBand(extractionBand, classBand, propagatedFieldCount);

    console.log("[ui-propagation] summary", {
      propagatedFieldCount,
      suggestionCount: propagation.suggestionCount,
      rejectedCount: propagation.rejectedCount,
      validationValid: ctx.validation?.valid ?? null,
      validationErrors: ctx.validation?.fieldErrors ?? [],
      uncertainFields,
    });

    const mappedKeys = Object.keys(propagation.values);
    logMapPipelineOutput({
      runId: ctx.runId,
      mappedKeys,
      missingFocusKeys: missingFocusMappedKeys(mappedKeys),
      propagatedFieldCount,
      formFocusValues: buildActiviteFormFocusValues(formValues),
    });

    const uiState: ActivitePipelineUiState = {
      formValues,
      uncertainFields: [...new Set(uncertainFields)],
      showUnrecognizedMessage: shouldShowUnrecognizedMessage({
        classificationBand: classBand,
        propagatedFieldCount,
        extractedFieldCount: extraction.fields.length,
      }),
      showManualCompletionMessage: hasMissingManualFields(formValues),
      confidenceBand: overallBand,
      pipelineFailed: shouldMarkPipelineFailed({
        propagatedFieldCount,
        classificationDocumentType: docType,
      }),
      propagatedFieldCount,
    };

    logActivitePipelineComplete(ctx, uiState);

    return uiState;
  }

  if (docType === "p0i" && extraction) {
    const extracted = mapP0iToForm(extraction.data as P0iExtractedData);
    formValues = {
      ...base,
      ...Object.fromEntries(
        Object.entries(extracted).filter(([, v]) => v !== undefined && v !== ""),
      ),
    };
    propagatedFieldCount = Object.keys(extracted).length;
  }

  const extractionBand = extraction?.confidence.band ?? classBand;
  const overallBand = resolveOverallBand(extractionBand, classBand, propagatedFieldCount);

  return {
    formValues,
    uncertainFields: [...new Set(uncertainFields)],
    showUnrecognizedMessage: shouldShowUnrecognizedMessage({
      classificationBand: classBand,
      propagatedFieldCount,
      extractedFieldCount: extraction?.fields.length ?? 0,
    }),
    showManualCompletionMessage: false,
    confidenceBand: overallBand,
    pipelineFailed: shouldMarkPipelineFailed({
      propagatedFieldCount,
      classificationDocumentType: docType,
    }),
    propagatedFieldCount,
  };
}
