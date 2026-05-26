"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { ActiviteAiProcessing } from "@/components/lmnp/activite/ActiviteAiProcessing";
import { ChargesAmortizationSuggestions } from "@/components/lmnp/charges/ChargesAmortizationSuggestions";
import { ChargesCategoryCards } from "@/components/lmnp/charges/ChargesCategoryCards";
import { ChargesHero } from "@/components/lmnp/charges/ChargesHero";
import { ChargesSummaryCard } from "@/components/lmnp/charges/ChargesSummaryCard";
import {
  DOCUMENT_WORKFLOW_CARD_STYLE,
} from "@/components/lmnp/documents/document-workflow-shared";
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
import { pendingAmortizationSuggestions } from "@/lib/lmnp/services/charges-amortization-intelligence";
import {
  buildChargesDraftPatch,
  buildChargesExtraction,
  chargesFromDraft,
  countChargesDocuments,
  isChargesExtractionIncomplete,
  resolveChargesAmortizationDecisions,
  resolveChargesDocuments,
  type ChargesExtractionData,
} from "@/lib/lmnp/services/charges-profile";
import { buildChargesConfiguredSummary } from "@/lib/lmnp/services/configured-dossier-summaries";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import { useLmnp } from "@/lib/lmnp/store";

const CHARGES_UPLOAD_CATEGORY = "charges" as const;

const CHARGES_AI_STEPS = [
  "Documents détectés",
  "Classification des charges",
  "Préparation des données",
  "Vérification cohérence",
] as const;

export function ChargesDocumentStep() {
  const { workspace, dispatch, getFile } = useLmnp();
  const { showSuccess, showInfo } = useFeedback();
  const analyzingRef = useRef(false);
  const pendingUploadRef = useRef(false);
  const syncedConfirmedAtRef = useRef<string | undefined>(undefined);
  const lastAmortizationRefreshKeyRef = useRef<string>("");

  const draft = workspace.declarationDraft;
  const chargesConfirmedAt = draft?.chargesConfirmedAt;
  const confirmed = Boolean(chargesConfirmedAt);

  const chargesDocs = useMemo(
    () => resolveChargesDocuments(workspace.documents, draft?.chargesDocumentIds),
    [workspace.documents, draft?.chargesDocumentIds],
  );
  const uploadedCount = useMemo(
    () => countChargesDocuments(workspace.documents, draft?.chargesDocumentIds),
    [workspace.documents, draft?.chargesDocumentIds],
  );
  const latestDoc = chargesDocs[0];

  const [hasUploaded, setHasUploaded] = useState(
    () => Boolean(draft?.chargesDocumentIds?.length || draft?.chargesConfirmedAt),
  );
  const [aiAnimationDone, setAiAnimationDone] = useState(false);
  const [validatedSuccess, setValidatedSuccess] = useState(() => confirmed);
  const [isEditing, setIsEditing] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [extraction, setExtraction] = useState<ChargesExtractionData | undefined>(() =>
    chargesFromDraft(draft),
  );
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [transferConfirmedId, setTransferConfirmedId] = useState<string | null>(null);

  const pendingDocIds = useMemo(
    () => chargesDocs.filter((doc) => doc.status === "uploaded").map((doc) => doc.id),
    [chargesDocs],
  );
  const hasProcessing = chargesDocs.some((doc) => doc.status === "processing");
  const hasFailed = chargesDocs.some((doc) => doc.status === "failed");

  const isProcessing = hasUploaded && !confirmed && !aiAnimationDone && !manualMode && uploadedCount > 0;
  const isFailed = hasFailed && !aiAnimationDone && !manualMode && hasUploaded;
  const showConfiguredCard = (validatedSuccess || confirmed) && !isEditing;
  const showChargesContent =
    aiAnimationDone && !showConfiguredCard && Boolean(extraction);
  const incomplete = extraction ? isChargesExtractionIncomplete(extraction) : false;

  const amortizationDecisionsKey = useMemo(
    () =>
      (draft?.chargesAmortizationDecisions ?? [])
        .map((item) => `${item.expenseLineId}:${item.status}`)
        .join("|"),
    [draft?.chargesAmortizationDecisions],
  );

  const amortizationDecisions = useMemo(() => {
    if (!extraction) return [];
    return resolveChargesAmortizationDecisions(extraction, draft);
  }, [extraction, amortizationDecisionsKey, draft?.chargesExtraction]);

  const pendingSuggestions = useMemo(
    () => pendingAmortizationSuggestions(amortizationDecisions),
    [amortizationDecisions],
  );

  const persistChargesExtraction = useCallback(
    (nextExtraction: ChargesExtractionData) => {
      setExtraction(nextExtraction);
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: buildChargesDraftPatch(nextExtraction, workspace.declarationDraft),
      });
    },
    [dispatch, workspace.declarationDraft],
  );

  const handleAiAnimationComplete = useCallback(() => {
    const nextExtraction = buildChargesExtraction(workspace.properties, draft);
    persistChargesExtraction(nextExtraction);
    setAiAnimationDone(true);
  }, [workspace.properties, draft, persistChargesExtraction]);

  useEffect(() => {
    if (!chargesConfirmedAt) {
      syncedConfirmedAtRef.current = undefined;
      return;
    }

    if (syncedConfirmedAtRef.current === chargesConfirmedAt) return;
    syncedConfirmedAtRef.current = chargesConfirmedAt;

    setHasUploaded(true);
    setValidatedSuccess(true);
    setIsEditing(false);
    setAiAnimationDone(true);

    const fromDraft = chargesFromDraft(draft);
    if (fromDraft) {
      setExtraction((current) => current ?? fromDraft);
    }
  }, [chargesConfirmedAt, draft]);

  useEffect(() => {
    if (chargesConfirmedAt) return;
    const saved = draft?.chargesExtraction;
    if (!saved) return;

    setExtraction((current) => current ?? saved);
    setAiAnimationDone((prev) => prev || true);
    setHasUploaded((prev) => prev || true);
  }, [chargesConfirmedAt, draft?.chargesExtraction]);

  useEffect(() => {
    if (!pendingUploadRef.current || chargesDocs.length === 0) return;
    pendingUploadRef.current = false;
    const ids = chargesDocs.map((doc) => doc.id);
    const existing = new Set(draft?.chargesDocumentIds ?? []);
    ids.forEach((id) => existing.add(id));
    dispatch({
      type: "DECLARATION_PATCH_DRAFT",
      patch: { chargesDocumentIds: [...existing] },
    });
  }, [chargesDocs, draft?.chargesDocumentIds, dispatch]);

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
      draft?.chargesDocumentIds?.length &&
      chargesDocs.some((doc) => doc.status === "analyzed") &&
      !aiAnimationDone &&
      !confirmed
    ) {
      setHasUploaded(true);
      setAiAnimationDone(true);
      persistChargesExtraction(buildChargesExtraction(workspace.properties, draft));
    }
  }, [
    draft?.chargesDocumentIds?.length,
    chargesDocs,
    aiAnimationDone,
    confirmed,
    workspace.properties,
    draft,
    persistChargesExtraction,
  ]);

  function handleUpload(files: File[]) {
    if (!files.length) return;

    setValidatedSuccess(false);
    setAiAnimationDone(false);
    setManualMode(false);
    setHasUploaded(true);
    pendingUploadRef.current = true;
    lastAmortizationRefreshKeyRef.current = "";

    dispatch({
      type: "UPLOAD_DOCUMENTS",
      files: files.map((file) => ({ file, category: CHARGES_UPLOAD_CATEGORY })),
    });

    showInfo(
      `${files.length} fichier${files.length > 1 ? "s" : ""} reçu${files.length > 1 ? "s" : ""}`,
      "L'IA prépare vos charges déductibles.",
    );
  }

  function handleRetry() {
    const failedIds = chargesDocs.filter((doc) => doc.status === "failed").map((doc) => doc.id);
    failedIds.forEach((documentId) => {
      dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "uploaded" });
    });
    setAiAnimationDone(false);
  }

  function handleManualContinue() {
    setManualMode(true);
    setAiAnimationDone(true);
    persistChargesExtraction(buildChargesExtraction(workspace.properties, draft));
  }

  useEffect(() => {
    if (!aiAnimationDone || confirmed) return;
    if (lastAmortizationRefreshKeyRef.current === amortizationDecisionsKey) return;

    lastAmortizationRefreshKeyRef.current = amortizationDecisionsKey;

    const draftState = workspace.declarationDraft;
    const decisions = draftState?.chargesAmortizationDecisions;
    setExtraction((prev) => {
      const base =
        prev ??
        (draftState?.chargesExtraction
          ? chargesFromDraft(draftState)
          : buildChargesExtraction(workspace.properties, draftState));
      if (!base) return prev;
      return {
        ...base,
        amortizationSuggestions:
          decisions && decisions.length > 0
            ? decisions
            : resolveChargesAmortizationDecisions(base, draftState),
      };
    });
  }, [amortizationDecisionsKey, aiAnimationDone, confirmed, workspace.properties, workspace.declarationDraft]);

  function handleTransferSuggestion(suggestionId: string) {
    const suggestion = amortizationDecisions.find((item) => item.id === suggestionId);
    if (!suggestion) return;

    setTransferringId(suggestionId);
    window.setTimeout(() => {
      dispatch({
        type: "TRANSFER_CHARGES_AMORTIZATION_SUGGESTION",
        suggestionId,
        suggestion,
      });
      setTransferringId(null);
      setTransferConfirmedId(suggestionId);
      window.setTimeout(() => setTransferConfirmedId(null), 2200);
    }, 900);
  }

  function handleKeepSuggestion(suggestionId: string) {
    const suggestion = amortizationDecisions.find((item) => item.id === suggestionId);
    if (!suggestion) return;

    dispatch({
      type: "KEEP_CHARGES_AMORTIZATION_SUGGESTION",
      suggestionId,
      suggestion,
    });
  }

  function handleConfirm() {
    if (!extraction) return;
    const documentIds = chargesDocs.map((doc) => doc.id);
    const extractionWithDecisions: ChargesExtractionData = {
      ...extraction,
      amortizationSuggestions: amortizationDecisions,
    };
    dispatch({
      type: "CONFIRM_CHARGES",
      extraction: extractionWithDecisions,
      documentIds,
    });
    setValidatedSuccess(true);
    setIsEditing(false);
    showSuccess(
      "Charges préparées",
      "Les charges détectées seront automatiquement utilisées pour préparer votre déclaration.",
    );
  }

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <WorkflowPageBackLink />

      <div className="w-full space-y-3 [&>section]:!mx-0 [&>section]:!w-full [&>section]:!max-w-none">
        <ChargesHero
          onFiles={handleUpload}
          uploadState={hasUploaded ? "uploaded" : "idle"}
          uploadedFileName={latestDoc?.fileName}
          uploadedCount={Math.max(uploadedCount, hasUploaded ? 1 : 0)}
          detectedCategoryCount={extraction?.summary.categoryCount}
        />
      </div>

      {isProcessing ? (
        <ActiviteAiProcessing onComplete={handleAiAnimationComplete} steps={CHARGES_AI_STEPS} />
      ) : null}

      {showChargesContent && extraction ? (
        <>
          <ChargesSummaryCard
            summary={extraction.summary}
            recoveredFromOtherSteps={extraction.recoveredFromOtherSteps}
            cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
          />
          <ChargesCategoryCards
            categories={extraction.categories}
            cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
            showIncompleteWarning={incomplete}
            onConfirm={handleConfirm}
            showConfirm={pendingSuggestions.length === 0}
          />
          <ChargesAmortizationSuggestions
            suggestions={amortizationDecisions}
            onTransfer={handleTransferSuggestion}
            onKeepAsCharge={handleKeepSuggestion}
            transferringId={transferringId}
            transferConfirmedId={transferConfirmedId}
          />
          {pendingSuggestions.length > 0 ? (
            <p
              className="mx-auto max-w-md text-center"
              style={{ ...typography.caption.desktop, color: colors.text.muted }}
            >
              Vous pourrez confirmer vos charges une fois les suggestions examinées.
            </p>
          ) : null}
        </>
      ) : null}

      {showConfiguredCard && extraction ? (
        <>
          <ConfiguredDossierCard
            title="✓ Charges configurées"
            rows={buildChargesConfiguredSummary(extraction).rows}
            onEdit={() => {
              setIsEditing(true);
              setExtraction(chargesFromDraft(draft) ?? extraction);
            }}
          />
          <WorkflowProgressionActions currentStepId="charges" />
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
