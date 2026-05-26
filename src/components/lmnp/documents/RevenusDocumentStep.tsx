"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { ActiviteAiProcessing } from "@/components/lmnp/activite/ActiviteAiProcessing";
import {
  DOCUMENT_WORKFLOW_CARD_STYLE,
} from "@/components/lmnp/documents/document-workflow-shared";
import { RevenusHero } from "@/components/lmnp/revenus/RevenusHero";
import { RevenusPropertyCards } from "@/components/lmnp/revenus/RevenusPropertyCards";
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
import {
  buildRevenusExtraction,
  countRevenusDocuments,
  isRevenusExtractionIncomplete,
  revenusFromDraft,
  resolveRevenusDocuments,
  type RevenusExtractionData,
} from "@/lib/lmnp/services/revenus-profile";
import { buildRevenusConfiguredSummary } from "@/lib/lmnp/services/configured-dossier-summaries";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import { useLmnp } from "@/lib/lmnp/store";

const REVENUS_UPLOAD_CATEGORY = "revenus" as const;

const REVENUS_AI_STEPS = [
  "Documents détectés",
  "Extraction des revenus",
  "Préparation des données",
  "Vérification cohérence",
] as const;

export function RevenusDocumentStep() {
  const { workspace, dispatch, getFile } = useLmnp();
  const { showSuccess, showInfo } = useFeedback();
  const analyzingRef = useRef(false);
  const pendingUploadRef = useRef(false);

  const draft = workspace.declarationDraft;
  const confirmed = Boolean(draft?.revenusConfirmedAt);

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
  const [aiAnimationDone, setAiAnimationDone] = useState(false);
  const [validatedSuccess, setValidatedSuccess] = useState(() => confirmed);
  const [isEditing, setIsEditing] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [extraction, setExtraction] = useState<RevenusExtractionData | undefined>(() =>
    revenusFromDraft(draft),
  );

  const pendingDocIds = useMemo(
    () => revenusDocs.filter((doc) => doc.status === "uploaded").map((doc) => doc.id),
    [revenusDocs],
  );
  const hasProcessing = revenusDocs.some((doc) => doc.status === "processing");
  const hasFailed = revenusDocs.some((doc) => doc.status === "failed");

  const isProcessing = hasUploaded && !confirmed && !aiAnimationDone && !manualMode && uploadedCount > 0;
  const isFailed = hasFailed && !aiAnimationDone && !manualMode && hasUploaded;
  const showConfiguredCard = (validatedSuccess || confirmed) && !isEditing;
  const showRevenueContent =
    aiAnimationDone && !showConfiguredCard && Boolean(extraction);
  const incomplete = extraction ? isRevenusExtractionIncomplete(extraction) : false;

  const handleAiAnimationComplete = useCallback(() => {
    const nextExtraction = buildRevenusExtraction(workspace.properties);
    setExtraction(nextExtraction);
    setAiAnimationDone(true);
  }, [workspace.properties]);

  useEffect(() => {
    if (confirmed) {
      setHasUploaded(true);
      setValidatedSuccess(true);
      setIsEditing(false);
      setAiAnimationDone(true);
      setExtraction(revenusFromDraft(draft));
      return;
    }

    if (draft?.revenusExtraction && !extraction) {
      setExtraction(draft.revenusExtraction);
      setAiAnimationDone(true);
      setHasUploaded(true);
    }
  }, [confirmed, draft, extraction]);

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

  const runAnalysis = useCallback(
    async (documentIds: string[]) => {
      if (!documentIds.length || analyzingRef.current) return;
      analyzingRef.current = true;

      try {
        await runBulkDocumentAnalysis({
          documents: workspace.documents,
          documentIds,
          getFile,
          dispatch,
          fiscalYear: workspace.fiscalYear.year,
        });
      } finally {
        analyzingRef.current = false;
      }
    },
    [workspace.documents, workspace.fiscalYear.year, getFile, dispatch],
  );

  useEffect(() => {
    if (!pendingDocIds.length || hasProcessing || analyzingRef.current) return;
    void runAnalysis(pendingDocIds);
  }, [pendingDocIds.join(","), hasProcessing, runAnalysis]);

  useEffect(() => {
    if (
      draft?.revenusDocumentIds?.length &&
      revenusDocs.some((doc) => doc.status === "analyzed") &&
      !aiAnimationDone &&
      !confirmed
    ) {
      setHasUploaded(true);
      setAiAnimationDone(true);
      setExtraction(buildRevenusExtraction(workspace.properties));
    }
  }, [
    draft?.revenusDocumentIds?.length,
    revenusDocs,
    aiAnimationDone,
    confirmed,
    workspace.properties,
  ]);

  function handleUpload(files: File[]) {
    if (!files.length) return;

    setValidatedSuccess(false);
    setAiAnimationDone(false);
    setManualMode(false);
    setHasUploaded(true);
    pendingUploadRef.current = true;

    dispatch({
      type: "UPLOAD_DOCUMENTS",
      files: files.map((file) => ({ file, category: REVENUS_UPLOAD_CATEGORY })),
    });

    showInfo(
      `${files.length} fichier${files.length > 1 ? "s" : ""} reçu${files.length > 1 ? "s" : ""}`,
      "L'IA prépare vos revenus locatifs.",
    );
  }

  function handleRetry() {
    const failedIds = revenusDocs.filter((doc) => doc.status === "failed").map((doc) => doc.id);
    failedIds.forEach((documentId) => {
      dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "uploaded" });
    });
    setAiAnimationDone(false);
  }

  function handleManualContinue() {
    setManualMode(true);
    setAiAnimationDone(true);
    setExtraction(buildRevenusExtraction(workspace.properties));
  }

  function handleConfirm() {
    if (!extraction) return;
    const documentIds = revenusDocs.map((doc) => doc.id);
    dispatch({
      type: "CONFIRM_REVENUS",
      extraction,
      documentIds,
    });
    setValidatedSuccess(true);
    setIsEditing(false);
    showSuccess(
      "Revenus locatifs préparés",
      "Les revenus détectés seront automatiquement utilisés pour préparer votre déclaration.",
    );
  }

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <WorkflowPageBackLink />

      <div className="w-full space-y-3 [&>section]:!mx-0 [&>section]:!w-full [&>section]:!max-w-none">
        <RevenusHero
          onFiles={handleUpload}
          uploadState={hasUploaded ? "uploaded" : "idle"}
          uploadedFileName={latestDoc?.fileName}
          uploadedCount={Math.max(uploadedCount, hasUploaded ? 1 : 0)}
          detectedRentCount={extraction?.summary.rentCount}
        />
      </div>

      {isProcessing ? (
        <ActiviteAiProcessing onComplete={handleAiAnimationComplete} steps={REVENUS_AI_STEPS} />
      ) : null}

      {showRevenueContent && extraction ? (
        <>
          <RevenusSummaryCard summary={extraction.summary} cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE} />
          <RevenusPropertyCards
            properties={extraction.properties}
            cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
            showIncompleteWarning={incomplete}
            onConfirm={handleConfirm}
            showConfirm
          />
        </>
      ) : null}

      {showConfiguredCard && extraction ? (
        <>
          <ConfiguredDossierCard
            title="✓ Revenus configurés"
            rows={buildRevenusConfiguredSummary(
              extraction,
              revenusDocs,
              workspace.fiscalYear.year,
            )}
            onEdit={() => {
              setIsEditing(true);
              setExtraction(revenusFromDraft(draft) ?? extraction);
            }}
          />
          <WorkflowProgressionActions currentStepId="revenus" />
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
            Certaines informations n&apos;ont pas pu être détectées automatiquement.
          </p>
          <p className="mt-3" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Réessayez avec un autre format ou complétez les informations manuellement.
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
