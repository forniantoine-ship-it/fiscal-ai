"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { ActiviteAiProcessing } from "@/components/lmnp/activite/ActiviteAiProcessing";
import { ActiviteHero } from "@/components/lmnp/activite/ActiviteHero";
import { ActiviteNoInpiGuide } from "@/components/lmnp/activite/ActiviteNoInpiGuide";
import {
  ActiviteProfileFields,
  formValuesToProfile,
  isProfileIncomplete,
  profileToFormValues,
  type ActiviteFieldKey,
  type ActiviteFormValues,
} from "@/components/lmnp/activite/ActiviteProfileFields";
import { ConfiguredDossierCard } from "@/components/lmnp/shared/ConfiguredDossierCard";
import { useFeedback } from "@/components/lmnp/shared/FeedbackProvider";
import {
  WorkflowPageBackLink,
  WorkflowProgressionActions,
} from "@/components/lmnp/shared/WorkflowProgressionActions";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { AutosaveStatus } from "@/design-system/layouts/DashboardLayout";
import {
  buildGptManualCorrections,
  createGptLearningRecord,
} from "@/lib/documents/gpt/create-gpt-learning-record";
import { OCR_READ_FAILURE_MESSAGE } from "@/lib/documents/ocr";
import {
  activiteDraftPatchFromForm,
  detectUserEditedActiviteFields,
  hasPersistedActiviteFormData,
  hydrateActiviteFormFromWorkspace,
  mergeUserValidatedFields,
  shouldAutoRunGptPipeline,
  shouldSkipGptPrefill,
  type ActiviteUserValidatedFields,
} from "@/lib/lmnp/services/activite-form-state";
import {
  runActiviteDocumentPipeline,
  type ActiviteGptPipelineResult,
} from "@/lib/lmnp/services/activite-document-pipeline";
import { DocumentOcrFailedError } from "@/lib/lmnp/services/activite-gpt-pipeline";
import { prefillActiviteFormFromGpt } from "@/lib/lmnp/services/activite-gpt-ui-prefill";
import { buildActiviteConfiguredSummary } from "@/lib/lmnp/services/configured-dossier-summaries";
import {
  isInpiDocument,
  profileFromDraft,
} from "@/lib/lmnp/services/inpi-profile";
import { useTunnelHydration } from "@/lib/lmnp/hydration";
import type { TunnelStepProps } from "@/components/lmnp/documents/frozen-tunnel-step";
import { useLmnp } from "@/lib/lmnp/store";
import type { LmnpDocument } from "@/lib/lmnp/types";
import { uploadFilesForUser } from "@/lib/uploadDocument";
import { supabase } from "@/lib/supabase";

const EXTRACTED_CARD_STYLE = {
  borderRadius: radius.lg,
  border: `1px solid ${colors.border.subtle}`,
  boxShadow: shadows.card.default,
  padding: spacing.card.md,
  backgroundImage: [
    `radial-gradient(ellipse 88% 52% at 50% -8%, ${colors.orange[100]} 0%, transparent 62%)`,
    gradients.card.elevated,
  ].join(", "),
} as const;

const SECTION_REVEAL_DELAYS_MS = [0, 400, 800, 1200];

const UNRECOGNIZED_MESSAGE =
  "Nous n'avons pas reconnu automatiquement ce document. Merci de vérifier les informations.";

const OCR_FAILURE_MESSAGE = OCR_READ_FAILURE_MESSAGE;

function autosaveLabel(status: AutosaveStatus): { label: string | null; active: boolean } {
  if (status === "saved") return { label: "Dossier enregistré", active: false };
  if (status === "saving") return { label: "Enregistrement…", active: true };
  if (status === "error") return { label: "Erreur de sauvegarde", active: false };
  return { label: "Dossier enregistré", active: false };
}

function resolveInpiDocument(
  documents: LmnpDocument[],
  inpiDocumentId?: string,
): LmnpDocument | undefined {
  if (inpiDocumentId) {
    const linked = documents.find((doc) => doc.id === inpiDocumentId);
    if (linked) return linked;
  }

  const sorted = [...documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return sorted.find((doc) => isInpiDocument(doc, inpiDocumentId)) ?? sorted.find((doc) => doc.category === "autre");
}

function nowIso(): string {
  return new Date().toISOString();
}

export function ActiviteDocumentStep({ isActive = true }: TunnelStepProps) {
  const { workspace, dispatch, getFile, autosaveStatus } = useLmnp();
  const { showSuccess, showInfo } = useFeedback();
  const {
    markExecution,
    clearExecution,
    endPassiveHydration,
    shouldRunExtraction,
    shouldApplyPrefill,
  } = useTunnelHydration("activite");

  const analyzingRef = useRef(false);
  const pendingUploadRef = useRef(false);
  const executionPendingRef = useRef(false);
  const passiveSyncedRef = useRef(false);
  const gptSessionRef = useRef<ActiviteGptPipelineResult | null>(null);
  const extractedFormRef = useRef<ActiviteFormValues | null>(null);
  const learningFromEditRef = useRef(false);

  const draft = workspace.declarationDraft;
  const inpiDoc = useMemo(
    () => resolveInpiDocument(workspace.documents, draft?.inpiDocumentId),
    [workspace.documents, draft?.inpiDocumentId],
  );

  const save = autosaveLabel(autosaveStatus);
  const confirmed = Boolean(draft?.inpiConfirmedAt);
  const hasPersistedData = hasPersistedActiviteFormData(draft);

  const [manualMode, setManualMode] = useState(false);
  const [showNoInpiGuide, setShowNoInpiGuide] = useState(false);
  const [hasUploaded, setHasUploaded] = useState(
    () => Boolean(draft?.inpiDocumentId || draft?.inpiConfirmedAt || hasPersistedData),
  );
  const [aiAnimationDone, setAiAnimationDone] = useState(() => {
    const h = hydrateActiviteFormFromWorkspace(workspace);
    return Boolean(h.hasPersistedData || draft?.inpiGptPrefillAppliedAt);
  });
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [visibleSections, setVisibleSections] = useState(() => {
    const h = hydrateActiviteFormFromWorkspace(workspace);
    return h.hasPersistedData || draft?.inpiGptPrefillAppliedAt ? 4 : 0;
  });
  const [uncertainFields, setUncertainFields] = useState<ActiviteFieldKey[]>([]);
  const [showUnrecognizedMessage, setShowUnrecognizedMessage] = useState(false);
  const [showOcrFailureMessage, setShowOcrFailureMessage] = useState(false);
  const [validatedSuccess, setValidatedSuccess] = useState(() => confirmed);
  const [isEditing, setIsEditing] = useState(false);
  const [formValues, setFormValues] = useState<ActiviteFormValues>(
    () => hydrateActiviteFormFromWorkspace(workspace).formValues,
  );
  const [userValidatedFields, setUserValidatedFields] = useState<ActiviteUserValidatedFields>(
    () => hydrateActiviteFormFromWorkspace(workspace).userValidatedFields,
  );

  const isProcessing =
    (hasUploaded && !confirmed && !manualMode && (!aiAnimationDone || pipelineRunning)) ||
    pipelineRunning;
  const isFailed =
    (showOcrFailureMessage || inpiDoc?.status === "failed") && !manualMode && !pipelineRunning;
  const showConfiguredCard = (validatedSuccess || confirmed) && !isEditing;
  const showExtractionForm =
    (aiAnimationDone || manualMode) &&
    !isProcessing &&
    !showConfiguredCard &&
    !showOcrFailureMessage;
  const showInitialExtras = !hasUploaded && !manualMode && !confirmed;
  const showReanalyzeAction =
    Boolean(inpiDoc) && hasUploaded && !isProcessing && !showInitialExtras;

  const persistFormDraft = useCallback(
    (values: ActiviteFormValues, validated: ActiviteUserValidatedFields) => {
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: {
          ...activiteDraftPatchFromForm(values),
          activiteUserValidatedFields: validated,
        },
      });
    },
    [dispatch],
  );

  const applyGptResult = useCallback(
    (result: ActiviteGptPipelineResult, options?: { forceReanalyze?: boolean }) => {
      gptSessionRef.current = result;

      if (!options?.forceReanalyze && !shouldApplyPrefill()) {
        const restored = profileToFormValues(profileFromDraft(workspace));
        setFormValues(restored);
        extractedFormRef.current = restored;
        setAiAnimationDone(true);
        setVisibleSections(4);
        return;
      }

      if (shouldSkipGptPrefill(workspace.declarationDraft, options)) {
        const restored = profileToFormValues(profileFromDraft(workspace));
        setFormValues(restored);
        extractedFormRef.current = restored;
        setAiAnimationDone(true);
        setVisibleSections(4);
        return;
      }

      const ui = prefillActiviteFormFromGpt(result.extraction, workspace, {
        userValidatedFields,
        forceReanalyze: options?.forceReanalyze,
      });

      if (ui.skipped) {
        const restored = profileToFormValues(profileFromDraft(workspace));
        setFormValues(restored);
        extractedFormRef.current = restored;
        setAiAnimationDone(true);
        setVisibleSections(4);
        return;
      }

      setFormValues(ui.formValues);
      extractedFormRef.current = ui.formValues;
      setUncertainFields(ui.uncertainFields);
      setShowUnrecognizedMessage(ui.showUnrecognizedMessage);

      persistFormDraft(ui.formValues, userValidatedFields);

      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: { inpiGptPrefillAppliedAt: nowIso() },
      });

      if (inpiDoc) {
        dispatch({
          type: "DOCUMENT_SET_STATUS",
          documentId: inpiDoc.id,
          status: ui.prefilledFieldCount === 0 ? "failed" : "analyzed",
        });
      }

      clearExecution();
    },
    [workspace, inpiDoc, dispatch, userValidatedFields, persistFormDraft, shouldApplyPrefill, clearExecution],
  );

  const runPipeline = useCallback(
    async (document: LmnpDocument, options?: { forceReanalyze?: boolean }) => {
      if (analyzingRef.current) return;
      analyzingRef.current = true;
      setPipelineRunning(true);
      setShowOcrFailureMessage(false);

      dispatch({ type: "DOCUMENT_SET_STATUS", documentId: document.id, status: "processing" });

      try {
        const result = await runActiviteDocumentPipeline({
          document,
          getFile,
          fiscalYear: workspace.fiscalYear.year,
        });

        applyGptResult(result, options);
        setAiAnimationDone(true);
      } catch (err) {
        console.error("[ActiviteDocumentStep] GPT pipeline failed", err);
        if (err instanceof DocumentOcrFailedError) {
          setShowOcrFailureMessage(true);
          setShowUnrecognizedMessage(false);
          setAiAnimationDone(true);
        } else {
          setShowUnrecognizedMessage(true);
        }
        if (inpiDoc) {
          dispatch({ type: "DOCUMENT_SET_STATUS", documentId: document.id, status: "failed" });
        }
      } finally {
        analyzingRef.current = false;
        setPipelineRunning(false);
      }
    },
    [getFile, workspace, applyGptResult, dispatch, inpiDoc],
  );

  const handleAiAnimationComplete = useCallback(() => {
    setAiAnimationDone(true);
  }, []);

  useEffect(() => {
    console.log("[activite-remount-detected]", { at: new Date().toISOString() });
    return () => {
      console.log("[activite-unmount]", { at: new Date().toISOString() });
    };
  }, []);

  useEffect(() => {
    if (!showExtractionForm) {
      setVisibleSections(0);
      return;
    }

    const timers = SECTION_REVEAL_DELAYS_MS.map((delay, index) =>
      window.setTimeout(() => setVisibleSections(index + 1), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [showExtractionForm]);

  useEffect(() => {
    if (passiveSyncedRef.current) return;
    passiveSyncedRef.current = true;

    const hydrated = hydrateActiviteFormFromWorkspace(workspace);
    setFormValues(hydrated.formValues);
    setUserValidatedFields(hydrated.userValidatedFields);

    if (hydrated.hasPersistedData || draft?.inpiGptPrefillAppliedAt) {
      setHasUploaded(true);
      setAiAnimationDone(true);
      setVisibleSections(4);
    }
    endPassiveHydration();
  }, [workspace, draft?.inpiGptPrefillAppliedAt, endPassiveHydration]);

  useEffect(() => {
    if (confirmed) {
      setHasUploaded(true);
      setValidatedSuccess(true);
      setIsEditing(false);
      setAiAnimationDone(true);
      setFormValues(profileToFormValues(profileFromDraft(workspace)));
      setVisibleSections(4);
      setUncertainFields([]);
      setShowUnrecognizedMessage(false);
    }
  }, [confirmed, workspace]);

  useEffect(() => {
    if (!pendingUploadRef.current || !inpiDoc) return;
    pendingUploadRef.current = false;
    if (draft?.inpiDocumentId !== inpiDoc.id) {
      dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { inpiDocumentId: inpiDoc.id } });
    }
  }, [inpiDoc, draft?.inpiDocumentId, dispatch]);

  useEffect(() => {
    if (!inpiDoc || inpiDoc.status !== "uploaded" || analyzingRef.current) return;
    if (!executionPendingRef.current && !pendingUploadRef.current) return;
    if (!shouldRunExtraction()) return;

    if (!shouldAutoRunGptPipeline(draft, inpiDoc) && !executionPendingRef.current) {
      if (hasPersistedData || draft?.inpiGptPrefillAppliedAt) {
        console.log("[prefill-skipped-hydration]", {
          tunnel: "activite",
          action: "gpt_pipeline",
          reason: "persisted_data",
        });
      }
      setAiAnimationDone(true);
      setVisibleSections(4);
      pendingUploadRef.current = false;
      executionPendingRef.current = false;
      return;
    }

    // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
    console.log("[ocr-trigger-owner]", {
      system: "T7-activite-gated",
      component: "ActiviteDocumentStep",
      reason: "inpiDoc uploaded + (executionPendingRef OR pendingUploadRef) + shouldRunExtraction + shouldAutoRunGptPipeline",
      docs: [inpiDoc.id],
      step: "activite",
      category: "inpi",
      guard: "status=uploaded + analyzingRef + executionPendingRef/pendingUploadRef + shouldRunExtraction(hydration-aware) + shouldAutoRunGptPipeline",
    });
    executionPendingRef.current = false;
    pendingUploadRef.current = false;
    void runPipeline(inpiDoc);
  }, [
    inpiDoc?.id,
    inpiDoc?.status,
    draft?.inpiGptPrefillAppliedAt,
    draft?.inpiConfirmedAt,
    runPipeline,
    hasPersistedData,
    shouldRunExtraction,
  ]);

  async function handleUpload(files: File[]) {
    if (!files.length) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error("[ActiviteDocumentStep] upload aborted: user not authenticated");
      alert("Utilisateur non connecté");
      return;
    }

    const { files: uploadedFiles } = await uploadFilesForUser(files, user.id);

    if (uploadedFiles.length === 0) {
      console.error("[ActiviteDocumentStep] upload failed: no files stored in Supabase");
      return;
    }

    setManualMode(false);
    setShowNoInpiGuide(false);
    setAiAnimationDone(false);
    setVisibleSections(0);
    setUncertainFields([]);
    setShowUnrecognizedMessage(false);
    setShowOcrFailureMessage(false);
    setHasUploaded(true);
    pendingUploadRef.current = true;
    executionPendingRef.current = true;
    markExecution("document_upload");
    gptSessionRef.current = null;
    extractedFormRef.current = null;
    learningFromEditRef.current = false;

    dispatch({
      type: "DECLARATION_PATCH_DRAFT",
      patch: {
        inpiGptPrefillAppliedAt: undefined,
        activiteUserValidatedFields: {},
      },
    });

    dispatch({
      type: "UPLOAD_DOCUMENTS",
      files: uploadedFiles.map((file) => ({ file, category: "autre" })),
    });

    showInfo(
      `${uploadedFiles.length} fichier${uploadedFiles.length > 1 ? "s" : ""} reçu${uploadedFiles.length > 1 ? "s" : ""}`,
      "L'IA prépare vos informations.",
    );
  }

  function handleFormChange(next: ActiviteFormValues) {
    const editedKeys = detectUserEditedActiviteFields(formValues, next);
    const nextValidated =
      editedKeys.length > 0
        ? mergeUserValidatedFields(userValidatedFields, editedKeys)
        : userValidatedFields;

    if (editedKeys.length > 0) {
      setUserValidatedFields(nextValidated);
    }

    setFormValues(next);
    persistFormDraft(next, nextValidated);

    setUncertainFields((prev) =>
      prev.filter((key) => {
        const value = next[key as keyof ActiviteFormValues];
        return typeof value === "string" ? !value.trim() : true;
      }),
    );

    const session = gptSessionRef.current;
    const baseline = extractedFormRef.current;
    if (!session?.rawText || !baseline || learningFromEditRef.current) return;

    const corrections = buildGptManualCorrections({
      documentId: session.documentId,
      gptData: session.extraction.data,
      previous: baseline,
      next,
    });
    if (corrections.length === 0) return;

    learningFromEditRef.current = true;
    createGptLearningRecord({
      documentId: session.documentId,
      ocrText: session.rawText,
      gptData: session.extraction.data,
      corrections,
      notes: "manual_field_edit",
    });
  }

  function handleRetry() {
    if (!inpiDoc) return;
    setAiAnimationDone(false);
    setVisibleSections(0);
    setShowOcrFailureMessage(false);
    learningFromEditRef.current = false;
    dispatch({
      type: "DECLARATION_PATCH_DRAFT",
      patch: { inpiGptPrefillAppliedAt: undefined },
    });
    dispatch({ type: "DOCUMENT_SET_STATUS", documentId: inpiDoc.id, status: "uploaded" });
  }

  function handleReanalyzeDocument() {
    if (!inpiDoc) return;
    console.log("[execution-event]", { trigger: "reanalyze", tunnel: "activite" });
    markExecution("reanalyze");
    executionPendingRef.current = true;
    setAiAnimationDone(false);
    setVisibleSections(0);
    setShowUnrecognizedMessage(false);
    setShowOcrFailureMessage(false);
    learningFromEditRef.current = false;
    gptSessionRef.current = null;
    extractedFormRef.current = profileToFormValues(profileFromDraft(workspace));

    dispatch({
      type: "DECLARATION_PATCH_DRAFT",
      patch: { inpiGptPrefillAppliedAt: undefined },
    });
    dispatch({ type: "DOCUMENT_SET_STATUS", documentId: inpiDoc.id, status: "uploaded" });
    void runPipeline(inpiDoc, { forceReanalyze: true });
  }

  function handleConfirm() {
    const profile = formValuesToProfile(formValues);
    dispatch({
      type: "CONFIRM_INPI_PROFILE",
      profile,
      documentId: inpiDoc?.id,
    });
    setValidatedSuccess(true);
    setIsEditing(false);
    showSuccess(
      "Informations enregistrées",
      "Votre activité LMNP est prête pour la suite du dossier.",
    );
  }

  function handleManualContinue() {
    setManualMode(true);
    setShowNoInpiGuide(false);
    setAiAnimationDone(true);
    const restored = profileToFormValues(profileFromDraft(workspace));
    setFormValues(restored);
    persistFormDraft(restored, userValidatedFields);
    setUncertainFields([]);
    setShowUnrecognizedMessage(false);
    setShowOcrFailureMessage(false);
    setVisibleSections(4);
  }

  const incomplete = isProfileIncomplete(formValues);

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <WorkflowPageBackLink />

      <div className="w-full space-y-3 [&>section]:!mx-0 [&>section]:!w-full [&>section]:!max-w-none">
        <ActiviteHero
          year={workspace.fiscalYear.year}
          saveLabel={save.label}
          saveActive={save.active}
          onFiles={handleUpload}
          uploadState={hasUploaded ? "uploaded" : "idle"}
          uploadedFileName={inpiDoc?.fileName}
          uploadedCount={1}
        />

        {showReanalyzeAction ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleReanalyzeDocument}
              disabled={pipelineRunning}
              style={{
                ...typography.caption.desktop,
                color: colors.text.muted,
                textDecoration: "underline",
                textUnderlineOffset: "3px",
                opacity: pipelineRunning ? 0.5 : 1,
              }}
            >
              Réanalyser le document
            </button>
          </div>
        ) : null}

        {showInitialExtras && !showNoInpiGuide ? (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowNoInpiGuide(true)}
              style={{
                ...typography.caption.desktop,
                color: colors.text.muted,
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              Je n&apos;ai pas encore de document INPI
            </button>
          </div>
        ) : null}
      </div>

      {showNoInpiGuide && showInitialExtras ? (
        <div className="w-full [&>div]:!mx-0 [&>div]:!max-w-none [&>div]:!w-full">
          <ActiviteNoInpiGuide onContinueManually={handleManualContinue} />
        </div>
      ) : null}

      {isProcessing ? <ActiviteAiProcessing onComplete={handleAiAnimationComplete} /> : null}

      {showUnrecognizedMessage && showExtractionForm ? (
        <div
          className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
          style={{
            borderRadius: radius.lg,
            border: `1px solid ${colors.orange[200]}`,
            backgroundColor: colors.orange[50],
            padding: spacing.card.sm,
          }}
        >
          <p style={{ ...typography.body.desktop, color: colors.text.primary }}>{UNRECOGNIZED_MESSAGE}</p>
        </div>
      ) : null}

      {showExtractionForm ? (
        <ActiviteProfileFields
          values={formValues}
          onChange={handleFormChange}
          showIncompleteWarning={incomplete}
          onConfirm={handleConfirm}
          cardStyle={EXTRACTED_CARD_STYLE}
          visibleSections={visibleSections}
          uncertainFields={uncertainFields}
          showConfirm={visibleSections >= 4}
        />
      ) : null}

      {showConfiguredCard ? (
        <>
          <ConfiguredDossierCard
            title="✓ Activité configurée"
            rows={buildActiviteConfiguredSummary(formValues)}
            onEdit={() => {
              setIsEditing(true);
              setVisibleSections(4);
              setFormValues(profileToFormValues(profileFromDraft(workspace)));
            }}
          />
          <WorkflowProgressionActions currentStepId="activite" />
        </>
      ) : null}

      {isFailed ? (
        <div
          className="w-full text-center animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
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
            {showOcrFailureMessage
              ? "Lecture du document impossible"
              : "Certaines informations n'ont pas pu être détectées automatiquement."}
          </p>
          <p className="mt-3" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            {showOcrFailureMessage
              ? OCR_FAILURE_MESSAGE
              : "Vous pouvez réessayer l'import ou compléter les champs manuellement."}
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
  );
}
