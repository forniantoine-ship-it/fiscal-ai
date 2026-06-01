"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { ActiviteAiProcessing } from "@/components/lmnp/activite/ActiviteAiProcessing";
import { CreditFinancingFields } from "@/components/lmnp/credit/CreditFinancingFields";
import { CreditHero } from "@/components/lmnp/credit/CreditHero";
import { DOCUMENT_WORKFLOW_CARD_STYLE } from "@/components/lmnp/documents/document-workflow-shared";
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
  countCreditDocuments,
  classifyCreditDocument,
  classifyCreditFileName,
  emptyCreditFormValues,
  formValuesToFinancing,
  isCreditDocument,
  isCreditProfileIncomplete,
  revenueYearFromDeclaration,
  suggestsMultipleLoans,
  type CreditFieldKey,
  type CreditFormValues,
} from "@/lib/lmnp/services/credit-profile";
import {
  lockCreditFormFieldEdits,
  readGovernedFieldStore,
} from "@/lib/lmnp/services/governed-field-prefill";
import {
  creditWorkspaceFormPatch,
  restoreCreditFormPassive,
} from "@/lib/lmnp/services/passive-form-restore";
import { useTunnelHydration } from "@/lib/lmnp/hydration";
import { buildCreditConfiguredSummary } from "@/lib/lmnp/services/configured-dossier-summaries";
import {
  hasCreditExtractionSession,
  hydrateCreditFormFromSession,
  mergeCreditExtractionSession,
  mergeCreditUserValidatedFields,
  readCreditUserValidatedFields,
  type CreditExtractionSession,
  type CreditPrefillFieldKey,
  type CreditUserValidatedFields,
} from "@/lib/lmnp/services/credit-gpt-ui-prefill";
import type { CreditLoanOfferExtraction } from "@/lib/documents/gpt/schemas/credit-loan-offer.schema";
import type { CreditAmortizationExtraction } from "@/lib/documents/gpt/schemas/credit-amortization.schema";
import {
  runCreditDocumentPipeline,
  type CreditGptPipelineResult,
} from "@/lib/lmnp/services/credit-document-pipeline";
import {
  registerCreditAnalysisTimelineSnapshotReader,
  resetCreditAnalysisTimeline,
  traceCreditAnalysisTimeline,
  type CreditAnalysisTimelineSnapshot,
  type CreditAnalysisTimelineStage,
} from "@/lib/lmnp/services/credit-analysis-timeline";
import { logCreditExtractionPipelineResult } from "@/lib/lmnp/services/credit-extraction-payload";
import {
  resetCreditConflictApplyTrace,
  snapshotExtractionPayload,
  snapshotPendingConflictAmortRef,
  traceCreditConflictApplyOrder,
  traceCreditConflictPendingRefClear,
} from "@/lib/lmnp/services/credit-conflict-apply-trace";
import {
  markCreditRenderUnblockAnchor,
  measureCreditRenderUnblockSync,
  msSinceCreditRenderUnblockAnchor,
  resetCreditRenderUnblockAnchor,
  traceCreditRenderUnblock,
  traceCreditRunAnalysisSegment,
} from "@/lib/lmnp/services/credit-render-unblock-trace";
import {
  registerCreditConflictResolutionSnapshotReader,
  resetCreditConflictResolutionTimeline,
  traceCreditConflictResolution,
  traceCreditConflictResolutionHydration,
  traceCreditConflictResolutionMerge,
  traceCreditConflictResolutionPendingAssigned,
} from "@/lib/lmnp/services/credit-conflict-resolution-timeline";
import {
  makeAnalysisFailedEvent,
  makeConflictDetectedEvent,
  makeDocumentEnrichedEvent,
  makeDocumentNoChangeEvent,
  makeEntityMergeEvent,
  makeValidationEvent,
} from "@/lib/lmnp/services/ai-activity-events";
import { AiActivityFeed, AiInsightCardsPanel } from "@/components/lmnp/ai-activity";
import { WorkflowInspector } from "@/components/lmnp/dev/WorkflowInspector";
import { useLmnp } from "@/lib/lmnp/store";
import type { TunnelStepProps } from "@/components/lmnp/documents/frozen-tunnel-step";
import type { DeclarationDraft, LmnpDocument } from "@/lib/lmnp/types";

const SECTION_REVEAL_DELAYS_MS = [0, 400];
const CREDIT_UPLOAD_CATEGORY = getDocumentJourneyStep("credit-immobilier").category;

const CREDIT_AI_STEPS = [
  "Document reçu",
  "Analyse OCR",
  "Détection des informations",
  "Préparation des échéances",
  "Vérification cohérence",
] as const;

function resolveCreditDocument(
  documents: LmnpDocument[],
  creditDocumentId?: string,
): LmnpDocument | undefined {
  if (creditDocumentId) {
    const linked = documents.find((doc) => doc.id === creditDocumentId);
    if (linked) return linked;
  }

  const sorted = [...documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return sorted.find((doc) => isCreditDocument(doc, creditDocumentId));
}

function isCreditFormEmpty(values: CreditFormValues): boolean {
  return (
    !values.summary.annualInterest.trim() &&
    !values.summary.remainingCapital.trim() &&
    values.loans.every(
      (loan) => !loan.bank.trim() && !loan.borrowedAmount.trim() && !loan.monthlyPayment.trim(),
    )
  );
}

function hasPersistedCreditExtraction(draft?: DeclarationDraft): boolean {
  return Boolean(
    draft?.creditGptSession &&
      hasCreditExtractionSession(draft.creditGptSession) &&
      draft?.creditDocumentId,
  );
}

// ─── Workflow phase for dev inspector ────────────────────────────────────────

function resolveWorkflowPhase(opts: {
  isExecutionRunning: boolean;
  showAnimation: boolean;
  showConfiguredCard: boolean;
  showExtractionForm: boolean;
  isFailed: boolean;
  confirmed: boolean;
  isEditing: boolean;
  hasUploaded: boolean;
}): string {
  if (opts.isExecutionRunning) return "ANALYZING";
  if (opts.showAnimation && !opts.isExecutionRunning) return "ANIMATION_ONLY — BLOCKED (remount during processing)";
  if (opts.isFailed) return "ANALYSIS_FAILED";
  if (opts.confirmed && !opts.isEditing) return "CONFIRMED";
  if (opts.showConfiguredCard && !opts.isEditing) return "CONFIGURED";
  if (opts.showExtractionForm) return "FORM_VISIBLE";
  if (opts.hasUploaded && !opts.showExtractionForm && !opts.showConfiguredCard)
    return "BLOCKED — no form, no configured card";
  return "IDLE";
}

export function CreditDocumentStep({ isActive = true }: TunnelStepProps) {
  const { workspace, dispatch, getFile } = useLmnp();
  const { showSuccess, showInfo } = useFeedback();
  const {
    markExecution,
    clearExecution,
    endPassiveHydration,
  } = useTunnelHydration("credit");

  const analyzingRef = useRef(false);
  const pendingUploadRef = useRef(false);
  const executionPendingRef = useRef(false);
  const passiveSyncedRef = useRef(false);
  // Tracks the exact Supabase-assigned document ID to analyze next.
  // Replaces the old "watch creditDoc.status" heuristic which failed for upload 2+
  // because creditDoc follows draft.creditDocumentId (= upload 1, already "analyzed").
  const latestUploadedDocIdRef = useRef<string | null>(null);
  const extractionSessionRef = useRef<CreditExtractionSession>({});
  /** Amortization held back when upload #3 triggers conflict (not merged until user chooses). */
  const pendingConflictAmortRef = useRef<{
    extraction: CreditAmortizationExtraction;
    documentId: string;
  } | null>(null);
  const pendingFormPrefillRef = useRef<CreditFormValues | null>(null);
  const pendingUncertainFieldsRef = useRef<CreditFieldKey[]>([]);
  const prefillAppliedRef = useRef(false);
  const prevShowExtractionFormRef = useRef(false);
  const skipRevealAnimationRef = useRef(false);
  const allowPrefillAtExecutionStartRef = useRef(false);
  const analysisFailedRef = useRef(false);
  const formValuesRef = useRef<CreditFormValues>(emptyCreditFormValues());
  const prevShowExtractionFormForTimelineRef = useRef(false);
  const financingFormRenderedTimelineRef = useRef(false);
  /** Bumped when an analysis run finishes so queued uploads can start. */
  const [analysisIdleTick, setAnalysisIdleTick] = useState(0);

  const draft = workspace.declarationDraft;
  const revenueYear = revenueYearFromDeclaration(workspace.fiscalYear.year);

  /** Defer clearing hydration trigger only while another upload is queued (not during active analysis). */
  const clearExecutionIfIdle = useCallback(() => {
    if (latestUploadedDocIdRef.current || executionPendingRef.current) {
      console.log("[amortization-stage]", {
        stage: "clear_execution_deferred",
        pendingDocId: latestUploadedDocIdRef.current,
        executionPending: executionPendingRef.current,
      });
      return;
    }
    clearExecution();
  }, [clearExecution]);

  /** Always exit processing UI — called once per runAnalysis in `finally`. */
  const finalizeCreditAnalysisExecution = useCallback(
    (documentId: string) => {
      measureCreditRenderUnblockSync(
        "finalizeCreditAnalysisExecution",
        () => {
          traceCreditAnalysisTimeline("finalize_execution_started", documentId, undefined, {
            analysisFailed: analysisFailedRef.current,
          });

          const doc = workspace.documents.find((d) => d.id === documentId);
          const processingCreditDocs = workspace.documents.filter(
            (d) => isCreditDocument(d, draft?.creditDocumentId) && d.status === "processing",
          );

          if (doc?.status === "processing") {
            dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "analyzed" });
          }

          traceCreditAnalysisTimeline("processing_state_reset", documentId, undefined, {
            docStatusAfterReset: doc?.status === "processing" ? "analyzed" : doc?.status,
          });

          analyzingRef.current = false;
          executionPendingRef.current = false;
          latestUploadedDocIdRef.current = null;
          setIsExecutionRunning(false);
          setAiAnimationDone(true);
          clearExecution();

          traceCreditRenderUnblock("finalize_state_updates_dispatched", {
            documentId,
            processingCreditDocIds: processingCreditDocs.map((d) => d.id),
            processingCreditDocCount: processingCreditDocs.length,
          });

          traceCreditAnalysisTimeline("finalize_execution_finished", documentId);
          analysisFailedRef.current = false;
        },
        { documentId },
      );
    },
    [clearExecution, dispatch, workspace.documents, draft?.creditDocumentId],
  );

  const creditDoc = useMemo(
    () => resolveCreditDocument(workspace.documents, draft?.creditDocumentId),
    [workspace.documents, draft?.creditDocumentId],
  );
  const uploadedCount = useMemo(
    () => countCreditDocuments(workspace.documents, draft?.creditDocumentId),
    [workspace.documents, draft?.creditDocumentId],
  );

  const confirmed = Boolean(draft?.creditConfirmedAt);
  const declaredNone = Boolean(draft?.creditDeclaredNoneAt) && !confirmed;

  const [hasUploaded, setHasUploaded] = useState(
    () => Boolean(draft?.creditDocumentId || draft?.creditConfirmedAt),
  );
  const [noCreditDeclared, setNoCreditDeclared] = useState(() => declaredNone);
  const [aiAnimationDone, setAiAnimationDone] = useState(
    () => hasPersistedCreditExtraction(draft) || Boolean(draft?.creditConfirmedAt),
  );
  const [visibleSections, setVisibleSections] = useState(() =>
    hasPersistedCreditExtraction(draft) || draft?.creditConfirmedAt ? 2 : 0,
  );
  const [uncertainFields, setUncertainFields] = useState<CreditFieldKey[]>([]);
  const [detectedLoansCount, setDetectedLoansCount] = useState(1);
  const [validatedSuccess, setValidatedSuccess] = useState(() => confirmed);
  const [isEditing, setIsEditing] = useState(false);
  const [isExecutionRunning, setIsExecutionRunning] = useState(false);
  const [formValues, setFormValues] = useState<CreditFormValues>(() =>
    restoreCreditFormPassive(draft, revenueYear),
  );
  const [userValidatedFields, setUserValidatedFields] = useState<CreditUserValidatedFields>(() =>
    readCreditUserValidatedFields(draft),
  );

  /** Single path: session → form state + draft patch + visible financing UI. */
  const commitCreditFormHydration = useCallback(
    (
      session: CreditExtractionSession,
      options?: {
        documentId?: string;
        governedKind?: "loan_offer" | "amortization";
        /** Emit stages 5–8 on [credit-conflict-resolution] after conflict "Utiliser le nouveau". */
        conflictResolutionTrace?: boolean;
      },
    ) => {
      extractionSessionRef.current = session;
      const prefill = measureCreditRenderUnblockSync(
        "hydrateCreditFormFromSession",
        () =>
          hydrateCreditFormFromSession({
            session,
            revenueYear,
            userValidatedFields,
            governedPayloadFor: options?.governedKind,
          }),
        { documentId: options?.documentId, governedKind: options?.governedKind },
      );

      prefillAppliedRef.current = true;
      pendingFormPrefillRef.current = null;
      setFormValues(prefill.nextValues);
      setUncertainFields(prefill.uncertainFields);
      setVisibleSections(2);
      skipRevealAnimationRef.current = true;

      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: {
          ...creditWorkspaceFormPatch(prefill.nextValues),
          creditGptSession: session,
          creditUserValidatedFields: userValidatedFields,
        },
      });

      if (options?.documentId && options?.governedKind) {
        dispatch({
          type: "APPLY_GOVERNED_EXTRACTION",
          sourceTunnel: "credit",
          documentId: options.documentId,
          sourceDocument:
            options.governedKind === "loan_offer" ? "loan_offer" : "loan_schedule",
          extractedBy: "gpt",
          payload: prefill.governedPayload,
        });
      }

      if (options?.conflictResolutionTrace) {
        traceCreditConflictResolutionHydration({
          documentId: options.documentId,
          governedKind: options.governedKind,
          session,
          nextValues: prefill.nextValues,
          governedPayloadKeys: Object.keys(prefill.governedPayload ?? {}),
          governedDispatchSkipped: !(options.documentId && options.governedKind),
        });
      }

      return prefill;
    },
    [dispatch, revenueYear, userValidatedFields],
  );

  formValuesRef.current = formValues;

  const hasFinancingData = useMemo(
    () =>
      !isCreditFormEmpty(formValues) ||
      Boolean(
        draft?.creditGptSession && hasCreditExtractionSession(draft.creditGptSession),
      ),
    [formValues, draft?.creditGptSession],
  );

  // Any in-flight credit document — not only draft.creditDocumentId (multi-upload safe).
  const anyCreditDocProcessing = useMemo(
    () =>
      workspace.documents.some(
        (doc) => isCreditDocument(doc, draft?.creditDocumentId) && doc.status === "processing",
      ),
    [workspace.documents, draft?.creditDocumentId],
  );

  const docIsProcessing = creditDoc?.status === "processing";
  const showAnimation = isExecutionRunning || anyCreditDocProcessing;

  const isFailed = creditDoc?.status === "failed" && !aiAnimationDone && !showAnimation;
  const showInitialExtras = !hasUploaded && !confirmed && !noCreditDeclared;
  const showConfiguredCard =
    ((validatedSuccess || confirmed) && !isEditing) ||
    (noCreditDeclared && !hasUploaded && !isEditing);
  // Do NOT gate on aiAnimationDone alone — session/form can exist while animation flag is stale.
  const showExtractionForm =
    hasUploaded &&
    hasFinancingData &&
    !showAnimation &&
    !showConfiguredCard &&
    !noCreditDeclared;

  const pendingFinancementConflict = useMemo(
    () =>
      (workspace.aiActivityFeed ?? []).find(
        (event) =>
          event.step === "financement" &&
          event.type === "conflict_detected" &&
          event.resolutionState === "pending",
      ),
    [workspace.aiActivityFeed],
  );

  const prevShowAnimationRef = useRef(showAnimation);

  useLayoutEffect(() => {
    if (msSinceCreditRenderUnblockAnchor() == null) return;
    if (prevShowAnimationRef.current === showAnimation) return;
    traceCreditRenderUnblock("showAnimation_changed", {
      from: prevShowAnimationRef.current,
      to: showAnimation,
      isExecutionRunning,
      anyCreditDocProcessing,
      aiAnimationDone,
      showExtractionForm,
      pendingConflictEventId: pendingFinancementConflict?.id ?? null,
      processingCreditDocs: workspace.documents
        .filter(
          (doc) =>
            isCreditDocument(doc, draft?.creditDocumentId) && doc.status === "processing",
        )
        .map((doc) => ({ id: doc.id, fileName: doc.fileName })),
    });
    prevShowAnimationRef.current = showAnimation;
  }, [
    showAnimation,
    isExecutionRunning,
    anyCreditDocProcessing,
    aiAnimationDone,
    showExtractionForm,
    pendingFinancementConflict?.id,
    workspace.documents,
    draft?.creditDocumentId,
  ]);

  useEffect(() => {
    if (!pendingFinancementConflict) return;
    if (msSinceCreditRenderUnblockAnchor() == null) return;
    traceCreditRenderUnblock("conflict_card_pending_in_store", {
      eventId: pendingFinancementConflict.id,
      relatedDocumentIds: pendingFinancementConflict.relatedDocumentIds,
      showAnimation,
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        traceCreditRenderUnblock("conflict_card_paint_frame", {
          eventId: pendingFinancementConflict.id,
          showAnimation,
        });
      });
    });
  }, [pendingFinancementConflict, showAnimation]);

  useEffect(() => {
    if (msSinceCreditRenderUnblockAnchor() == null) return;
    if (showAnimation) return;
    traceCreditRenderUnblock("showAnimation_now_false", {
      isExecutionRunning,
      anyCreditDocProcessing,
      aiAnimationDone,
      showExtractionForm,
    });
  }, [showAnimation, isExecutionRunning, anyCreditDocProcessing, aiAnimationDone, showExtractionForm]);

  const buildTimelineSnapshot = useCallback((): CreditAnalysisTimelineSnapshot => {
    return {
      analyzingRef: analyzingRef.current,
      isExecutionRunning,
      executionPendingRef: executionPendingRef.current,
      latestUploadedDocIdRef: latestUploadedDocIdRef.current,
      showAnimation,
      visibleSections,
    };
  }, [isExecutionRunning, showAnimation, visibleSections]);

  useEffect(() => {
    registerCreditAnalysisTimelineSnapshotReader(buildTimelineSnapshot);
    return () => registerCreditAnalysisTimelineSnapshotReader(null);
  }, [buildTimelineSnapshot]);

  const readPendingConflictAmortRef = useCallback(
    () => snapshotPendingConflictAmortRef(pendingConflictAmortRef.current),
    [],
  );

  const clearPendingConflictAmortRef = useCallback(
    (reason: string, location: string) => {
      traceCreditConflictPendingRefClear(reason, location, readPendingConflictAmortRef());
      pendingConflictAmortRef.current = null;
    },
    [readPendingConflictAmortRef],
  );

  const buildConflictResolutionSnapshot = useCallback(() => {
    const pending = pendingConflictAmortRef.current;
    const session = extractionSessionRef.current;
    return {
      pendingConflictAmortSet: Boolean(pending),
      pendingDocumentId: pending?.documentId ?? null,
      pendingExtractionKeys: pending?.extraction
        ? Object.keys(pending.extraction as Record<string, unknown>)
        : [],
      sessionLoanOfferKeys: session.loanOffer ? Object.keys(session.loanOffer) : [],
      sessionAmortizationKeys: session.amortization ? Object.keys(session.amortization) : [],
      draftHasCreditGptSession: Boolean(draft?.creditGptSession),
    };
  }, [draft?.creditGptSession]);

  useEffect(() => {
    registerCreditConflictResolutionSnapshotReader(buildConflictResolutionSnapshot);
    return () => registerCreditConflictResolutionSnapshotReader(null);
  }, [buildConflictResolutionSnapshot]);

  const traceTimeline = useCallback(
    (
      stageName: CreditAnalysisTimelineStage,
      documentId?: string | null,
      extra?: Record<string, unknown>,
    ) => {
      traceCreditAnalysisTimeline(stageName, documentId ?? null, buildTimelineSnapshot(), extra);
    },
    [buildTimelineSnapshot],
  );

  useEffect(() => {
    if (showExtractionForm && !prevShowExtractionFormForTimelineRef.current) {
      traceTimeline("render_gate_opened", draft?.creditDocumentId ?? null);
    }
    prevShowExtractionFormForTimelineRef.current = showExtractionForm;
  }, [showExtractionForm, draft?.creditDocumentId, traceTimeline]);

  useEffect(() => {
    if (showExtractionForm && visibleSections >= 1 && !financingFormRenderedTimelineRef.current) {
      financingFormRenderedTimelineRef.current = true;
      traceTimeline("financing_form_rendered", draft?.creditDocumentId ?? null);
    }
    if (!showExtractionForm) {
      financingFormRenderedTimelineRef.current = false;
    }
  }, [showExtractionForm, visibleSections, draft?.creditDocumentId, traceTimeline]);

  // ── Compute workflow phase for dev inspector ──────────────────────────────────
  const workflowPhase = resolveWorkflowPhase({
    isExecutionRunning,
    showAnimation,
    showConfiguredCard,
    showExtractionForm,
    isFailed,
    confirmed,
    isEditing,
    hasUploaded,
  });

  const blockers: string[] = [];
  if (hasUploaded && !showExtractionForm && !showConfiguredCard && !showAnimation && !isFailed) {
    blockers.push("hasUploaded=true but no visible panel");
  }
  if (docIsProcessing && !isExecutionRunning) {
    blockers.push("creditDoc.status=processing but isExecutionRunning=false (remount during analysis)");
  }
  if (!aiAnimationDone && !showAnimation && hasUploaded && !isFailed) {
    blockers.push("aiAnimationDone=false but no animation running");
  }

  const applyPipelineResult = useCallback(
    (
      result: CreditGptPipelineResult,
      options: {
        allowPrefill: boolean;
        existingFinancing?: import("@/lib/lmnp/types").CreditFinancingData;
      },
    ) => {
      traceTimeline("applyPipelineResult_entered", result.documentId, {
        success: result.success,
        documentKind: result.documentKind,
        allowPrefill: options.allowPrefill,
      });

      console.log("[ai-event-pipeline] pipeline result received", {
        documentId: result.documentId,
        success: result.success,
        documentKind: result.documentKind,
        hasLoanOffer: Boolean(result.loanOffer?.extraction),
        hasAmortization: Boolean(result.amortization?.extraction),
      });

      dispatch({
        type: "DOCUMENT_SET_STATUS",
        documentId: result.documentId,
        status: result.success ? "analyzed" : "failed",
      });

      if (!result.success) {
        console.log("[ai-event-created] analysis_failed", { documentId: result.documentId });
        dispatch({
          type: "ADD_AI_ACTIVITY_EVENT",
          event: makeAnalysisFailedEvent(
            "financement",
            result.documentId,
            "Financement",
            result.documentId,
          ),
        });
        traceTimeline("business_decision_selected", result.documentId, {
          decision: "analysis_failed",
        });
        return;
      }

      const kind = result.documentKind === "loan_offer" ? "loan_offer" : "amortization";
      const extraction =
        kind === "loan_offer" ? result.loanOffer?.extraction : result.amortization?.extraction;

      if (kind === "amortization") {
        resetCreditConflictApplyTrace(result.documentId);
        traceCreditConflictApplyOrder("apply_entered_amortization", {
          documentId: result.documentId,
          pendingRefAtEntry: readPendingConflictAmortRef(),
          pipelineExtraction: snapshotExtractionPayload(
            result.amortization?.extraction,
          ),
          resolvedExtraction: snapshotExtractionPayload(
            extraction as CreditAmortizationExtraction | undefined,
          ),
        });
      }

      if (!extraction) {
        if (kind === "amortization") {
          traceCreditConflictApplyOrder("early_return_no_extraction", {
            documentId: result.documentId,
            pendingRef: readPendingConflictAmortRef(),
          });
        }
        // Scenario A — document processed successfully but contains no new data.
        // CRITICAL: No upload may end silently — always emit a visible card event.
        console.log("[ai-event-created] document_no_change", { documentId: result.documentId });
        dispatch({
          type: "ADD_AI_ACTIVITY_EVENT",
          event: makeDocumentNoChangeEvent(
            "financement",
            `credit-${result.documentId}`,
            "Financement",
            result.documentId,
          ),
        });

        // ── FIX C: When document produces no extraction, restore form from best available source ─
        // Sources tried in order:
        //   1. extractionSessionRef (current in-memory session — may be cleared for loan_offer uploads)
        //   2. draft.creditGptSession (last persisted session — survives reload and re-analysis)
        //   3. restoreCreditFormPassive (draft.creditWorkspaceForm — fallback for confirmed financing)
        const sessionForRestore = hasCreditExtractionSession(extractionSessionRef.current)
          ? extractionSessionRef.current
          : hasCreditExtractionSession(draft?.creditGptSession ?? {})
            ? (draft?.creditGptSession ?? {})
            : null;

        if (sessionForRestore) {
          commitCreditFormHydration(sessionForRestore);
          return;
        }
        // Final fallback: passive restore (covers confirmed financing case)
        const passiveForm = restoreCreditFormPassive(draft, revenueYear);
        if (!isCreditFormEmpty(passiveForm)) {
          prefillAppliedRef.current = true;
          setFormValues(passiveForm);
          setVisibleSections(2);
          skipRevealAnimationRef.current = true;
          dispatch({
            type: "DECLARATION_PATCH_DRAFT",
            patch: creditWorkspaceFormPatch(passiveForm),
          });
        }

        traceTimeline("business_decision_selected", result.documentId, {
          decision: "document_no_change",
        });
        return;
      }

      // ── BUSINESS RULE A ─────────────────────────────────────────────────────────
      // loan_offer that matches the data already in the current session → no new info.
      // Scenario: user uploads the signed copy of the same offer (identical conditions).
      // Without this check, any re-upload of the offer creates a duplicate green card.
      if (kind === "loan_offer" && extractionSessionRef.current.loanOffer) {
        const sessionOffer = extractionSessionRef.current.loanOffer;
        const newOffer = extraction as CreditLoanOfferExtraction;

        const newAmount = newOffer.loanAmount;
        const existAmount = sessionOffer.loanAmount;
        const newRate = newOffer.interestRate;
        const existRate = sessionOffer.interestRate;
        const newDuration = newOffer.loanDurationMonths;
        const existDuration = sessionOffer.loanDurationMonths;

        // Only flag as different if BOTH sides have the value AND it differs materially
        const amountConflicts = newAmount != null && existAmount != null && Math.abs(newAmount - existAmount) > 500;
        const rateConflicts = newRate != null && existRate != null && Math.abs(newRate - existRate) > 0.1;
        const durationConflicts = newDuration != null && existDuration != null && Math.abs(newDuration - existDuration) > 3;

        console.log("[credit-decision]", {
          document: result.fileName,
          kind: "loan_offer",
          decision: (!amountConflicts && !rateConflicts && !durationConflicts) ? "document_no_change" : "proceed_to_conflict_check",
          reason: "session_comparison",
          newAmount, existAmount, newRate, existRate, newDuration, existDuration,
          amountConflicts, rateConflicts, durationConflicts,
        });

        if (!amountConflicts && !rateConflicts && !durationConflicts) {
          const entityLabel = sessionOffer.bankName ?? "Financement";
          const entityId = `credit-${entityLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

          console.log("[ai-event-created] document_no_change (session match)", { documentId: result.documentId });
          dispatch({
            type: "ADD_AI_ACTIVITY_EVENT",
            event: makeDocumentNoChangeEvent(
              "financement",
              entityId,
              entityLabel,
              result.documentId,
              "Ce document concerne un prêt déjà analysé. Les conditions sont identiques à celles déjà enregistrées.",
            ),
          });
          commitCreditFormHydration(extractionSessionRef.current);
          traceTimeline("business_decision_selected", result.documentId, {
            decision: "document_no_change",
            reason: "session_match",
          });
          return;
        }
      }

      // ── BUSINESS RULE B ─────────────────────────────────────────────────────────
      // amortization that differs materially from the current session's loan offer
      // → this is a DIFFERENT loan, not an enrichment.
      // Without this check, every amortization upload becomes a green "enrichment"
      // even when it belongs to a completely different property or borrower.
      const sessionLoanOffer =
        extractionSessionRef.current.loanOffer ?? draft?.creditGptSession?.loanOffer;

      if (kind === "amortization" && !sessionLoanOffer) {
        traceCreditConflictApplyOrder("early_return_amortization_no_session_loan_offer", {
          documentId: result.documentId,
          pendingRef: readPendingConflictAmortRef(),
          extraction: snapshotExtractionPayload(extraction as CreditAmortizationExtraction),
        });
      }

      if (kind === "amortization" && sessionLoanOffer) {
        traceCreditConflictApplyOrder("amortization_rule_b_entered", {
          documentId: result.documentId,
          pendingRefBeforeRuleB: readPendingConflictAmortRef(),
          extractionBeforeConflictCheck: snapshotExtractionPayload(
            extraction as CreditAmortizationExtraction,
          ),
        });

        const sessionOffer = sessionLoanOffer;
        const amort = extraction as CreditAmortizationExtraction;

        // Upload #3 clears the form before analysis — baseline must come from the session,
        // not formValuesRef (which is empty during amortization processing).
        const baselineForm = hydrateCreditFormFromSession({
          session: { loanOffer: sessionOffer },
          revenueYear,
          userValidatedFields,
        }).nextValues;
        const baselineLoan = baselineForm.loans[0];
        const baselineBorrowed =
          Number(String(baselineLoan?.borrowedAmount ?? "").replace(/\s/g, "")) || undefined;
        const baselineDuration =
          Number(String(baselineLoan?.durationMonths ?? "").replace(/\s/g, "")) || undefined;
        const baselineRemaining =
          Number(String(baselineForm.summary.remainingCapital ?? "").replace(/\s/g, "")) ||
          undefined;

        const amortAmount = amort.loanAmount;
        const existAmount = sessionOffer.loanAmount ?? baselineBorrowed;
        const amortDuration = amort.loanDurationMonths;
        const existDuration = sessionOffer.loanDurationMonths ?? baselineDuration;
        const amountConflicts =
          amortAmount != null && existAmount != null && Math.abs(amortAmount - existAmount) > 500;
        const durationConflicts =
          amortDuration != null && existDuration != null && Math.abs(amortDuration - existDuration) > 3;
        const remainingConflicts =
          amort.remainingPrincipal != null &&
          baselineRemaining != null &&
          baselineRemaining > 0 &&
          Math.abs(amort.remainingPrincipal - baselineRemaining) > 2000;

        console.log("[credit-decision]", {
          document: result.fileName,
          kind: "amortization",
          decision:
            amountConflicts || durationConflicts || remainingConflicts
              ? "conflict_detected"
              : "document_enriched",
          reason: amountConflicts
            ? "amount_mismatch"
            : durationConflicts
              ? "duration_mismatch"
              : remainingConflicts
                ? "remaining_principal_mismatch"
                : "same_loan",
          amortAmount,
          existAmount,
          amortDuration,
          existDuration,
          amortRemaining: amort.remainingPrincipal,
          baselineRemaining,
        });

        if (amountConflicts || durationConflicts || remainingConflicts) {
          traceCreditConflictApplyOrder("amortization_conflict_branch_entered", {
            documentId: result.documentId,
            amountConflicts,
            durationConflicts,
            remainingConflicts,
            pendingRefBeforeAssign: readPendingConflictAmortRef(),
            extractionBeforeAssign: snapshotExtractionPayload(amort),
            amortReferenceIsExtraction: amort === extraction,
          });

          traceCreditConflictApplyOrder("extraction_payload_before_pending_assign", {
            documentId: result.documentId,
            extraction: snapshotExtractionPayload(amort),
            rawExtraction: amort,
          });

          const pendingRefBeforeAssign = readPendingConflictAmortRef();
          resetCreditConflictResolutionTimeline(result.documentId);
          traceCreditConflictApplyOrder("timeline_session_reset_called", {
            documentId: result.documentId,
            note: "resetCreditConflictResolutionTimeline does not clear pendingConflictAmortRef",
            pendingRefUnchanged: readPendingConflictAmortRef(),
            pendingRefBeforeTimelineReset: pendingRefBeforeAssign,
          });

          pendingConflictAmortRef.current = {
            extraction: amort,
            documentId: result.documentId,
          };

          const refImmediateAfterAssign = readPendingConflictAmortRef();
          traceCreditConflictApplyOrder("pending_ref_immediately_after_assign", {
            documentId: result.documentId,
            refImmediate: refImmediateAfterAssign,
            assignMatchesDocumentId:
              pendingConflictAmortRef.current?.documentId === result.documentId,
            assignHasExtraction: pendingConflictAmortRef.current?.extraction != null,
          });

          traceCreditConflictResolutionPendingAssigned({
            documentId: result.documentId,
            extraction: amort,
            refImmediate: refImmediateAfterAssign,
          });

          traceCreditConflictApplyOrder("pending_ref_after_timeline_stage2_log", {
            documentId: result.documentId,
            refImmediate: readPendingConflictAmortRef(),
          });

          traceTimeline("business_decision_selected", result.documentId, {
            decision: "conflict_detected",
            reason: amountConflicts
              ? "amount_mismatch"
              : durationConflicts
                ? "duration_mismatch"
                : "remaining_principal_mismatch",
          });
          const entityLabel = sessionOffer.bankName ?? "Financement";
          const entityId = `credit-${entityLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

          const conflictingFields: string[] = [];
          const previousValues: Record<string, string> = {};
          const nextValues: Record<string, string> = {};

          if (amountConflicts && existAmount != null && amortAmount != null) {
            conflictingFields.push("Montant");
            previousValues["Montant"] = `${existAmount.toLocaleString("fr-FR")} €`;
            nextValues["Montant"] = `${amortAmount.toLocaleString("fr-FR")} €`;
          }
          if (durationConflicts && existDuration != null && amortDuration != null) {
            conflictingFields.push("Durée");
            previousValues["Durée"] = `${existDuration} mois`;
            nextValues["Durée"] = `${amortDuration} mois`;
          }
          traceCreditConflictApplyOrder("before_conflict_detected_dispatch", {
            documentId: result.documentId,
            pendingRef: readPendingConflictAmortRef(),
            conflictingFieldsCount: conflictingFields.length,
            conflictingFields,
            onlyRemainingPrincipalConflict:
              remainingConflicts && !amountConflicts && !durationConflicts,
          });

          console.log("[ai-event-created] conflict_detected (amortization vs session)", {
            documentId: result.documentId,
            conflictingFields,
          });
          const conflictEvent = makeConflictDetectedEvent(
            "financement",
            entityId,
            entityLabel,
            result.documentId,
            conflictingFields,
            previousValues,
            nextValues,
            "Le document importé contient des données différentes de celles déjà enregistrées.",
          );
          measureCreditRenderUnblockSync(
            "dispatch_ADD_AI_ACTIVITY_EVENT_conflict",
            () => {
              dispatch({
                type: "ADD_AI_ACTIVITY_EVENT",
                event: conflictEvent,
              });
            },
            { eventId: conflictEvent.id },
          );

          markCreditRenderUnblockAnchor("after_conflict_detected_dispatch", result.documentId);

          traceCreditConflictResolution("conflict_detected_dispatched", {
            documentId: result.documentId,
            eventId: conflictEvent.id,
            conflictingFields,
            refImmediate: readPendingConflictAmortRef(),
          });
          traceTimeline("conflict_event_dispatched", result.documentId);

          traceCreditConflictApplyOrder("after_conflict_detected_dispatch", {
            documentId: result.documentId,
            pendingRef: readPendingConflictAmortRef(),
          });

          const sessionForRestore: CreditExtractionSession = extractionSessionRef.current.loanOffer
            ? extractionSessionRef.current
            : { loanOffer: sessionOffer };

          traceCreditConflictApplyOrder("before_conflict_post_restore_hydration", {
            documentId: result.documentId,
            pendingRef: readPendingConflictAmortRef(),
            sessionForRestoreHasAmortization: Boolean(sessionForRestore.amortization),
          });

          measureCreditRenderUnblockSync(
            "commitCreditFormHydration_conflict_restore",
            () => {
              commitCreditFormHydration(sessionForRestore);
            },
            { documentId: result.documentId },
          );

          traceCreditRenderUnblock("applyPipelineResult_conflict_path_return", {
            documentId: result.documentId,
          });

          traceCreditConflictApplyOrder("early_return_conflict_path_complete", {
            documentId: result.documentId,
            pendingRefAfterRestoreHydration: readPendingConflictAmortRef(),
            note: "pendingConflictAmortRef must remain set until user resolves conflict",
          });

          return;
        }

        traceCreditConflictApplyOrder("early_return_amortization_enrichment_path", {
          documentId: result.documentId,
          pendingRef: readPendingConflictAmortRef(),
          reason: "no_material_conflict_with_session_offer",
        });
      }

      if (!options.allowPrefill) {
        traceTimeline("business_decision_selected", result.documentId, {
          decision: "prefill_skipped",
        });
        return;
      }

      const nextSession = mergeCreditExtractionSession(
        extractionSessionRef.current,
        kind,
        extraction,
        { documentId: result.documentId },
      );
      const prefill = commitCreditFormHydration(nextSession, {
        documentId: result.documentId,
        governedKind: kind,
      });

      // ── Resolve entity label from extracted bank name ──────────────────────
      const bankName = prefill.nextValues.loans[0]?.bank?.trim() || "Financement";
      const entityId = `credit-${bankName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

      // ── Detect merge when amortization is added on top of an existing loan offer ─
      const sessionHasBothDocTypes = Boolean(
        nextSession.loanOffer && nextSession.amortization?.installments?.length,
      );
      const isFirstAmortizationOnKnownOffer =
        kind === "amortization" && Boolean(nextSession.loanOffer);

      if (isFirstAmortizationOnKnownOffer && sessionHasBothDocTypes) {
        dispatch({
          type: "ADD_AI_ACTIVITY_EVENT",
          event: makeEntityMergeEvent(
            "financement",
            entityId,
            bankName,
            [result.documentId],
            "L'IA a identifié que ce document concerne le même financement que l'offre de prêt déjà analysée.",
          ),
        });
      }

      // ── Detect conflict if financing already confirmed ─────────────────────
      const existing = options.existingFinancing;
      if (existing && kind === "loan_offer") {
        const existingLoan = existing.loans[0];
        const newBorrowedAmount = Number(prefill.nextValues.loans[0]?.borrowedAmount) || 0;
        const existingBorrowedAmount = existingLoan?.borrowedAmount || 0;
        const newRate = Number(prefill.nextValues.loans[0]?.rate) || 0;
        const existingRate = existingLoan?.rate || 0;
        const newDuration = Number(prefill.nextValues.loans[0]?.durationMonths) || 0;
        const existingDuration = existingLoan?.durationMonths || 0;
        const amountDiff = Math.abs(newBorrowedAmount - existingBorrowedAmount);
        const rateDiff = Math.abs(newRate - existingRate);
        const durationDiff = Math.abs(newDuration - existingDuration);

        if (amountDiff > 500 || rateDiff > 0.05 || durationDiff > 3) {
          const conflictingFields: string[] = [];
          const previousValues: Record<string, string> = {};
          const nextValues: Record<string, string> = {};

          if (rateDiff > 0.05) {
            conflictingFields.push("Taux");
            previousValues["Taux"] = `${existingRate.toFixed(2).replace(".", ",")} %`;
            nextValues["Taux"] = `${newRate.toFixed(2).replace(".", ",")} %`;
          }
          if (durationDiff > 3) {
            conflictingFields.push("Durée");
            previousValues["Durée"] = `${existingDuration} mois`;
            nextValues["Durée"] = `${newDuration} mois`;
          }
          if (amountDiff > 500) {
            conflictingFields.push("Montant");
            previousValues["Montant"] = `${existingBorrowedAmount.toLocaleString("fr-FR")} €`;
            nextValues["Montant"] = `${newBorrowedAmount.toLocaleString("fr-FR")} €`;
          }

          console.log("[ai-event-created] conflict_detected", { documentId: result.documentId, conflictingFields });
          dispatch({
            type: "ADD_AI_ACTIVITY_EVENT",
            event: makeConflictDetectedEvent(
              "financement",
              entityId,
              bankName,
              result.documentId,
              conflictingFields,
              previousValues,
              nextValues,
              "Le document importé contient des données différentes de celles déjà enregistrées.",
            ),
          });
        }
      } else {
        // Scenario B — enrichment. Include business-relevant summary inline.
        const titleMap: Record<string, string> = {
          loan_offer: "Offre de prêt analysée",
          amortization: "Tableau enrichi",
        };
        const descMap: Record<string, string> = {
          loan_offer: "L'IA a extrait les conditions du financement depuis l'offre de prêt.",
          amortization:
            "L'IA a détecté le détail des échéances mensuelles du prêt.",
        };

        // Compute business summary for amortization enrichment
        let businessSummary: string | undefined;
        if (kind === "amortization") {
          const annualInterestRaw = prefill.nextValues.summary.annualInterest;
          const annualInterest = Number(annualInterestRaw);
          if (annualInterest > 0) {
            businessSummary = `Intérêts ${revenueYear} mis à jour : ${annualInterest.toLocaleString("fr-FR")} €`;
          }
        }

        console.log("[ai-event-created] document_enriched", { documentId: result.documentId, kind, businessSummary });
        dispatch({
          type: "ADD_AI_ACTIVITY_EVENT",
          event: makeDocumentEnrichedEvent(
            "financement",
            entityId,
            bankName,
            result.documentId,
            titleMap[kind]!,
            descMap[kind]!,
            businessSummary ? { businessSummary } : undefined,
          ),
        });
        traceTimeline("business_decision_selected", result.documentId, {
          decision: kind === "amortization" ? "document_enriched" : "document_enriched_or_conflict",
          kind,
        });
      }

      setDetectedLoansCount(
        suggestsMultipleLoans(result.fileName)
          ? Math.max(2, prefill.nextValues.loans.length)
          : Math.max(1, prefill.nextValues.loans.length),
      );

      // ── FIX D: When enrichment happens while confirmed, surface the form ─────
      // The configured card hides the updated extraction form. Force edit mode
      // so the user can see the newly enriched data and re-confirm.
      if (confirmed && kind === "amortization") {
        setIsEditing(true);
        setVisibleSections(2);
        skipRevealAnimationRef.current = true;
      }

    },
    [
      dispatch,
      commitCreditFormHydration,
      userValidatedFields,
      revenueYear,
      confirmed,
      draft,
      traceTimeline,
      readPendingConflictAmortRef,
    ],
  );

  const runAnalysis = useCallback(
    async (documentId: string) => {
      if (analyzingRef.current) {
        traceTimeline("analysis_started", documentId, { skipped: true, reason: "already_analyzing" });
        return;
      }
      const document = workspace.documents.find((doc) => doc.id === documentId);
      if (!document) return;

      analysisFailedRef.current = false;
      analyzingRef.current = true;
      markExecution("document_upload");
      allowPrefillAtExecutionStartRef.current = true;
      setIsExecutionRunning(true);
      dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "processing" });

      traceTimeline("analysis_started", documentId, { fileName: document.fileName });

      traceCreditRunAnalysisSegment("started", { documentId });

      try {
        const pipelineStartedAt = performance.now();
        const result = await runCreditDocumentPipeline({
          document,
          getFile,
          fiscalYear: workspace.fiscalYear.year,
        });
        traceCreditRunAnalysisSegment("await_runCreditDocumentPipeline", {
          documentId,
          durationMs: Math.round((performance.now() - pipelineStartedAt) * 100) / 100,
        });
        logCreditExtractionPipelineResult(result, "pre_apply_pipeline_result");
        traceTimeline("coherence_started", documentId);
        traceTimeline("coherence_finished", documentId);
        measureCreditRenderUnblockSync(
          "applyPipelineResult",
          () => {
            applyPipelineResult(result, {
              allowPrefill: allowPrefillAtExecutionStartRef.current,
              existingFinancing: draft?.creditFinancing,
            });
          },
          { documentId },
        );
        traceCreditRunAnalysisSegment("try_block_complete", { documentId });
      } catch (err) {
        analysisFailedRef.current = true;
        console.error("[CreditDocumentStep] GPT pipeline failed", err);
        traceTimeline("coherence_finished", documentId, {
          pipelineError: err instanceof Error ? err.message : String(err),
        });
        dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "failed" });
        traceCreditRunAnalysisSegment("catch", {
          documentId,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        measureCreditRenderUnblockSync(
          "finalize_in_runAnalysis_finally",
          () => {
            finalizeCreditAnalysisExecution(documentId);
          },
          { documentId },
        );
        setAnalysisIdleTick((tick) => tick + 1);
        traceCreditRunAnalysisSegment("finally_complete", { documentId });
      }
    },
    [
      workspace.documents,
      workspace.fiscalYear.year,
      getFile,
      dispatch,
      applyPipelineResult,
      finalizeCreditAnalysisExecution,
      markExecution,
      draft?.creditFinancing,
      traceTimeline,
    ],
  );

  const handleAiAnimationComplete = useCallback(() => {
    if (!isExecutionRunning) setAiAnimationDone(true);
  }, [isExecutionRunning]);

  useEffect(() => {
    if (passiveSyncedRef.current) return;
    passiveSyncedRef.current = true;
    extractionSessionRef.current = draft?.creditGptSession ?? {};

    if (draft?.creditDocumentId || draft?.creditConfirmedAt) setHasUploaded(true);

    const restored = restoreCreditFormPassive(draft, revenueYear);
    const validated = readCreditUserValidatedFields(draft);
    if (!isCreditFormEmpty(restored)) {
      setFormValues(restored);
      setUserValidatedFields(validated);
      prefillAppliedRef.current = true;

      if (
        hasPersistedCreditExtraction(draft) &&
        draft?.creditWorkspaceForm &&
        JSON.stringify(draft.creditWorkspaceForm) !== JSON.stringify(restored)
      ) {
        dispatch({
          type: "DECLARATION_PATCH_DRAFT",
          patch: creditWorkspaceFormPatch(restored),
        });
      }
    }

    const hasSession =
      Boolean(draft?.creditGptSession) && hasCreditExtractionSession(draft.creditGptSession ?? {});
    if (hasPersistedCreditExtraction(draft) || draft?.creditConfirmedAt || hasSession) {
      setAiAnimationDone(true);
      setVisibleSections(2);
      skipRevealAnimationRef.current = true;
    }

    endPassiveHydration();
  }, [draft, dispatch, endPassiveHydration, revenueYear]);

  useLayoutEffect(() => {
    prevShowExtractionFormRef.current = showExtractionForm;
    if (!showExtractionForm || prefillAppliedRef.current) return;

    const pending = pendingFormPrefillRef.current;
    const session = extractionSessionRef.current;
    let sessionHydrated: CreditFormValues | null = null;
    if (hasCreditExtractionSession(session)) {
      const hydrated = hydrateCreditFormFromSession({
        session,
        revenueYear,
        userValidatedFields,
      }).nextValues;
      if (!isCreditFormEmpty(hydrated)) {
        sessionHydrated = hydrated;
      }
    }

    const source =
      pending && !isCreditFormEmpty(pending)
        ? pending
        : sessionHydrated && !isCreditFormEmpty(sessionHydrated)
          ? sessionHydrated
          : null;

    if (!source) {
      prefillAppliedRef.current = true;
      pendingFormPrefillRef.current = null;
      return;
    }

    prefillAppliedRef.current = true;
    pendingFormPrefillRef.current = null;
    setFormValues(source);
    if (pendingUncertainFieldsRef.current.length > 0) {
      setUncertainFields(pendingUncertainFieldsRef.current);
    }
  }, [showExtractionForm, revenueYear, userValidatedFields]);

  useEffect(() => {
    if (!showExtractionForm) return;
    if (skipRevealAnimationRef.current) {
      setVisibleSections(2);
      skipRevealAnimationRef.current = false;
      return;
    }
    if (visibleSections >= 2) return;

    const timers = SECTION_REVEAL_DELAYS_MS.map((delay, index) =>
      window.setTimeout(() => setVisibleSections(index + 1), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [showExtractionForm, visibleSections]);

  // When the form gate opens with data, ensure sections are visible (avoid empty shell).
  useEffect(() => {
    if (!showExtractionForm || !hasFinancingData) return;
    if (visibleSections >= 2) return;
    setVisibleSections(2);
    skipRevealAnimationRef.current = true;
  }, [showExtractionForm, hasFinancingData, visibleSections]);

  useEffect(() => {
    if (!confirmed) return;
    setHasUploaded(true);
    setValidatedSuccess(true);
    setIsEditing(false);
    setAiAnimationDone(true);
    setFormValues(restoreCreditFormPassive(draft, revenueYear));
    setVisibleSections(2);
    setUncertainFields([]);
    setDetectedLoansCount(draft?.creditFinancing?.loans.length ?? 1);
  }, [confirmed, draft]);

  useEffect(() => {
    if (!pendingUploadRef.current || !creditDoc) return;
    pendingUploadRef.current = false;
    if (draft?.creditDocumentId !== creditDoc.id) {
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: { creditDocumentId: creditDoc.id, creditDeclaredNoneAt: undefined },
      });
    }
    setNoCreditDeclared(false);
  }, [creditDoc, draft?.creditDocumentId, dispatch]);

  // ── Analysis trigger: watch the specific document we just uploaded ────────────
  // This replaces the old "watch creditDoc.status" approach which only watched
  // draft.creditDocumentId (= upload 1, already analyzed). Upload 2, 3, etc.
  // were never seen by the old effect.
  useEffect(() => {
    const pendingDocId = latestUploadedDocIdRef.current;
    if (!pendingDocId) return;

    if (analyzingRef.current) {
      traceTimeline("upload_queued", pendingDocId, { waiting: true, reason: "analyzing_in_progress" });
      return;
    }

    const doc = workspace.documents.find((d) => d.id === pendingDocId);
    if (!doc) return;
    if (doc.status !== "uploaded") return;
    if (!executionPendingRef.current) return;

    // Queued by handleUpload / handleRetry — do not gate on passive hydration.
    markExecution("document_upload");

    console.log("[ai-event-pipeline] analysis triggered", {
      docId: pendingDocId,
      fileName: doc.fileName,
      category: doc.category,
      trigger: "latestUploadedDocIdRef",
    });

    latestUploadedDocIdRef.current = null;
    executionPendingRef.current = false;
    void runAnalysis(doc.id);
  }, [workspace.documents, runAnalysis, markExecution, analysisIdleTick]);

  async function handleUpload(files: File[]) {
    if (!files.length) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      alert("Utilisateur non connecté");
      return;
    }

    const { files: uploadedFiles, documentIds } = await uploadFilesForUser(files, user.id);
    if (uploadedFiles.length === 0) return;

    // The Supabase-assigned ID — must match what goes into UPLOAD_DOCUMENTS so local
    // and remote IDs are identical from the start, preventing reconciliation from
    // dropping the document and re-inferring its category as "autre".
    const newDocumentId = documentIds[0] ?? null;
    resetCreditRenderUnblockAnchor();
    resetCreditConflictApplyTrace(newDocumentId);
    traceCreditConflictApplyOrder("upload_handleUpload", {
      documentId: newDocumentId,
      pendingRefAtUpload: snapshotPendingConflictAmortRef(pendingConflictAmortRef.current),
      note: "handleUpload does not clear pendingConflictAmortRef",
    });
    resetCreditAnalysisTimeline(newDocumentId);
    traceCreditAnalysisTimeline("upload_received", newDocumentId, buildTimelineSnapshot(), {
      fileName: files[0]?.name,
    });

    const uploadKind = classifyCreditFileName(files[0]!.name);
    const existingSession = extractionSessionRef.current ?? draft?.creditGptSession ?? {};
    const hasAmortizationTruth = Boolean(existingSession.amortization?.installments?.length);
    const isSupplementaryLoanOffer = uploadKind === "loan_offer" && hasAmortizationTruth;

    setNoCreditDeclared(false);
    setValidatedSuccess(false);
    setHasUploaded(true);
    pendingUploadRef.current = true;
    executionPendingRef.current = true;
    // Track this exact document ID for the analysis trigger (replaces creditDoc heuristic)
    latestUploadedDocIdRef.current = newDocumentId;
    prefillAppliedRef.current = false;
    pendingFormPrefillRef.current = null;
    markExecution("document_upload");
    traceCreditAnalysisTimeline("upload_queued", newDocumentId, buildTimelineSnapshot(), {
      uploadKind,
    });

    if (isSupplementaryLoanOffer) {
      extractionSessionRef.current = existingSession;
      setAiAnimationDone(false);
      skipRevealAnimationRef.current = true;
    } else {
      setAiAnimationDone(false);
      setVisibleSections(0);
      setUncertainFields([]);
      setUserValidatedFields({});
      setFormValues(emptyCreditFormValues());
      skipRevealAnimationRef.current = false;

      // Always preserve the existing loanOffer extraction across all upload types.
      // For loan_offer uploads: the new extraction will REPLACE it (or merge if same loan).
      // For amortization uploads: the new amortization merges with the existing offer.
      // Without this, uploading a "signature" page (no new data) clears the session,
      // and the !extraction fallback has nothing to restore from — form goes empty.
      const preservedLoanOffer = existingSession.loanOffer;
      extractionSessionRef.current = preservedLoanOffer ? { loanOffer: preservedLoanOffer } : {};

      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: {
          creditWorkspaceForm: undefined,
          creditGptSession: preservedLoanOffer ? { loanOffer: preservedLoanOffer } : undefined,
          creditUserValidatedFields: {},
        },
      });
    }

    // Pass the Supabase-assigned documentId so local and Supabase UUIDs match.
    // Without this, reconcileWorkspaceDocuments drops the local doc (id mismatch)
    // and re-creates it with category inferred from filename — which returns "autre"
    // for filenames like "SIGNATURE-OFFRE-DE-CREDIT.pdf".
    dispatch({
      type: "UPLOAD_DOCUMENTS",
      files: uploadedFiles.map((file, i) => ({
        file,
        category: CREDIT_UPLOAD_CATEGORY,
        documentId: documentIds[i],
      })),
    });

    if (draft?.creditDeclaredNoneAt) {
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: { creditDeclaredNoneAt: undefined },
      });
    }

    showInfo(
      `${uploadedFiles.length} fichier${uploadedFiles.length > 1 ? "s" : ""} reçu${uploadedFiles.length > 1 ? "s" : ""}`,
      "L'IA analyse vos documents de prêt.",
    );
  }

  function handleFormChange(next: CreditFormValues) {
    const editedKeys: CreditPrefillFieldKey[] = [];
    const prevLoan = formValues.loans[0];
    const nextLoan = next.loans[0];

    for (const key of [
      "bank",
      "loanType",
      "borrowedAmount",
      "rate",
      "durationMonths",
      "monthlyPayment",
      "insurance",
      "deferralType",
      "loanApplicationFees",
      "loanGuaranteeFees",
      "firstPaymentDate",
      "remainingCapital",
    ] as CreditFieldKey[]) {
      if (String(prevLoan?.[key] ?? "").trim() !== String(nextLoan?.[key] ?? "").trim()) {
        editedKeys.push(key);
      }
    }

    for (const key of ["annualInterest", "annualInsurance", "remainingCapital"] as const) {
      if (formValues.summary[key].trim() !== next.summary[key].trim()) editedKeys.push(key);
    }

    const nextValidated =
      editedKeys.length > 0
        ? mergeCreditUserValidatedFields(userValidatedFields, editedKeys)
        : userValidatedFields;

    if (editedKeys.length > 0) {
      setUserValidatedFields(nextValidated);
    }

    const store = readGovernedFieldStore(draft);
    const lockedStore = lockCreditFormFieldEdits(store, formValues, next);
    const patch: Record<string, unknown> = {
      ...creditWorkspaceFormPatch(next),
      creditUserValidatedFields: nextValidated,
    };
    if (JSON.stringify(lockedStore) !== JSON.stringify(store)) {
      patch.governedFields = lockedStore;
    }

    dispatch({ type: "DECLARATION_PATCH_DRAFT", patch });
    setFormValues(next);
  }

  function handleRetry() {
    if (!creditDoc) return;
    prefillAppliedRef.current = false;
    pendingFormPrefillRef.current = null;
    setAiAnimationDone(false);
    setVisibleSections(0);
    skipRevealAnimationRef.current = false;
    executionPendingRef.current = true;
    // Use the direct-ID trigger so the retry effect uses the same path as new uploads
    latestUploadedDocIdRef.current = creditDoc.id;
    markExecution("reanalyze");
    dispatch({ type: "DOCUMENT_SET_STATUS", documentId: creditDoc.id, status: "uploaded" });
  }

  function handleManualContinue() {
    setAiAnimationDone(true);
    setVisibleSections(2);
    skipRevealAnimationRef.current = true;
    setFormValues(restoreCreditFormPassive(draft, revenueYear));
    setUncertainFields([]);
    setDetectedLoansCount(1);
  }

  function handleNoCredit() {
    setNoCreditDeclared(true);
    dispatch({ type: "DECLARE_NO_CREDIT" });
    showInfo("Aucun financement", "Vous pourrez ajouter vos documents de prêt à tout moment.");
  }

  function handleConfirm() {
    const financing = formValuesToFinancing(formValues, revenueYear);
    const bankName = formValues.loans[0]?.bank?.trim() || "Financement";
    const entityId = `credit-${bankName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

    dispatch({
      type: "CONFIRM_CREDIT_FINANCING",
      financing,
      documentId: creditDoc?.id,
    });

    dispatch({
      type: "ADD_AI_ACTIVITY_EVENT",
      event: makeValidationEvent(
        "financement",
        entityId,
        bankName,
        "Les informations du financement ont été vérifiées et enregistrées.",
      ),
    });

    setValidatedSuccess(true);
    setIsEditing(false);
    showSuccess(
      "Financement configuré",
      "Vos données seront réutilisées pour les amortissements, les charges et les prochaines déclarations.",
    );
  }

  const handleConflictKeepExisting = useCallback(() => {
    const sessionOffer =
      extractionSessionRef.current.loanOffer ?? draft?.creditGptSession?.loanOffer;
    if (!sessionOffer) return;
    clearPendingConflictAmortRef("user_keep_existing", "handleConflictKeepExisting");
    commitCreditFormHydration({ loanOffer: sessionOffer });
    setIsEditing(true);
    setAiAnimationDone(true);
  }, [clearPendingConflictAmortRef, commitCreditFormHydration, draft?.creditGptSession?.loanOffer]);

  const handleConflictUseNew = useCallback(
    (eventId?: string) => {
      const pending = pendingConflictAmortRef.current;
      const sessionOffer =
        extractionSessionRef.current.loanOffer ?? draft?.creditGptSession?.loanOffer;

      traceCreditConflictResolution("handle_conflict_use_new_clicked", {
        eventId: eventId ?? null,
        documentId: pending?.documentId ?? null,
        hasPending: Boolean(pending),
        hasSessionOffer: Boolean(sessionOffer),
        aborted: !pending || !sessionOffer,
        abortReason: !pending
          ? "pendingConflictAmortRef_empty"
          : !sessionOffer
            ? "session_offer_missing"
            : null,
      });

      if (!pending || !sessionOffer) return;

      const baseSession: CreditExtractionSession = extractionSessionRef.current.loanOffer
        ? extractionSessionRef.current
        : { loanOffer: sessionOffer };
      const nextSession = mergeCreditExtractionSession(
        baseSession,
        "amortization",
        pending.extraction,
        { documentId: pending.documentId },
      );
      traceCreditConflictResolutionMerge({
        documentId: pending.documentId,
        baseSession,
        extraction: pending.extraction,
        mergedSession: nextSession,
      });
      clearPendingConflictAmortRef("user_use_new_after_merge", "handleConflictUseNew");
      commitCreditFormHydration(nextSession, {
        documentId: pending.documentId,
        governedKind: "amortization",
        conflictResolutionTrace: true,
      });
      setIsEditing(true);
      setAiAnimationDone(true);
    },
    [clearPendingConflictAmortRef, commitCreditFormHydration, draft?.creditGptSession?.loanOffer],
  );

  function handleViewEnrichmentDetails() {
    if (hasCreditExtractionSession(extractionSessionRef.current)) {
      commitCreditFormHydration(extractionSessionRef.current);
    }
    setIsEditing(true);
  }

  const incomplete = isCreditProfileIncomplete(formValues);
  const displayInstallments =
    formValues.installments?.length
      ? formValues.installments
      : (draft?.creditGptSession?.amortization?.installments ?? []);

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <WorkflowPageBackLink />

      <div className="w-full space-y-3 [&>section]:!mx-0 [&>section]:!w-full [&>section]:!max-w-none">
        <CreditHero
          onFiles={handleUpload}
          uploadState={hasUploaded ? "uploaded" : "idle"}
          uploadedFileName={creditDoc?.fileName}
          uploadedCount={Math.max(uploadedCount, hasUploaded ? 1 : 0)}
          detectedLoansCount={detectedLoansCount}
          showNoCreditLink={showInitialExtras}
          onNoCredit={handleNoCredit}
        />
      </div>

      {/* ── Zone 2: Persistent AI insight cards ─────────────────────────────────
          Each uploaded document permanently creates a visible explanatory card.
          Cards survive refresh, remount, navigation, and hydration.
          ALWAYS rendered — the panel self-hides (returns null) when empty, so
          there is no blank space during the first upload's animation. For all
          subsequent uploads, previously created cards remain visible while the
          new document is being processed. */}
      <AiInsightCardsPanel
        events={workspace.aiActivityFeed ?? []}
        step="financement"
        onReimport={handleRetry}
        onConflictUseNew={(eventId) => handleConflictUseNew(eventId)}
        onConflictKeepExisting={() => handleConflictKeepExisting()}
      />

      {showConfiguredCard ? (
        <>
          <ConfiguredDossierCard
            title="✓ Crédit configuré"
            rows={
              noCreditDeclared && !confirmed
                ? [{ label: "Statut", value: "Aucun financement déclaré" }]
                : buildCreditConfiguredSummary(formValues, detectedLoansCount).rows
            }
            footnote={
              noCreditDeclared && !confirmed
                ? "Vous pourrez déposer vos documents de prêt à tout moment."
                : buildCreditConfiguredSummary(formValues, detectedLoansCount).footnote
            }
            onEdit={() => {
              setIsEditing(true);
              if (noCreditDeclared && !hasUploaded) {
                setNoCreditDeclared(false);
                dispatch({
                  type: "DECLARATION_PATCH_DRAFT",
                  patch: { creditDeclaredNoneAt: undefined },
                });
                return;
              }
              setVisibleSections(2);
              skipRevealAnimationRef.current = true;
              setFormValues(restoreCreditFormPassive(draft, revenueYear));
              setDetectedLoansCount(draft?.creditFinancing?.loans.length ?? 1);
            }}
          />
          <WorkflowProgressionActions currentStepId="credit" />
        </>
      ) : null}

      {/* ── FIX B: Show animation whenever doc is processing (survives remount) ─ */}
      {showAnimation ? (
        <ActiviteAiProcessing onComplete={handleAiAnimationComplete} steps={CREDIT_AI_STEPS} />
      ) : null}

      {showExtractionForm ? (
        <CreditFinancingFields
          values={formValues}
          onChange={handleFormChange}
          revenueYear={revenueYear}
          installments={displayInstallments}
          showIncompleteWarning={incomplete}
          onConfirm={handleConfirm}
          cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
          visibleSections={visibleSections}
          uncertainFields={uncertainFields}
          showConfirm={visibleSections >= 2}
        />
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
            Certaines informations n&apos;ont pas pu être détectées automatiquement.
          </p>
          <p className="mt-3" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Essayez une autre version du document ou complétez les champs manuellement.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button onClick={handleRetry}>Réessayer l&apos;import</Button>
            <Button variant="secondary" onClick={handleManualContinue}>
              Compléter manuellement
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── Layer B: AI Activity History Feed ────────────────────────────────────
          Persistent dossier memory. Shows all events for this step.
          Intentionally below business results — this is the historical log. */}
      <AiActivityFeed
        events={workspace.aiActivityFeed}
        step="financement"
        onReimport={() => handleRetry()}
      />

      {/* ── Dev: Workflow Inspector ───────────────────────────────────────────── */}
      <WorkflowInspector
        phase={workflowPhase}
        blockers={blockers}
        localState={{
          hasUploaded,
          noCreditDeclared,
          aiAnimationDone,
          visibleSections,
          isEditing,
          isExecutionRunning,
          validatedSuccess,
          detectedLoansCount,
          uncertainFields: uncertainFields.length,
        }}
        derivedState={{
          confirmed,
          docStatus: creditDoc?.status ?? "—",
          docIsProcessing,
          anyCreditDocProcessing,
          showAnimation,
          isFailed,
          showConfiguredCard,
          showExtractionForm,
          showInitialExtras,
          hasFinancingData,
          formEmpty: isCreditFormEmpty(formValues),
          incomplete,
        }}
        refs={{
          analyzingRef: analyzingRef.current,
          executionPendingRef: executionPendingRef.current,
          pendingUploadRef: pendingUploadRef.current,
          prefillAppliedRef: prefillAppliedRef.current,
          skipRevealAnimationRef: skipRevealAnimationRef.current,
          sessionKeys: Object.keys(extractionSessionRef.current).join(", ") || "empty",
        }}
        events={workspace.aiActivityFeed ?? []}
        step="financement"
        hydrationSource={
          draft?.creditConfirmedAt
            ? "confirmed"
            : hasPersistedCreditExtraction(draft)
              ? "draft-session"
              : "execution"
        }
      />
    </div>
  );
}
