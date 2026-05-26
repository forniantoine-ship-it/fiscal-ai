"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import {
  formValuesToProperty,
  isLogementDocument,
  isLogementProfileIncomplete,
  logementFromWorkspace,
  MOCK_LOGEMENT_BACKGROUND,
  MOCK_LOGEMENT_FORM,
  MOCK_LOGEMENT_UNCERTAIN_FIELDS,
  suggestsMultipleProperties,
} from "@/lib/lmnp/services/logement-profile";
import { buildLogementConfiguredSummary } from "@/lib/lmnp/services/configured-dossier-summaries";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import { useLmnp } from "@/lib/lmnp/store";
import type { LmnpDocument } from "@/lib/lmnp/types";

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

export function LogementDocumentStep() {
  const { workspace, dispatch, getFile } = useLmnp();
  const { showSuccess, showInfo } = useFeedback();
  const analyzingRef = useRef(false);
  const pendingUploadRef = useRef(false);

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
  const [aiAnimationDone, setAiAnimationDone] = useState(false);
  const [visibleSections, setVisibleSections] = useState(0);
  const [uncertainFields, setUncertainFields] = useState<LogementFieldKey[]>([]);
  const [multiPropertyDetected, setMultiPropertyDetected] = useState(false);
  const [validatedSuccess, setValidatedSuccess] = useState(() => confirmed);
  const [isEditing, setIsEditing] = useState(false);
  const [formValues, setFormValues] = useState<LogementFormValues>(() =>
    logementFromWorkspace(workspace),
  );

  const isProcessing = hasUploaded && !confirmed && !aiAnimationDone && !multiPropertyDetected;
  const isFailed = logementDoc?.status === "failed" && !aiAnimationDone && !multiPropertyDetected;
  const showConfiguredCard = (validatedSuccess || confirmed) && !isEditing;
  const showExtractionForm =
    aiAnimationDone && !isProcessing && !multiPropertyDetected && !showConfiguredCard;

  const applyExtractedForm = useCallback(() => {
    setFormValues(MOCK_LOGEMENT_FORM);
    setUncertainFields(MOCK_LOGEMENT_UNCERTAIN_FIELDS);
  }, []);

  const handleAiAnimationComplete = useCallback(() => {
    setAiAnimationDone(true);
    applyExtractedForm();
  }, [applyExtractedForm]);

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
    if (confirmed) {
      setHasUploaded(true);
      setValidatedSuccess(true);
      setIsEditing(false);
      setAiAnimationDone(true);
      setFormValues(logementFromWorkspace(workspace));
      setVisibleSections(2);
      setUncertainFields([]);
      return;
    }

    if (draft?.logementDocumentId && logementDoc?.status === "analyzed" && !aiAnimationDone) {
      setHasUploaded(true);
      setAiAnimationDone(true);
      setFormValues(logementFromWorkspace(workspace));
      setVisibleSections(2);
    }
  }, [confirmed, logementDoc, aiAnimationDone, draft?.logementDocumentId, workspace]);

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

  const runAnalysis = useCallback(
    async (documentId: string) => {
      if (analyzingRef.current) return;
      analyzingRef.current = true;

      try {
        await runBulkDocumentAnalysis({
          documents: workspace.documents,
          documentIds: [documentId],
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
    if (!logementDoc || logementDoc.status !== "uploaded" || analyzingRef.current) return;
    void runAnalysis(logementDoc.id);
  }, [logementDoc?.id, logementDoc?.status, runAnalysis]);

  function handleUpload(files: File[]) {
    if (!files.length) return;

    if (files.some((file) => suggestsMultipleProperties(file.name))) {
      setMultiPropertyDetected(true);
      setHasUploaded(true);
      showInfo(
        "Plusieurs biens détectés",
        "Notre équipe vous contactera pour un devis personnalisé.",
      );
      return;
    }

    setMultiPropertyDetected(false);
    setValidatedSuccess(false);
    setAiAnimationDone(false);
    setVisibleSections(0);
    setUncertainFields([]);
    setHasUploaded(true);
    pendingUploadRef.current = true;

    dispatch({
      type: "UPLOAD_DOCUMENTS",
      files: files.map((file) => ({ file, category: LOGEMENT_UPLOAD_CATEGORY })),
    });

    showInfo(
      `${files.length} fichier${files.length > 1 ? "s" : ""} reçu${files.length > 1 ? "s" : ""}`,
      "L'IA analyse votre acte notarié.",
    );
  }

  function handleFormChange(next: LogementFormValues) {
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
    setAiAnimationDone(false);
    setVisibleSections(0);
    dispatch({ type: "DOCUMENT_SET_STATUS", documentId: logementDoc.id, status: "uploaded" });
  }

  function handleManualContinue() {
    setMultiPropertyDetected(false);
    setAiAnimationDone(true);
    setFormValues(logementFromWorkspace(workspace));
    setUncertainFields([]);
  }

  function handleConfirm() {
    dispatch({
      type: "CONFIRM_LOGEMENT_PROFILE",
      profile: formValuesToProperty(formValues),
      backgroundExtraction: MOCK_LOGEMENT_BACKGROUND,
      documentId: logementDoc?.id,
    });
    setValidatedSuccess(true);
    setIsEditing(false);
    showSuccess(
      "Logement configuré",
      "Vos données seront réutilisées pour le crédit, les amortissements et les charges.",
    );
  }

  const incomplete = isLogementProfileIncomplete(formValues);

  return (
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
            Demande de devis personnalisée
          </p>
          <p className="mt-3" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Plusieurs biens ont été détectés. Notre équipe vous accompagne pour configurer votre
            dossier sur mesure.
          </p>
        </div>
      ) : null}

      {isProcessing ? (
        <ActiviteAiProcessing
          onComplete={handleAiAnimationComplete}
          finalStepLabel="Préparation du logement"
        />
      ) : null}

      {showExtractionForm ? (
        <LogementProfileFields
          values={formValues}
          onChange={handleFormChange}
          showIncompleteWarning={incomplete}
          onConfirm={handleConfirm}
          cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
          visibleSections={visibleSections}
          uncertainFields={uncertainFields}
          showConfirm={visibleSections >= 2}
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
              setVisibleSections(2);
              setFormValues(logementFromWorkspace(workspace));
            }}
          />
          <WorkflowProgressionActions currentStepId="logement" />
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
  );
}
