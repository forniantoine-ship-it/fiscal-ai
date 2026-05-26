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
  isInpiDocument,
  profileFromDraft,
} from "@/lib/lmnp/services/inpi-profile";
import { buildActiviteConfiguredSummary } from "@/lib/lmnp/services/configured-dossier-summaries";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import { useLmnp } from "@/lib/lmnp/store";
import type { LmnpDocument } from "@/lib/lmnp/types";

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

const MOCK_EXTRACTED_FORM: ActiviteFormValues = {
  siren: "829456123",
  firstName: "Marie",
  lastName: "Dupont",
  activityStartDate: "2023-06-15",
  activityType: "LMNP",
  regimeFiscal: "reel-simplifie",
  address: "12 rue de la Paix",
  city: "Lyon",
  postalCode: "",
  indivision: false,
};

const MOCK_UNCERTAIN_FIELDS: ActiviteFieldKey[] = ["postalCode"];

const SECTION_REVEAL_DELAYS_MS = [0, 400, 800, 1200];

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

export function InpiDocumentStep() {
  const { workspace, dispatch, getFile, autosaveStatus } = useLmnp();
  const { showSuccess, showInfo } = useFeedback();
  const analyzingRef = useRef(false);
  const pendingUploadRef = useRef(false);

  const draft = workspace.declarationDraft;
  const inpiDoc = useMemo(
    () => resolveInpiDocument(workspace.documents, draft?.inpiDocumentId),
    [workspace.documents, draft?.inpiDocumentId],
  );

  const save = autosaveLabel(autosaveStatus);
  const confirmed = Boolean(draft?.inpiConfirmedAt);

  const [manualMode, setManualMode] = useState(false);
  const [showNoInpiGuide, setShowNoInpiGuide] = useState(false);
  const [hasUploaded, setHasUploaded] = useState(
    () => Boolean(draft?.inpiDocumentId || draft?.inpiConfirmedAt),
  );
  const [aiAnimationDone, setAiAnimationDone] = useState(false);
  const [visibleSections, setVisibleSections] = useState(0);
  const [uncertainFields, setUncertainFields] = useState<ActiviteFieldKey[]>([]);
  const [validatedSuccess, setValidatedSuccess] = useState(() => confirmed);
  const [isEditing, setIsEditing] = useState(false);
  const [formValues, setFormValues] = useState<ActiviteFormValues>(() =>
    profileToFormValues(profileFromDraft(workspace)),
  );

  const isProcessing = hasUploaded && !confirmed && !manualMode && !aiAnimationDone;
  const isFailed = inpiDoc?.status === "failed" && !manualMode && !aiAnimationDone;
  const showConfiguredCard = (validatedSuccess || confirmed) && !isEditing;
  const showExtractionForm =
    (aiAnimationDone || manualMode) && !isProcessing && !showConfiguredCard;
  const showInitialExtras = !hasUploaded && !manualMode && !confirmed;

  const applyExtractedForm = useCallback(() => {
    setFormValues(MOCK_EXTRACTED_FORM);
    setUncertainFields(MOCK_UNCERTAIN_FIELDS);
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
      setFormValues(profileToFormValues(profileFromDraft(workspace)));
      setVisibleSections(4);
      setUncertainFields([]);
      return;
    }

    if (draft?.inpiDocumentId && inpiDoc?.status === "analyzed" && !aiAnimationDone && !manualMode) {
      setHasUploaded(true);
      setAiAnimationDone(true);
      setFormValues(profileToFormValues(profileFromDraft(workspace)));
      setVisibleSections(4);
    }
  }, [confirmed, inpiDoc, aiAnimationDone, manualMode, draft?.inpiDocumentId, workspace]);

  useEffect(() => {
    if (!pendingUploadRef.current || !inpiDoc) return;
    pendingUploadRef.current = false;
    if (draft?.inpiDocumentId !== inpiDoc.id) {
      dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { inpiDocumentId: inpiDoc.id } });
    }
  }, [inpiDoc, draft?.inpiDocumentId, dispatch]);

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
    if (!inpiDoc || inpiDoc.status !== "uploaded" || analyzingRef.current) return;
    void runAnalysis(inpiDoc.id);
  }, [inpiDoc?.id, inpiDoc?.status, runAnalysis]);

  function handleUpload(files: File[]) {
    if (!files.length) return;
    setManualMode(false);
    setShowNoInpiGuide(false);
    setAiAnimationDone(false);
    setVisibleSections(0);
    setUncertainFields([]);
    setHasUploaded(true);
    pendingUploadRef.current = true;

    dispatch({
      type: "UPLOAD_DOCUMENTS",
      files: files.map((file) => ({ file, category: "autre" })),
    });

    showInfo(
      `${files.length} fichier${files.length > 1 ? "s" : ""} reçu${files.length > 1 ? "s" : ""}`,
      "L'IA prépare vos informations.",
    );
  }

  function handleFormChange(next: ActiviteFormValues) {
    setFormValues(next);
    setUncertainFields((prev) =>
      prev.filter((key) => {
        const value = next[key as keyof ActiviteFormValues];
        return typeof value === "string" ? !value.trim() : true;
      }),
    );
  }

  function handleRetry() {
    if (!inpiDoc) return;
    setAiAnimationDone(false);
    setVisibleSections(0);
    dispatch({ type: "DOCUMENT_SET_STATUS", documentId: inpiDoc.id, status: "uploaded" });
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
    setFormValues(profileToFormValues(profileFromDraft(workspace)));
    setUncertainFields([]);
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
