"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { ActiviteAiProcessing } from "@/components/lmnp/activite/ActiviteAiProcessing";
import {
  DOCUMENT_WORKFLOW_CARD_STYLE,
} from "@/components/lmnp/documents/document-workflow-shared";
import { LogementHero } from "@/components/lmnp/logement/LogementHero";
import {
  LogementProfileFields,
  type LogementFieldKey,
  type LogementFormValues,
} from "@/components/lmnp/logement/LogementProfileFields";
import { ConfiguredDossierCard } from "@/components/lmnp/shared/ConfiguredDossierCard";
import { useFeedback } from "@/components/lmnp/shared/FeedbackProvider";
import {
  WorkflowPageBackLink,
  WorkflowProgressionActions,
} from "@/components/lmnp/shared/WorkflowProgressionActions";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { getDocumentJourneyStep } from "@/lib/lmnp/constants/document-journey";
import { uploadFilesForUser } from "@/lib/uploadDocument";
import { supabase } from "@/lib/supabase";
import {
  formValuesToProperty,
  isLogementDocument,
  isLogementProfileIncomplete,
  MOCK_LOGEMENT_BACKGROUND,
  suggestsMultipleProperties,
} from "@/lib/lmnp/services/logement-profile";
import { ingestExtractionIntoStore } from "@/lib/documents/cross-tunnel-prefill";
import {
  lockLogementFormFieldEdits,
  readGovernedFieldStore,
} from "@/lib/lmnp/services/governed-field-prefill";
import {
  logementPrefillUncertainFields,
  mergeLogementUserValidatedFields,
  prefillLogementFormFromGpt,
  type LogementPrefillFieldKey,
  type LogementUserValidatedFields,
} from "@/lib/lmnp/services/logement-gpt-ui-prefill";
import {
  logLogementDisplayResolution,
  logLogementUploadTrace,
  logLogementWorkspaceSnapshot,
  type LogementDisplaySource,
} from "@/lib/lmnp/services/logement-extraction-debug";
import { readGovernedValuesForTunnel } from "@/lib/documents/cross-tunnel-prefill";
import {
  hydrateLogementUiFromWorkspace,
  logementWorkspaceFormPatch,
} from "@/lib/lmnp/services/passive-form-restore";
import { useTunnelHydration } from "@/lib/lmnp/hydration";
import { buildLogementConfiguredSummary } from "@/lib/lmnp/services/configured-dossier-summaries";
import {
  runLogementDocumentPipeline,
  type LogementGptPipelineResult,
} from "@/lib/lmnp/services/logement-document-pipeline";
import { useLmnp } from "@/lib/lmnp/store";
import type { DeclarationDraft, LmnpDocument } from "@/lib/lmnp/types";
import type { TunnelStepProps } from "@/components/lmnp/documents/frozen-tunnel-step";
import { logVisualMutation } from "@/components/lmnp/documents/visual-debug";
import {
  LOGEMENT_FADE_IN,
  LOGEMENT_STATIC_UI,
  LogementStaticRoot,
  logementEffectiveVisibleSections,
} from "@/components/lmnp/logement/logement-visual-isolation";

const SECTION_REVEAL_DELAYS_MS = [0, 400];
const LOGEMENT_UPLOAD_CATEGORY = getDocumentJourneyStep("logement").category;

function resolveLogementDocument(
  documents: LmnpDocument[],
  logementDocumentId?: string,
): LmnpDocument | undefined {
  if (logementDocumentId) {
    const linked = documents.find((doc) => doc.id === logementDocumentId);
    if (linked) return linked;
  }

  const sorted = [...documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return sorted.find((doc) => isLogementDocument(doc, logementDocumentId));
}

function countLogementDocuments(documents: LmnpDocument[], logementDocumentId?: string): number {
  return documents.filter((doc) => isLogementDocument(doc, logementDocumentId)).length;
}

type InitialLogementState = {
  formValues: LogementFormValues;
  aiAnimationDone: boolean;
  visibleSections: number;
  skipReveal: boolean;
};

function createInitialLogementState(workspace: Parameters<typeof hydrateLogementUiFromWorkspace>[0]): InitialLogementState {
  const hydrated = hydrateLogementUiFromWorkspace(workspace);
  return {
    formValues: hydrated.formValues,
    aiAnimationDone: hydrated.workflowComplete,
    visibleSections: hydrated.workflowComplete ? 2 : 0,
    skipReveal: hydrated.workflowComplete,
  };
}

function isLogementFormEmpty(values: LogementFormValues): boolean {
  return (
    !values.address?.trim() &&
    !values.city?.trim() &&
    !values.postalCode?.trim() &&
    !values.acquisitionDate?.trim() &&
    !values.surface?.trim()
  );
}

function resolveDisplayedLogementFormValues(
  local: LogementFormValues,
  persisted: LogementFormValues | undefined,
  pending: LogementFormValues | null,
): LogementFormValues {
  return resolveDisplayedLogementFormValuesWithSource(local, persisted, pending).values;
}

function resolveDisplayedLogementFormValuesWithSource(
  local: LogementFormValues,
  persisted: LogementFormValues | undefined,
  pending: LogementFormValues | null,
): { values: LogementFormValues; source: LogementDisplaySource } {
  if (!isLogementFormEmpty(local)) {
    return { values: local, source: "localState" };
  }
  if (pending && !isLogementFormEmpty(pending)) {
    return { values: pending, source: "pendingPrefill" };
  }
  if (persisted && !isLogementFormEmpty(persisted)) {
    return { values: persisted, source: "workspaceSnapshot" };
  }
  return { values: local, source: "empty" };
}

function snapshotGovernedFieldsForDebug(draft?: DeclarationDraft) {
  const store = readGovernedFieldStore(draft);
  return {
    logement: readGovernedValuesForTunnel(store, "logement"),
    credit: readGovernedValuesForTunnel(store, "credit"),
  };
}

export function LogementDocumentStep({ isActive = true }: TunnelStepProps) {
  const { workspace, dispatch, getFile } = useLmnp();
  const { showSuccess, showInfo } = useFeedback();
  const {
    markExecution,
    clearExecution,
    endPassiveHydration,
    shouldRunExtraction,
    shouldApplyPrefill,
  } = useTunnelHydration("logement");
  const analyzingRef = useRef(false);
  const gptSessionRef = useRef<LogementGptPipelineResult | null>(null);
  const pendingFormPrefillRef = useRef<LogementFormValues | null>(null);
  const pendingUncertainFieldsRef = useRef<LogementFieldKey[]>([]);
  const allowPrefillAtExecutionStartRef = useRef(false);
  const prefillAppliedRef = useRef(false);
  const prevShowExtractionFormRef = useRef(false);
  const pendingUploadRef = useRef(false);
  const executionPendingRef = useRef(false);
  const passiveSyncedRef = useRef(false);
  const initialStateRef = useRef<InitialLogementState | null>(null);
  const [isExecutionRunning, setIsExecutionRunning] = useState(false);

  function initialState(): InitialLogementState {
    if (!initialStateRef.current) {
      initialStateRef.current = createInitialLogementState(workspace);
    }
    return initialStateRef.current;
  }

  const skipRevealAnimationRef = useRef(initialState().skipReveal);
  const visibleSectionsRef = useRef(initialState().visibleSections);

  const draft = workspace.declarationDraft;
  const logementDoc = useMemo(
    () => resolveLogementDocument(workspace.documents, draft?.logementDocumentId),
    [workspace.documents, draft?.logementDocumentId],
  );
  const uploadedCount = useMemo(
    () => countLogementDocuments(workspace.documents, draft?.logementDocumentId),
    [workspace.documents, draft?.logementDocumentId],
  );

  const confirmed = Boolean(draft?.logementConfirmedAt);

  const [hasUploaded, setHasUploaded] = useState(
    () => Boolean(draft?.logementDocumentId || draft?.logementConfirmedAt),
  );
  const [aiAnimationDone, setAiAnimationDone] = useState(() => initialState().aiAnimationDone);
  const [visibleSections, setVisibleSections] = useState(() => initialState().visibleSections);
  const [uncertainFields, setUncertainFields] = useState<LogementFieldKey[]>([]);
  const [multiPropertyDetected, setMultiPropertyDetected] = useState(false);
  const [validatedSuccess, setValidatedSuccess] = useState(() => confirmed);
  const [isEditing, setIsEditing] = useState(false);
  const [formValues, setFormValues] = useState<LogementFormValues>(() => initialState().formValues);
  const [userValidatedFields, setUserValidatedFields] = useState<LogementUserValidatedFields>({});

  visibleSectionsRef.current = visibleSections;

  const formValuesRef = useRef(formValues);
  useEffect(() => {
    const prev = formValuesRef.current;
    if (prev !== formValues) {
      console.log("[form-instance-change]", {
        referenceChanged: true,
        valuesEqual: JSON.stringify(prev) === JSON.stringify(formValues),
        note: "Logement uses useState — no react-hook-form in codebase",
      });
    }
    formValuesRef.current = formValues;
  }, [formValues]);

  const isFailed =
    logementDoc?.status === "failed" && !aiAnimationDone && !multiPropertyDetected && !isExecutionRunning;
  const showConfiguredCard = (validatedSuccess || confirmed) && !isEditing;
  const showExtractionForm =
    aiAnimationDone &&
    !isExecutionRunning &&
    !multiPropertyDetected &&
    !showConfiguredCard;

  const displayedFormValues = useMemo(
    () =>
      resolveDisplayedLogementFormValues(
        formValues,
        draft?.logementWorkspaceForm,
        pendingFormPrefillRef.current,
      ),
    [formValues, draft?.logementWorkspaceForm, showExtractionForm],
  );

  const activeDocumentId = logementDoc?.id;

  useEffect(() => {
    if (!showExtractionForm) return;

    const resolution = resolveDisplayedLogementFormValuesWithSource(
      formValues,
      draft?.logementWorkspaceForm,
      pendingFormPrefillRef.current,
    );

    logLogementDisplayResolution({
      documentId: activeDocumentId,
      source: resolution.source,
      localFormValues: formValues,
      pendingFormPrefill: pendingFormPrefillRef.current,
      workspaceSnapshot: draft?.logementWorkspaceForm,
      displayedFormValues: resolution.values,
    });
  }, [
    showExtractionForm,
    formValues,
    draft?.logementWorkspaceForm,
    activeDocumentId,
    displayedFormValues,
  ]);

  const prevDerivedVisualRef = useRef({
    isExecutionRunning,
    isFailed,
    showExtractionForm,
    showConfiguredCard,
  });

  useEffect(() => {
    const prev = prevDerivedVisualRef.current;
    if (prev.isExecutionRunning !== isExecutionRunning) {
      logVisualMutation(
        "loading-state-change",
        "derived.isExecutionRunning",
        prev.isExecutionRunning,
        isExecutionRunning,
      );
    }
    if (prev.isFailed !== isFailed) {
      logVisualMutation("loading-state-change", "derived.isFailed", prev.isFailed, isFailed);
    }
    if (prev.showExtractionForm !== showExtractionForm) {
      logVisualMutation(
        "visual-reset",
        "derived.showExtractionForm",
        prev.showExtractionForm,
        showExtractionForm,
        {
          aiAnimationDone,
          confirmed,
          showConfiguredCard,
          multiPropertyDetected,
        },
      );
    }
    if (prev.showConfiguredCard !== showConfiguredCard) {
      logVisualMutation(
        "visual-reset",
        "derived.showConfiguredCard",
        prev.showConfiguredCard,
        showConfiguredCard,
      );
    }
    prevDerivedVisualRef.current = {
      isExecutionRunning,
      isFailed,
      showExtractionForm,
      showConfiguredCard,
    };
  }, [isExecutionRunning, isFailed, showExtractionForm, showConfiguredCard, aiAnimationDone, confirmed]);

  const prevWorkspaceRef = useRef(workspace);
  useEffect(() => {
    if (prevWorkspaceRef.current !== workspace) {
      logVisualMutation("autosave-rerender", "useLmnp.workspace", "stable", "new-reference", {
        autosaveDraftChanged:
          prevWorkspaceRef.current.declarationDraft !== workspace.declarationDraft,
      });
    }
    prevWorkspaceRef.current = workspace;
  }, [workspace]);

  const applyPipelineResult = useCallback(
    (result: LogementGptPipelineResult, options: { allowPrefill: boolean }) => {
      gptSessionRef.current = result;

      console.log("[logement-prefill-guard]", {
        allowPrefill: options.allowPrefill,
        success: result.extraction.success,
        extractedKeys: Object.keys(result.extraction.extraction),
      });

      if (!options.allowPrefill) {
        console.log("[logement-prefill-skipped]", { reason: "passive_or_no_execution" });
        setAiAnimationDone(true);
        clearExecution();
        return;
      }

      console.log("[gpt extraction complete]", {
        documentId: result.documentId,
        success: result.extraction.success,
        fields: Object.keys(result.extraction.extraction),
        error: result.extraction.error ?? null,
      });

      logLogementUploadTrace({
        documentId: result.documentId,
        fileName: result.fileName,
        ocr: result.ocrDebug,
        extraction: result.extraction,
      });

      if (result.extraction.debug) {
        console.log("[logement-debug-gpt-raw]", {
          documentId: result.documentId,
          rawGptJson: result.extraction.debug.rawGptJson,
        });
        console.log("[logement-debug-normalized]", {
          documentId: result.documentId,
          normalized: result.extraction.debug.normalized,
        });
      }

      const governedBefore = snapshotGovernedFieldsForDebug(workspace.declarationDraft);
      logLogementWorkspaceSnapshot({
        documentId: result.documentId,
        phase: "before_prefill_queue",
        logementWorkspaceForm: workspace.declarationDraft?.logementWorkspaceForm,
        pendingFormPrefill: pendingFormPrefillRef.current,
        localFormValues: formValuesRef.current,
        propertyBackgroundExtraction: workspace.declarationDraft?.propertyBackgroundExtraction,
        governedLogementFields: governedBefore.logement,
        governedCreditFields: governedBefore.credit,
      });

      dispatch({
        type: "DOCUMENT_SET_STATUS",
        documentId: result.documentId,
        status: result.extraction.success ? "analyzed" : "failed",
      });

      if (result.extraction.success) {
        prefillAppliedRef.current = false;
        const prefill = prefillLogementFormFromGpt({
          extraction: result.extraction.extraction,
          currentValues: formValuesRef.current,
          userValidatedFields,
          currentBackground: workspace.declarationDraft?.propertyBackgroundExtraction,
        });

        pendingFormPrefillRef.current = prefill.nextValues;
        pendingUncertainFieldsRef.current = logementPrefillUncertainFields(prefill.changedFields);
        console.log("[prefill queued]", {
          nextValues: prefill.nextValues,
          changedFields: prefill.changedFields,
        });

        const currentStore = readGovernedFieldStore(workspace.declarationDraft);
        const { store: nextStore } = ingestExtractionIntoStore({
          store: currentStore,
          sourceTunnel: "logement",
          sourceDocument: "acte_notarie",
          extractedBy: "gpt",
          payload: prefill.governedExtractions.creditPayload,
        });

        const backgroundExtraction = {
          ...(workspace.declarationDraft?.propertyBackgroundExtraction ?? {}),
          ...prefill.governedExtractions.backgroundExtraction,
        };

        dispatch({
          type: "DECLARATION_PATCH_DRAFT",
          patch: {
            ...logementWorkspaceFormPatch(prefill.nextValues),
            governedFields: nextStore,
            ...(Object.keys(prefill.governedExtractions.backgroundExtraction).length > 0
              ? { propertyBackgroundExtraction: backgroundExtraction }
              : {}),
          },
        });

        const governedAfter = snapshotGovernedFieldsForDebug({
          ...workspace.declarationDraft,
          logementWorkspaceForm: prefill.nextValues,
          governedFields: nextStore,
          ...(Object.keys(prefill.governedExtractions.backgroundExtraction).length > 0
            ? { propertyBackgroundExtraction: backgroundExtraction }
            : {}),
        });

        logLogementWorkspaceSnapshot({
          documentId: result.documentId,
          phase: "after_prefill_queue",
          logementWorkspaceForm: prefill.nextValues,
          pendingFormPrefill: pendingFormPrefillRef.current,
          localFormValues: formValuesRef.current,
          propertyBackgroundExtraction: backgroundExtraction,
          governedLogementFields: governedAfter.logement,
          governedCreditFields: governedAfter.credit,
          prefillChangedFields: prefill.changedFields,
          gptNormalized: result.extraction.extraction,
        });
      }

      setAiAnimationDone(true);
      clearExecution();
    },
    [
      dispatch,
      clearExecution,
      userValidatedFields,
      workspace.declarationDraft?.propertyBackgroundExtraction,
    ],
  );

  const runAnalysis = useCallback(
    async (documentId: string) => {
      if (analyzingRef.current) return;
      const document = workspace.documents.find((doc) => doc.id === documentId);
      if (!document) return;

      analyzingRef.current = true;
      allowPrefillAtExecutionStartRef.current = shouldApplyPrefill();

      console.log("[logement-analysis-start]", {
        documentId,
        allowPrefillAtExecutionStart: allowPrefillAtExecutionStartRef.current,
      });

      dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "processing" });

      try {
        const result = await runLogementDocumentPipeline({
          document,
          getFile,
          fiscalYear: workspace.fiscalYear.year,
        });
        applyPipelineResult(result, {
          allowPrefill: allowPrefillAtExecutionStartRef.current,
        });
      } catch (err) {
        console.error("[LogementDocumentStep] GPT pipeline failed", err);
        dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "failed" });
        setAiAnimationDone(true);
        clearExecution();
      } finally {
        analyzingRef.current = false;
        setIsExecutionRunning(false);
      }
    },
    [
      workspace.documents,
      workspace.fiscalYear.year,
      getFile,
      dispatch,
      applyPipelineResult,
      clearExecution,
    ],
  );

  const handleAiAnimationComplete = useCallback(() => {
    logVisualMutation("animation-replay", "handleAiAnimationComplete", aiAnimationDone, true);
    setAiAnimationDone(true);
    setIsExecutionRunning(false);
  }, [aiAnimationDone]);

  useEffect(() => {
    if (passiveSyncedRef.current) return;
    passiveSyncedRef.current = true;

    const hydrated = hydrateLogementUiFromWorkspace(workspace);

    if (hydrated.hasPersistedData) {
      logVisualMutation("visual-reset", "passiveSync.setHasUploaded", hasUploaded, true);
      setHasUploaded(true);
    }

    if (!isLogementFormEmpty(hydrated.formValues) && isLogementFormEmpty(formValuesRef.current)) {
      console.log("[logement-form-restore-from-draft]", { source: "passive_hydration" });
      prefillAppliedRef.current = true;
      setFormValues(hydrated.formValues);
    }

    if (hydrated.workflowComplete) {
      logVisualMutation("animation-replay", "passiveSync.setAiAnimationDone", aiAnimationDone, true);
      setAiAnimationDone(true);
      logVisualMutation(
        "visible-sections-change",
        "passiveSync.setVisibleSections",
        visibleSections,
        2,
      );
      setVisibleSections(2);
      skipRevealAnimationRef.current = true;
    }

    endPassiveHydration();
  }, [endPassiveHydration, workspace]);

  useLayoutEffect(() => {
    const persisted = draft?.logementWorkspaceForm;
    if (!persisted || isLogementFormEmpty(persisted)) return;
    if (!isLogementFormEmpty(formValuesRef.current)) return;

    console.log("[logement-form-restore-from-draft]", { source: "persisted_snapshot" });
    prefillAppliedRef.current = true;
    setFormValues(persisted);
  }, [draft?.logementWorkspaceForm]);

  useLayoutEffect(() => {
    const wasVisible = prevShowExtractionFormRef.current;
    prevShowExtractionFormRef.current = showExtractionForm;

    if (!showExtractionForm) return;

    if (!wasVisible) {
      console.log("[showExtractionForm true]");
    }

    if (prefillAppliedRef.current) return;

    const pending = pendingFormPrefillRef.current;
    const persisted = draft?.logementWorkspaceForm;
    const source =
      pending && !isLogementFormEmpty(pending)
        ? pending
        : persisted && !isLogementFormEmpty(persisted)
          ? persisted
          : null;

    if (!source) return;
    if (!isLogementFormEmpty(formValuesRef.current)) {
      prefillAppliedRef.current = true;
      pendingFormPrefillRef.current = null;
      return;
    }

    console.log("[prefill applied]", {
      source: pending && !isLogementFormEmpty(pending) ? "pending" : "draft",
      values: source,
    });
    prefillAppliedRef.current = true;
    pendingFormPrefillRef.current = null;
    setFormValues(source);
    if (pendingUncertainFieldsRef.current.length > 0) {
      setUncertainFields(pendingUncertainFieldsRef.current);
    }
  }, [showExtractionForm, draft?.logementWorkspaceForm]);

  useEffect(() => {
    if (LOGEMENT_STATIC_UI) return;
    if (!showExtractionForm) {
      return;
    }

    if (skipRevealAnimationRef.current) {
      logVisualMutation(
        "visible-sections-change",
        "showExtractionForm.skipReveal",
        visibleSectionsRef.current,
        2,
      );
      setVisibleSections(2);
      skipRevealAnimationRef.current = false;
      return;
    }

    if (visibleSectionsRef.current >= 2) {
      logVisualMutation(
        "animation-replay",
        "showExtractionForm.alreadyRevealed",
        visibleSectionsRef.current,
        visibleSectionsRef.current,
        { skipped: true },
      );
      return;
    }

    logVisualMutation(
      "animation-replay",
      "showExtractionForm.revealSequence",
      visibleSectionsRef.current,
      "starting",
    );
    const timers = SECTION_REVEAL_DELAYS_MS.map((delay, index) =>
      window.setTimeout(() => {
        const next = index + 1;
        logVisualMutation(
          "visible-sections-change",
          "showExtractionForm.revealTimer",
          visibleSectionsRef.current,
          next,
          { delayMs: delay },
        );
        setVisibleSections(next);
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [showExtractionForm]);

  useEffect(() => {
    if (!confirmed) return;
    logVisualMutation("visual-reset", "confirmedEffect", { validatedSuccess, isEditing }, "confirmed");
    setHasUploaded(true);
    setValidatedSuccess(true);
    setIsEditing(false);
    logVisualMutation("animation-replay", "confirmedEffect.setAiAnimationDone", aiAnimationDone, true);
    setAiAnimationDone(true);
    logVisualMutation(
      "visible-sections-change",
      "confirmedEffect.setVisibleSections",
      visibleSectionsRef.current,
      2,
    );
    setVisibleSections(2);
    setUncertainFields([]);
  }, [confirmed, validatedSuccess, isEditing, aiAnimationDone]);

  useEffect(() => {
    if (logementDoc?.status !== "failed" || !isExecutionRunning) return;
    setIsExecutionRunning(false);
  }, [logementDoc?.status, isExecutionRunning]);

  useEffect(() => {
    if (!logementDoc || multiPropertyDetected) return;
    if (suggestsMultipleProperties(logementDoc.fileName)) {
      setMultiPropertyDetected(true);
    }
  }, [logementDoc, multiPropertyDetected]);

  useEffect(() => {
    if (!pendingUploadRef.current || !logementDoc) return;
    pendingUploadRef.current = false;
    if (draft?.logementDocumentId !== logementDoc.id) {
      dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { logementDocumentId: logementDoc.id } });
    }
  }, [logementDoc, draft?.logementDocumentId, dispatch]);

  useEffect(() => {
    if (
      !logementDoc ||
      logementDoc.status !== "uploaded" ||
      analyzingRef.current ||
      multiPropertyDetected
    ) {
      return;
    }
    if (!executionPendingRef.current) {
      console.log("[logement-analysis-blocked]", { reason: "no_execution_pending" });
      return;
    }
    if (!shouldRunExtraction()) {
      console.log("[logement-analysis-blocked]", { reason: "passive_hydration" });
      return;
    }

    executionPendingRef.current = false;
    void runAnalysis(logementDoc.id);
  }, [logementDoc?.id, logementDoc?.status, runAnalysis, multiPropertyDetected, shouldRunExtraction]);

  async function handleUpload(files: File[]) {
    if (!files.length) return;

    const multiProperty = files.some((file) => suggestsMultipleProperties(file.name));
    if (multiProperty) {
      console.log("[uploadDocument] multi-property detected");
      console.log("[uploadDocument] continuing with persistence");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error("[LogementDocumentStep] upload aborted: user not authenticated");
      alert("Utilisateur non connecté");
      return;
    }

    const { files: uploadedFiles } = await uploadFilesForUser(files, user.id);

    if (uploadedFiles.length === 0) {
      console.error("[LogementDocumentStep] upload failed: no files stored in Supabase");
      return;
    }

    setMultiPropertyDetected(multiProperty);
    logVisualMutation("visual-reset", "handleUpload.setHasUploaded", hasUploaded, true);
    setHasUploaded(true);

    dispatch({
      type: "UPLOAD_DOCUMENTS",
      files: uploadedFiles.map((file) => ({ file, category: LOGEMENT_UPLOAD_CATEGORY })),
    });

    if (multiProperty) {
      showInfo(
        "Plusieurs biens détectés",
        "Notre équipe vous contactera pour un devis personnalisé.",
      );
      return;
    }

    const governed = snapshotGovernedFieldsForDebug(draft);
    console.log("[logement-debug-pre-upload-snapshot]", {
      logementWorkspaceForm: draft?.logementWorkspaceForm ?? null,
      pendingFormPrefill: pendingFormPrefillRef.current,
      localFormValues: formValuesRef.current,
      propertyBackgroundExtraction: draft?.propertyBackgroundExtraction ?? null,
      governedLogementFields: governed.logement,
      governedCreditFields: governed.credit,
      previousLogementDocumentId: draft?.logementDocumentId ?? null,
    });

    setValidatedSuccess(false);
    prefillAppliedRef.current = false;
    pendingFormPrefillRef.current = null;
    pendingUncertainFieldsRef.current = [];
    logVisualMutation("animation-replay", "handleUpload.resetAnimation", aiAnimationDone, false);
    setAiAnimationDone(false);
    logVisualMutation(
      "visible-sections-change",
      "handleUpload.resetSections",
      visibleSectionsRef.current,
      0,
    );
    setVisibleSections(0);
    skipRevealAnimationRef.current = false;
    pendingUploadRef.current = true;
    executionPendingRef.current = true;
    markExecution("document_upload");
    setIsExecutionRunning(true);
    console.log("[logement-execution-event]", { trigger: "document_upload" });

    showInfo(
      `${uploadedFiles.length} fichier${uploadedFiles.length > 1 ? "s" : ""} reçu${uploadedFiles.length > 1 ? "s" : ""}`,
      "L'IA analyse votre acte notarié.",
    );
  }

  function handleFormChange(next: LogementFormValues) {
    const editedKeys: LogementPrefillFieldKey[] = [];
    for (const key of [
      "label",
      "address",
      "addressLine2",
      "city",
      "postalCode",
      "propertyType",
      "surface",
      "acquisitionDate",
      "status",
    ] as LogementFieldKey[]) {
      const prevValue = formValues[key];
      const nextValue = next[key];
      if (typeof prevValue === "string" && typeof nextValue === "string" && prevValue.trim() !== nextValue.trim()) {
        editedKeys.push(key);
      } else if (key === "propertyType" && prevValue !== nextValue) {
        editedKeys.push(key);
      } else if (key === "coproperty" && prevValue !== nextValue) {
        editedKeys.push(key);
      }
    }
    if (editedKeys.length > 0) {
      setUserValidatedFields((prev) => mergeLogementUserValidatedFields(prev, editedKeys));
    }

    const store = readGovernedFieldStore(draft);
    const lockedStore = lockLogementFormFieldEdits(store, formValues, next);
    const patch: Record<string, unknown> = { ...logementWorkspaceFormPatch(next) };
    if (JSON.stringify(lockedStore) !== JSON.stringify(store)) {
      patch.governedFields = lockedStore;
    }
    dispatch({
      type: "DECLARATION_PATCH_DRAFT",
      patch,
    });
    logVisualMutation("form-reset", "handleFormChange", formValues, next);
    setFormValues(next);
    setUncertainFields((prev) =>
      prev.filter((key) => {
        const value = next[key];
        return typeof value === "string" ? !value.trim() : true;
      }),
    );
  }

  function handleRetry() {
    if (!logementDoc) return;
    prefillAppliedRef.current = false;
    pendingFormPrefillRef.current = null;
    pendingUncertainFieldsRef.current = [];
    logVisualMutation("animation-replay", "handleRetry", aiAnimationDone, false);
    setAiAnimationDone(false);
    logVisualMutation(
      "visible-sections-change",
      "handleRetry",
      visibleSectionsRef.current,
      0,
    );
    setVisibleSections(0);
    skipRevealAnimationRef.current = false;
    executionPendingRef.current = true;
    markExecution("reanalyze");
    setIsExecutionRunning(true);
    console.log("[logement-execution-event]", { trigger: "reanalyze" });
    dispatch({ type: "DOCUMENT_SET_STATUS", documentId: logementDoc.id, status: "uploaded" });
  }

  function handleManualContinue() {
    setMultiPropertyDetected(false);
    logVisualMutation("animation-replay", "handleManualContinue", aiAnimationDone, true);
    setAiAnimationDone(true);
    logVisualMutation(
      "visible-sections-change",
      "handleManualContinue",
      visibleSectionsRef.current,
      2,
    );
    setVisibleSections(2);
    skipRevealAnimationRef.current = true;
    setUncertainFields([]);
  }

  function handleConfirm() {
    dispatch({
      type: "CONFIRM_LOGEMENT_PROFILE",
      profile: formValuesToProperty(formValues),
      backgroundExtraction:
        workspace.declarationDraft?.propertyBackgroundExtraction ?? MOCK_LOGEMENT_BACKGROUND,
      documentId: logementDoc?.id,
    });
    setValidatedSuccess(true);
    setIsEditing(false);
    showSuccess(
      "Logement configuré",
      "Vos données seront réutilisées pour le crédit, les amortissements et les charges.",
    );
  }

  const incomplete = isLogementProfileIncomplete(displayedFormValues);
  const effectiveVisibleSections = logementEffectiveVisibleSections(visibleSections);

  return (
    <LogementStaticRoot>
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <WorkflowPageBackLink />

      <div className="w-full space-y-3 [&>section]:!mx-0 [&>section]:!w-full [&>section]:!max-w-none">
        <LogementHero
          onFiles={handleUpload}
          uploadState={hasUploaded ? "uploaded" : "idle"}
          uploadedFileName={logementDoc?.fileName}
          uploadedCount={Math.max(uploadedCount, 1)}
        />
      </div>

      {multiPropertyDetected ? (
        <div
          className={`w-full text-center ${LOGEMENT_FADE_IN}`}
          style={{
            borderRadius: radius.lg,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.primary,
            boxShadow: shadows.card.default,
            padding: spacing.card.md,
          }}
        >
          <p
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize.xl,
              color: colors.text.primary,
            }}
          >
            Demande de devis personnalisée
          </p>
          <p className="mt-3" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Plusieurs biens ont été détectés. Notre équipe vous accompagne pour configurer votre
            dossier sur mesure.
          </p>
        </div>
      ) : null}

      {isExecutionRunning ? (
        <ActiviteAiProcessing
          onComplete={handleAiAnimationComplete}
          finalStepLabel="Préparation du logement"
        />
      ) : null}

      {showExtractionForm ? (
        <LogementProfileFields
          values={displayedFormValues}
          onChange={handleFormChange}
          showIncompleteWarning={incomplete}
          onConfirm={handleConfirm}
          cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
          visibleSections={effectiveVisibleSections}
          uncertainFields={uncertainFields}
          showConfirm={effectiveVisibleSections >= 2}
        />
      ) : null}

      {showConfiguredCard ? (
        <>
          <ConfiguredDossierCard
            title="✓ Logement configuré"
            rows={buildLogementConfiguredSummary(
              formValues,
              draft?.propertyBackgroundExtraction ?? MOCK_LOGEMENT_BACKGROUND,
            )}
            onEdit={() => {
              setIsEditing(true);
              logVisualMutation(
                "visible-sections-change",
                "configuredCard.onEdit",
                visibleSectionsRef.current,
                2,
              );
              setVisibleSections(2);
              skipRevealAnimationRef.current = true;
            }}
          />
          <WorkflowProgressionActions currentStepId="logement" />
        </>
      ) : null}

      {isFailed ? (
        <div
          className={`w-full text-center ${LOGEMENT_FADE_IN}`}
          style={{
            borderRadius: radius.lg,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.primary,
            boxShadow: shadows.card.default,
            padding: spacing.card.md,
          }}
        >
          <p
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize.xl,
              color: colors.text.primary,
            }}
          >
            Certaines informations n&apos;ont pas pu être détectées automatiquement.
          </p>
          <p className="mt-3" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Vous pouvez réessayer l&apos;import ou compléter les champs manuellement.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button onClick={handleRetry}>Réessayer l&apos;import</Button>
            <Button variant="secondary" onClick={handleManualContinue}>
              Compléter manuellement
            </Button>
          </div>
        </div>
      ) : null}
    </div>
    </LogementStaticRoot>
  );
}
