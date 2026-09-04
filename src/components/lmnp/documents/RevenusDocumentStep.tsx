"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadFilesForUser } from "@/lib/uploadDocument";
import { supabase } from "@/lib/supabase";
import { Button } from "@/design-system/components/Button";
import { ActiviteAiProcessing } from "@/components/lmnp/activite/ActiviteAiProcessing";
import { DOCUMENT_WORKFLOW_CARD_STYLE } from "@/components/lmnp/documents/document-workflow-shared";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { RevenusHero } from "@/components/lmnp/revenus/RevenusHero";
import { RevenusPropertyGridCards } from "@/components/lmnp/revenus/RevenusPropertyGridCards";
import { RevenueSupervisionCard } from "@/components/lmnp/revenus/RevenueSupervisionCard";
import { RevenusSummaryCard } from "@/components/lmnp/revenus/RevenusSummaryCard";
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
import { useTunnelHydration } from "@/lib/lmnp/hydration";
import { buildRevenusConfiguredSummary } from "@/lib/lmnp/services/configured-dossier-summaries";
import { countRevenusDocuments, resolveRevenusDocuments } from "@/lib/lmnp/services/revenus-profile";
import {
  createEmptyRevenueSession,
  gridSummary,
  hasRevenueSessionData,
  sessionFromPipelineLines,
  sessionToExtractionData,
} from "@/lib/lmnp/services/revenue-gpt-ui-prefill";
import {
  hasPersistedRevenueSession,
  restoreRevenueSessionPassive,
  revenueSessionPatch,
} from "@/lib/lmnp/services/passive-form-restore";
import {
  REVENUE_OCR_READ_FAILURE_MESSAGE,
  runRevenusDocumentPipeline,
} from "@/lib/lmnp/services/revenus-document-pipeline";
import { buildRevenusAssistantFromSession } from "@/lib/lmnp/services/revenus-upload-to-assistant-bridge";
import { isRevenusMockEnabled } from "@/lib/lmnp/services/revenus-mock";
import {
  inferSessionRenderOrigin,
  logRevenueGridSource,
  logRevenueHydrationBranch,
  logRevenueRenderOrigin,
  logRevenueRuntimeStage,
  logRevenueSourceOfTruth,
  resolveHydrationBranch,
} from "@/lib/lmnp/services/revenus-runtime-trace";
import {
  makeDocumentEnrichedEvent,
  makeAnalysisFailedEvent,
  makeValidationEvent,
} from "@/lib/lmnp/services/ai-activity-events";
import { AiActivityFeed } from "@/components/lmnp/ai-activity";
import { useLmnp } from "@/lib/lmnp/store";
import type { TunnelStepProps } from "@/components/lmnp/documents/frozen-tunnel-step";
import type { RevenueGptSession } from "@/lib/lmnp/types";
import type { RevenueSupervisionStatus } from "@/lib/lmnp/services/revenue-supervision";

const REVENUS_UPLOAD_CATEGORY = "revenus" as const;

const REVENUS_AI_STEPS = [
  "Sources détectées",
  "Lecture du document (PDF / OCR)",
  "Extraction ligne par ligne",
  "Suggestions mensuelles",
] as const;

function shouldDisplayRevenueGrid(session: RevenueGptSession, ocrReadFailure: boolean): boolean {
  if (ocrReadFailure) return false;
  if (session.meta?.gridSource === "mock_lines" && !isRevenusMockEnabled()) return false;
  if (session.mode === "manual") return true;
  return (
    session.meta?.gridSource === "ocr_lines" ||
    session.meta?.gridSource === "user_manual" ||
    session.meta?.gridSource === "persisted_session" ||
    hasRevenueSessionData(session)
  );
}

export function RevenusDocumentStep({ isActive = true }: TunnelStepProps) {
  const { workspace, dispatch, getFile } = useLmnp();
  const { showSuccess, showInfo } = useFeedback();
  const router = useRouter();
  const {
    markExecution,
    clearExecution,
    endPassiveHydration,
    shouldRunExtraction,
    shouldApplyPrefill,
  } = useTunnelHydration("revenus");

  const analyzingRef = useRef(false);
  const pendingUploadRef = useRef(false);
  const executionPendingRef = useRef(false);
  const passiveSyncedRef = useRef(false);
  const sessionRef = useRef<RevenueGptSession | null>(null);

  const draft = workspace.declarationDraft;
  const confirmed = Boolean(draft?.revenusConfirmedAt);
  const fiscalYear = workspace.fiscalYear.year;

  // Cycle 15A — anti double-comptage : si les revenus ont déjà été validés via
  // l'assistant conversationnel (draft.revenusAssistant posé sans être jamais
  // passé par ce tunnel d'upload), ce canal se verrouille en lecture seule au
  // lieu de permettre un second calcul en parallèle.
  const lockedByOtherChannel = Boolean(draft?.revenusAssistant) && !draft?.revenusExtraction;

  const revenusDocs = useMemo(
    () => resolveRevenusDocuments(workspace.documents, draft?.revenusDocumentIds),
    [workspace.documents, draft?.revenusDocumentIds],
  );
  const uploadedCount = useMemo(
    () => countRevenusDocuments(workspace.documents, draft?.revenusDocumentIds),
    [workspace.documents, draft?.revenusDocumentIds],
  );
  const latestDoc = revenusDocs[0];

  const [hasUploaded, setHasUploaded] = useState(
    () => Boolean(draft?.revenusDocumentIds?.length || draft?.revenusConfirmedAt),
  );
  const [aiAnimationDone, setAiAnimationDone] = useState(
    () =>
      hasPersistedRevenueSession(draft) ||
      Boolean(draft?.revenusConfirmedAt) ||
      draft?.revenueGptSession?.mode === "manual",
  );
  const [validatedSuccess, setValidatedSuccess] = useState(() => confirmed);
  const [isEditing, setIsEditing] = useState(false);
  const [isExecutionRunning, setIsExecutionRunning] = useState(false);
  const [ocrReadFailure, setOcrReadFailure] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [extractionSupervision, setExtractionSupervision] = useState<
    RevenueSupervisionStatus | undefined
  >(() => draft?.revenueGptSession?.meta?.extractionSupervision);
  const [session, setSession] = useState<RevenueGptSession>(() =>
    restoreRevenueSessionPassive(draft, fiscalYear, workspace.properties),
  );

  sessionRef.current = session;

  const pendingDocIds = useMemo(
    () => revenusDocs.filter((doc) => doc.status === "uploaded").map((doc) => doc.id),
    [revenusDocs],
  );
  const hasProcessing = revenusDocs.some((doc) => doc.status === "processing");
  const hasFailed = revenusDocs.some((doc) => doc.status === "failed");

  const showConfiguredCard = (validatedSuccess || confirmed) && !isEditing;
  const isProcessing =
    isExecutionRunning || (hasUploaded && !confirmed && !aiAnimationDone && uploadedCount > 0);
  const isFailed = hasFailed && !aiAnimationDone && !isExecutionRunning && hasUploaded;
  const showGrid =
    aiAnimationDone &&
    !showConfiguredCard &&
    shouldDisplayRevenueGrid(session, ocrReadFailure) &&
    session.properties.length > 0;
  const showOcrFailure = ocrReadFailure && !isProcessing && !showConfiguredCard;
  const showInitialExtras = !showGrid && !confirmed;
  const summary = gridSummary(session);

  const persistSession = useCallback(
    (nextSession: RevenueGptSession) => {
      sessionRef.current = nextSession;
      setSession(nextSession);
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: revenueSessionPatch(nextSession),
      });
    },
    [dispatch],
  );

  const applyPipelineToSession = useCallback(
    (options: {
      allowPrefill: boolean;
      linesByPropertyId: Map<string, import("@/lib/lmnp/types").RevenueRawLine[]>;
      gridSource: "ocr_lines" | "mock_lines";
      supervision?: RevenueSupervisionStatus;
    }) => {
      logRevenueRuntimeStage("session_prefill", {
        allowPrefill: options.allowPrefill,
        gridSource: options.gridSource,
        path: "RevenusDocumentStep.applyPipelineToSession → sessionFromPipelineLines",
      });

      if (!options.allowPrefill) {
        logRevenueGridSource("persisted_session", { action: "prefill_skipped" });
        setAiAnimationDone(true);
        clearExecution();
        return;
      }

      logRevenueSourceOfTruth(
        options.gridSource === "mock_lines" ? "mock_raw_lines" : "gpt_extraction",
        { lineBuckets: options.linesByPropertyId.size },
      );

      if (options.supervision) setExtractionSupervision(options.supervision);

      const nextSession = sessionFromPipelineLines(
        workspace.properties,
        fiscalYear,
        options.linesByPropertyId,
        options.gridSource,
        sessionRef.current ?? undefined,
        options.supervision
          ? { extractionSupervision: options.supervision }
          : undefined,
      );

      persistSession(nextSession);
      logRevenueRuntimeStage("persist", {
        propertyCount: nextSession.properties.length,
        transactionCount: nextSession.meta?.transactionCount ?? 0,
        gridSource: nextSession.meta?.gridSource,
      });
      logRevenueGridSource(nextSession.meta?.gridSource ?? options.gridSource, {
        afterPrefill: true,
      });
      logRevenueRenderOrigin(inferSessionRenderOrigin(nextSession), {
        mode: nextSession.mode,
      });
      setAiAnimationDone(true);
      clearExecution();
    },
    [clearExecution, fiscalYear, persistSession, workspace.properties],
  );

  const runAnalysis = useCallback(
    async (documentIds: string[]) => {
      if (!documentIds.length || analyzingRef.current) return;
      analyzingRef.current = true;
      setIsExecutionRunning(true);
      markExecution("document_upload");

      for (const documentId of documentIds) {
        dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "processing" });
      }

      try {
        const pipelineResult = await runRevenusDocumentPipeline({
          documents: workspace.documents,
          documentIds,
          getFile,
          fiscalYear: workspace.fiscalYear.year,
          properties: workspace.properties,
        });

        for (const documentId of pipelineResult.processedDocumentIds) {
          dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "analyzed" });
        }
        for (const documentId of pipelineResult.failedDocumentIds) {
          dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "failed" });
        }

        if (!pipelineResult.success) {
          setOcrReadFailure(Boolean(pipelineResult.ocrFailure));
          setPipelineError(pipelineResult.error ?? null);
          if (pipelineResult.supervision) setExtractionSupervision(pipelineResult.supervision);

          const propertyLabel = workspace.properties[0]?.label?.trim() || "Revenus locatifs";
          dispatch({
            type: "ADD_AI_ACTIVITY_EVENT",
            event: makeAnalysisFailedEvent(
              "revenus",
              "revenus-main",
              propertyLabel,
              documentIds[0] ?? "batch",
              pipelineResult.ocrFailure
                ? "Le document est trop peu lisible pour être analysé. Essayez un PDF natif ou une photo plus nette."
                : (pipelineResult.error ?? "L'analyse du document de revenus a échoué."),
            ),
          });

          setAiAnimationDone(true);
          clearExecution();
          return;
        }

        setOcrReadFailure(false);
        setPipelineError(null);

        if (pipelineResult.duplicateDocumentIds.length > 0) {
          // Cycle 15A — jamais un silence : un document au contenu identique à un
          // autre déjà intégré dans ce lot n'est pas ajouté une seconde fois.
          showInfo(
            `${pipelineResult.duplicateDocumentIds.length} document(s) ignoré(s)`,
            "Contenu identique à un document déjà importé dans ce lot — non comptabilisé deux fois.",
          );
        }

        // Emit enrichment event for each successfully processed property
        const lineCount = [...pipelineResult.linesByPropertyId.values()].reduce(
          (acc, lines) => acc + lines.length,
          0,
        );
        const propertyLabel = workspace.properties[0]?.label?.trim() || "Revenus locatifs";
        if (lineCount > 0) {
          dispatch({
            type: "ADD_AI_ACTIVITY_EVENT",
            event: makeDocumentEnrichedEvent(
              "revenus",
              "revenus-main",
              propertyLabel,
              documentIds[0] ?? "batch",
              "Revenus locatifs détectés",
              `L'IA a extrait ${lineCount} ligne${lineCount > 1 ? "s" : ""} depuis vos documents.`,
              { nextValues: { lineCount } },
            ),
          });
        }

        applyPipelineToSession({
          allowPrefill: shouldApplyPrefill(),
          linesByPropertyId: pipelineResult.linesByPropertyId,
          gridSource: pipelineResult.gridSource,
          supervision: pipelineResult.supervision,
        });
      } catch {
        for (const documentId of documentIds) {
          dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "failed" });
        }
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
      workspace.properties,
      getFile,
      dispatch,
      applyPipelineToSession,
      shouldApplyPrefill,
      markExecution,
      clearExecution,
    ],
  );

  const handleAiAnimationComplete = useCallback(() => {
    if (!isExecutionRunning) setAiAnimationDone(true);
  }, [isExecutionRunning]);

  useEffect(() => {
    if (passiveSyncedRef.current) return;
    passiveSyncedRef.current = true;
    sessionRef.current = draft?.revenueGptSession ?? sessionRef.current;

    const hydrationBranch = resolveHydrationBranch(draft);
    logRevenueHydrationBranch(hydrationBranch, {
      hasRevenueGptSession: Boolean(draft?.revenueGptSession?.properties.length),
      hasRevenusExtraction: Boolean(draft?.revenusExtraction),
      revenusConfirmedAt: draft?.revenusConfirmedAt ?? null,
    });

    const restored = restoreRevenueSessionPassive(draft, fiscalYear, workspace.properties);
    if (restored.properties.length) {
      setSession(restored);
      logRevenueRenderOrigin(inferSessionRenderOrigin(restored), {
        trigger: "passive_hydration",
      });
    }

    if (draft?.revenusDocumentIds?.length || draft?.revenusConfirmedAt) {
      setHasUploaded(true);
    }

    if (
      hasPersistedRevenueSession(draft) ||
      draft?.revenusConfirmedAt ||
      draft?.revenueGptSession?.mode === "manual"
    ) {
      setAiAnimationDone(true);
    }

    endPassiveHydration();
  }, [draft, endPassiveHydration, fiscalYear, workspace.properties]);

  useEffect(() => {
    if (!confirmed) return;
    setHasUploaded(true);
    setValidatedSuccess(true);
    setIsEditing(false);
    setAiAnimationDone(true);
    setSession(restoreRevenueSessionPassive(draft, fiscalYear, workspace.properties));
  }, [confirmed, draft, fiscalYear, workspace.properties]);

  useEffect(() => {
    if (!pendingUploadRef.current || revenusDocs.length === 0) return;
    pendingUploadRef.current = false;
    const ids = revenusDocs.map((doc) => doc.id);
    const existing = new Set(draft?.revenusDocumentIds ?? []);
    ids.forEach((id) => existing.add(id));
    dispatch({
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusDocumentIds: [...existing] },
    });
  }, [revenusDocs, draft?.revenusDocumentIds, dispatch]);

  useEffect(() => {
    if (!pendingDocIds.length || hasProcessing || analyzingRef.current) return;
    if (!executionPendingRef.current || !shouldRunExtraction()) return;
    // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
    console.log("[ocr-trigger-owner]", {
      system: "T5-revenus-gated",
      component: "RevenusDocumentStep",
      reason: "pendingDocIds non-empty + executionPendingRef + shouldRunExtraction",
      docs: pendingDocIds,
      step: "revenus",
      category: "revenus-fonciers",
      guard: "pendingDocIds + hasProcessing + analyzingRef + executionPendingRef + shouldRunExtraction(hydration-aware)",
    });
    executionPendingRef.current = false;
    void runAnalysis(pendingDocIds);
  }, [pendingDocIds.join(","), hasProcessing, runAnalysis, shouldRunExtraction]);

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

    setValidatedSuccess(false);
    setAiAnimationDone(false);
    setOcrReadFailure(false);
    setPipelineError(null);
    setHasUploaded(true);
    pendingUploadRef.current = true;
    executionPendingRef.current = true;
    markExecution("document_upload");

    dispatch({
      type: "UPLOAD_DOCUMENTS",
      files: uploadedFiles.map((file, index) => ({
        file,
        category: REVENUS_UPLOAD_CATEGORY,
        documentId: documentIds[index],
        isSupabaseDocumentId: true,
      })),
    });

    logRevenueRuntimeStage("upload", {
      fileCount: uploadedFiles.length,
      category: REVENUS_UPLOAD_CATEGORY,
    });

    showInfo(
      `${uploadedFiles.length} fichier${uploadedFiles.length > 1 ? "s" : ""} reçu${uploadedFiles.length > 1 ? "s" : ""}`,
      "L'IA prépare vos revenus locatifs.",
    );
  }

  function handleManualEntry() {
    const nextSession = createEmptyRevenueSession(workspace.properties, fiscalYear, "manual");
    persistSession({
      ...nextSession,
      meta: { ...nextSession.meta, gridSource: "user_manual" },
    });
    logRevenueGridSource("user_manual", { fn: "handleManualEntry" });
    setValidatedSuccess(false);
    setAiAnimationDone(true);
  }

  function handleRetry() {
    const failedIds = revenusDocs.filter((doc) => doc.status === "failed").map((doc) => doc.id);
    failedIds.forEach((documentId) => {
      dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "uploaded" });
    });
    executionPendingRef.current = true;
    markExecution("reanalyze");
    setOcrReadFailure(false);
    setPipelineError(null);
    setAiAnimationDone(false);
  }

  function handleManualContinue() {
    handleManualEntry();
  }

  function handleConfirm() {
    logRevenueRuntimeStage("confirm", {
      mode: session.mode,
      gridUserEdited: session.properties.some((property) => property.gridUserEdited),
    });
    logRevenueSourceOfTruth("synthetic_grid_export", {
      note: "sessionToExtractionData synthesizes RevenueEvent[] from grid rows on confirm",
    });
    const extraction = sessionToExtractionData(session, fiscalYear);
    const documentIds = revenusDocs.map((doc) => doc.id);
    dispatch({
      type: "CONFIRM_REVENUS",
      extraction,
      session,
      documentIds,
    });

    // Cycle 15A — pont vers le moteur fiscal : le même calcul que l'assistant
    // conversationnel (computeRecettesExercice), pas une nouvelle logique.
    // draft.revenusAssistant devient la source canonique lue par F-006.
    const bridged = buildRevenusAssistantFromSession(session, fiscalYear, draft?.dateMiseEnService);
    dispatch({
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: bridged.revenusAssistant },
    });

    const propertyLabel = workspace.properties[0]?.label?.trim() || "Revenus locatifs";
    dispatch({
      type: "ADD_AI_ACTIVITY_EVENT",
      event: makeValidationEvent(
        "revenus",
        "revenus-main",
        propertyLabel,
        `${extraction.summary.totalRevenue.toLocaleString("fr-FR")} € de revenus locatifs vérifiés et enregistrés.`,
      ),
    });

    setValidatedSuccess(true);
    setIsEditing(false);
    showSuccess(
      "Revenus locatifs préparés",
      "Les revenus détectés seront automatiquement utilisés pour préparer votre déclaration.",
    );
  }

  if (lockedByOtherChannel) {
    return (
      <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
        <WorkflowPageBackLink />
        <ConfiguredDossierCard
          title="✓ Revenus déjà configurés"
          rows={[
            { label: "Total recettes", value: `${(draft?.revenusAssistant?.totalRecettes ?? 0).toLocaleString("fr-FR")} €` },
            { label: "Exercice", value: String(draft?.revenusAssistant?.exerciceFiscal ?? fiscalYear) },
          ]}
          footnote="Configurés via l'assistant Revenus (questions/réponses) — modifiez-les depuis cet assistant, pas depuis l'import de document, pour éviter tout double calcul."
          onEdit={() => router.push(LMNP_ROUTES.revenusAssistant)}
        />
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <WorkflowPageBackLink />

      <div className="w-full space-y-3 [&>section]:!mx-0 [&>section]:!w-full [&>section]:!max-w-none">
        <RevenusHero
          onFiles={handleUpload}
          onManualEntry={handleManualEntry}
          uploadState={uploadedCount > 0 || (hasUploaded && session.mode !== "manual") ? "uploaded" : "idle"}
          uploadedFileName={latestDoc?.fileName}
          uploadedCount={Math.max(uploadedCount, hasUploaded ? 1 : 0)}
          detectedEventCount={summary.rentCount}
          showManualLink={showInitialExtras}
        />
      </div>

      {isProcessing ? (
        <ActiviteAiProcessing onComplete={handleAiAnimationComplete} steps={REVENUS_AI_STEPS} />
      ) : null}

      {showGrid ? (
        <>
          <RevenueSupervisionCard supervision={extractionSupervision ?? session.meta?.extractionSupervision} />
          <RevenusSummaryCard
            summary={{
              totalRevenue: summary.totalRevenue,
              rentCount: summary.rentCount,
              totalFees: summary.totalFees,
              hasSecurityDeposit: summary.hasSecurityDeposit,
              deduplicatedCount: summary.deduplicatedCount,
              eventCount: summary.transactionCount,
              lowConfidenceCount: summary.lowConfidenceCount,
            }}
            deduplicationNotes={
              summary.deduplicatedCount > 0
                ? [`${summary.deduplicatedCount} doublon(s) fusionné(s) lors de la reconstruction`]
                : undefined
            }
            cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
          />
          <RevenusPropertyGridCards
            session={session}
            fiscalYear={fiscalYear}
            cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
            onSessionChange={persistSession}
            onConfirm={handleConfirm}
            showConfirm
          />
        </>
      ) : null}

      {showConfiguredCard ? (
        <>
          <ConfiguredDossierCard
            title="✓ Revenus configurés"
            rows={buildRevenusConfiguredSummary(
              sessionToExtractionData(session, fiscalYear),
              revenusDocs,
              workspace.fiscalYear.year,
            )}
            onEdit={() => {
              setIsEditing(true);
              setSession(restoreRevenueSessionPassive(draft, fiscalYear, workspace.properties));
            }}
          />
          <WorkflowProgressionActions currentStepId="revenus" />
        </>
      ) : null}

      {showOcrFailure ? (
        <>
          <RevenueSupervisionCard supervision={extractionSupervision} />
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
            Lecture du document impossible
          </p>
          <p className="mt-3" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            {pipelineError ?? REVENUE_OCR_READ_FAILURE_MESSAGE}
          </p>
          <p className="mt-3" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            Conseil : exportez un relevé bancaire texte (PDF natif), ou une photo plus nette et bien
            cadrée.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button onClick={handleRetry}>Réessayer avec un autre fichier</Button>
            <Button variant="secondary" onClick={handleManualContinue}>
              Saisir manuellement
            </Button>
          </div>
        </div>
        </>
      ) : null}

      {isFailed && !showOcrFailure ? (
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
            Réessayez avec un autre format ou saisissez vos revenus manuellement.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button onClick={handleRetry}>Réessayer l&apos;import</Button>
            <Button variant="secondary" onClick={handleManualContinue}>
              Saisir manuellement
            </Button>
          </div>
        </div>
      ) : null}

      <AiActivityFeed
        events={workspace.aiActivityFeed}
        step="revenus"
        onReimport={() => handleRetry()}
      />
    </div>
  );
}
