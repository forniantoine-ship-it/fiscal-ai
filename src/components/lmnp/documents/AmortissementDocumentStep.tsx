"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { ActiviteAiProcessing } from "@/components/lmnp/activite/ActiviteAiProcessing";
import { AmortissementHero } from "@/components/lmnp/amortissement/AmortissementHero";
import { AmortissementItemCards } from "@/components/lmnp/amortissement/AmortissementItemCards";
import { AmortissementSummaryCard } from "@/components/lmnp/amortissement/AmortissementSummaryCard";
import { AmortissementUploadSection } from "@/components/lmnp/amortissement/AmortissementUploadSection";
import { AmortissementVentilationTable } from "@/components/lmnp/amortissement/AmortissementVentilationTable";
import {
  DOCUMENT_WORKFLOW_CARD_STYLE,
} from "@/components/lmnp/documents/document-workflow-shared";
import { useFeedback } from "@/components/lmnp/shared/FeedbackProvider";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  buildVentilationFromDossier,
  isContinuityDocument,
  isMobilierDocument,
  isTravauxDocument,
  MOCK_EXTRACTED_INVOICES,
  recalculateVentilationSummary,
  ventilationFromDraft,
  type AmortissementComponent,
  type AmortissementVentilationData,
  type ExtractedInvoice,
} from "@/lib/lmnp/services/amortissement-profile";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import type { DocumentCategory, LmnpDocument } from "@/lib/lmnp/types";

type ExistingActivityAnswer = "yes" | "no" | null;

const AMORTISSEMENT_AI_STEPS = [
  "Documents détectés",
  "Extraction des informations",
  "Préparation des amortissements",
  "Génération ventilation automatique",
  "Vérification cohérence",
] as const;

function latestDocumentName(documents: LmnpDocument[], matcher: (doc: LmnpDocument) => boolean): string | undefined {
  return [...documents]
    .filter(matcher)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0]?.fileName;
}

function allDocumentsAnalyzed(documents: LmnpDocument[]): boolean {
  return documents.length > 0 && documents.every((doc) => doc.status === "analyzed" || doc.status === "failed");
}

export function AmortissementDocumentStep() {
  const { workspace, dispatch, getFile } = useLmnp();
  const { showSuccess, showInfo } = useFeedback();
  const analyzingRef = useRef(false);

  const draft = workspace.declarationDraft;
  const confirmed = Boolean(draft?.amortissementConfirmedAt);

  const [existingActivity, setExistingActivity] = useState<ExistingActivityAnswer>(() => {
    if (draft?.amortissementExistingActivity === true) return "yes";
    if (draft?.amortissementExistingActivity === false) return "no";
    return null;
  });
  const [continuitySkipped, setContinuitySkipped] = useState(false);
  const [travauxSkipped, setTravauxSkipped] = useState(false);
  const [mobilierSkipped, setMobilierSkipped] = useState(false);
  const [readyForAnalysis, setReadyForAnalysis] = useState(false);
  const [aiAnimationDone, setAiAnimationDone] = useState(false);
  const [showVentilationTable, setShowVentilationTable] = useState(false);
  const [validatedSuccess, setValidatedSuccess] = useState(() => confirmed);
  const [manualMode, setManualMode] = useState(false);
  const [extractedInvoices, setExtractedInvoices] = useState<ExtractedInvoice[]>(MOCK_EXTRACTED_INVOICES);
  const [ventilation, setVentilation] = useState<AmortissementVentilationData | undefined>(() =>
    ventilationFromDraft(draft),
  );

  const continuityDocs = useMemo(
    () => workspace.documents.filter(isContinuityDocument),
    [workspace.documents],
  );
  const travauxDocs = useMemo(
    () => workspace.documents.filter(isTravauxDocument),
    [workspace.documents],
  );
  const mobilierDocs = useMemo(
    () => workspace.documents.filter(isMobilierDocument),
    [workspace.documents],
  );

  const continuityCount = continuityDocs.length;
  const travauxCount = travauxDocs.length;
  const mobilierCount = mobilierDocs.length;
  const totalUploadedCount = continuityCount + travauxCount + mobilierCount;

  const activityAnswered = existingActivity !== null;
  const needsContinuity = existingActivity === "yes";
  const continuityReady = !needsContinuity || continuityCount > 0 || continuitySkipped;
  const travauxReady = travauxCount > 0 || travauxSkipped;
  const mobilierReady = mobilierCount > 0 || mobilierSkipped;
  const uploadsComplete = continuityReady && travauxReady && mobilierReady;

  const pendingDocIds = useMemo(
    () =>
      [...continuityDocs, ...travauxDocs, ...mobilierDocs]
        .filter((doc) => doc.status === "uploaded")
        .map((doc) => doc.id),
    [continuityDocs, travauxDocs, mobilierDocs],
  );

  const relevantDocs = useMemo(
    () => [...continuityDocs, ...travauxDocs, ...mobilierDocs],
    [continuityDocs, travauxDocs, mobilierDocs],
  );

  const hasProcessing = relevantDocs.some((doc) => doc.status === "processing");
  const hasFailed = relevantDocs.some((doc) => doc.status === "failed");
  const documentsReady =
    totalUploadedCount === 0 || allDocumentsAnalyzed(relevantDocs);
  const canRunAi =
    readyForAnalysis &&
    !aiAnimationDone &&
    !confirmed &&
    !manualMode &&
    documentsReady;
  const isProcessing = canRunAi;
  const isFailed = hasFailed && !aiAnimationDone && !manualMode && readyForAnalysis;
  const showSummary = aiAnimationDone && !showVentilationTable && !validatedSuccess && !confirmed;
  const showTable = showVentilationTable && !validatedSuccess && !confirmed;

  const showContinuitySection = activityAnswered && needsContinuity && !continuityReady;
  const showTravauxSection = activityAnswered && continuityReady && !travauxReady;
  const showMobilierSection = activityAnswered && continuityReady && travauxReady && !mobilierReady;

  const persistActivity = useCallback(
    (value: "yes" | "no") => {
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: { amortissementExistingActivity: value === "yes" },
      });
    },
    [dispatch],
  );

  const handleExistingActivityChange = (value: "yes" | "no") => {
    setExistingActivity(value);
    setContinuitySkipped(false);
    setTravauxSkipped(false);
    setMobilierSkipped(false);
    setReadyForAnalysis(false);
    setAiAnimationDone(false);
    setShowVentilationTable(false);
    setValidatedSuccess(false);
    setManualMode(false);
    persistActivity(value);
  };

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
    if (activityAnswered && uploadsComplete && !readyForAnalysis && !confirmed) {
      setReadyForAnalysis(true);
    }
  }, [activityAnswered, uploadsComplete, readyForAnalysis, confirmed]);

  useEffect(() => {
    if (confirmed) {
      setValidatedSuccess(true);
      setAiAnimationDone(true);
      setShowVentilationTable(true);
      setVentilation(ventilationFromDraft(draft));
      if (draft?.amortissementExistingActivity === true) setExistingActivity("yes");
      if (draft?.amortissementExistingActivity === false) setExistingActivity("no");
      return;
    }

    if (draft?.amortissementVentilation && !ventilation) {
      setVentilation(draft.amortissementVentilation);
      setAiAnimationDone(true);
    }
  }, [confirmed, draft, ventilation]);

  const handleUpload = (files: File[], category: DocumentCategory) => {
    if (!files.length) return;

    setValidatedSuccess(false);
    setAiAnimationDone(false);
    setShowVentilationTable(false);
    setManualMode(false);
    setReadyForAnalysis(false);

    dispatch({
      type: "UPLOAD_DOCUMENTS",
      files: files.map((file) => ({ file, category })),
    });

    showInfo(
      `${files.length} fichier${files.length > 1 ? "s" : ""} reçu${files.length > 1 ? "s" : ""}`,
      "L'IA prépare vos amortissements.",
    );
  };

  const handleAiAnimationComplete = useCallback(() => {
    const nextVentilation = buildVentilationFromDossier(
      {
        fiscalYear: workspace.fiscalYear,
        properties: workspace.properties,
        documents: workspace.documents,
        extractions: workspace.extractions,
        validationItems: workspace.validationItems,
        ledgerEntries: workspace.ledgerEntries,
        declarationDraft: workspace.declarationDraft,
      },
      extractedInvoices,
    );
    setVentilation(nextVentilation);
    setAiAnimationDone(true);
  }, [workspace, extractedInvoices]);

  function handleRetry() {
    const failedIds = [...continuityDocs, ...travauxDocs, ...mobilierDocs]
      .filter((doc) => doc.status === "failed")
      .map((doc) => doc.id);
    failedIds.forEach((documentId) => {
      dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "uploaded" });
    });
    setAiAnimationDone(false);
    setShowVentilationTable(false);
    setReadyForAnalysis(true);
  }

  function handleManualContinue() {
    setManualMode(true);
    setAiAnimationDone(true);
    setExtractedInvoices(MOCK_EXTRACTED_INVOICES);
    setVentilation(
      buildVentilationFromDossier(
        {
          fiscalYear: workspace.fiscalYear,
          properties: workspace.properties,
          documents: workspace.documents,
          extractions: workspace.extractions,
          validationItems: workspace.validationItems,
          ledgerEntries: workspace.ledgerEntries,
          declarationDraft: workspace.declarationDraft,
        },
        MOCK_EXTRACTED_INVOICES,
      ),
    );
  }

  function handleComponentsChange(components: AmortissementComponent[]) {
    setVentilation((current) => {
      if (!current) return current;
      return {
        components,
        summary: recalculateVentilationSummary(components),
      };
    });
  }

  function handleConfirm() {
    if (!ventilation) return;
    dispatch({
      type: "CONFIRM_AMORTISSEMENT",
      ventilation,
    });
    setValidatedSuccess(true);
    showSuccess(
      "Amortissements préparés",
      "Vos données seront réutilisées pour les prochaines années fiscales.",
      LMNP_ROUTES.dashboard,
    );
  }

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <div className="flex w-full justify-center">
        <Button href={LMNP_ROUTES.dashboard}>Tableau de bord</Button>
      </div>

      <div className="w-full space-y-3 [&>section]:!mx-0 [&>section]:!w-full [&>section]:!max-w-none">
        <AmortissementHero
          existingActivity={existingActivity}
          onExistingActivityChange={handleExistingActivityChange}
          totalUploadedCount={totalUploadedCount}
        />
      </div>

      {needsContinuity && activityAnswered && !continuitySkipped ? (
        <p
          className="mx-auto max-w-2xl text-center animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
          style={{ ...typography.body.desktop, color: colors.text.secondary }}
        >
          Le logiciel reprendra automatiquement vos anciens amortissements afin d&apos;assurer la
          continuité comptable.
        </p>
      ) : null}

      {existingActivity === "no" && activityAnswered && continuityReady && travauxCount === 0 ? (
        <p
          className="mx-auto max-w-2xl text-center animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
          style={{ ...typography.body.desktop, color: colors.text.secondary }}
        >
          Le logiciel prépare une nouvelle ventilation à partir de votre acte notarié, logement,
          crédit et prix d&apos;acquisition — sans ressaisie manuelle.
        </p>
      ) : null}

      <AmortissementUploadSection
        title="Documents de continuité comptable"
        helper="Ancienne liasse fiscale, tableau d'amortissements ou export comptable utile."
        uploadedCount={continuityCount}
        uploadedFileName={latestDocumentName(workspace.documents, isContinuityDocument)}
        onFiles={(files) => handleUpload(files, "amortissement")}
        onSkip={() => setContinuitySkipped(true)}
        skipLabel="Continuer sans document de continuité"
        visible={showContinuitySection}
        cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
      />

      <AmortissementUploadSection
        title="Ajoutez vos factures de travaux"
        uploadedCount={travauxCount}
        uploadedFileName={latestDocumentName(workspace.documents, isTravauxDocument)}
        onFiles={(files) => handleUpload(files, "charges")}
        onSkip={() => setTravauxSkipped(true)}
        skipLabel="Je n'ai pas de factures de travaux"
        visible={showTravauxSection}
        cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
        delayMs={200}
      />

      <AmortissementUploadSection
        title="Ajoutez vos factures de mobilier"
        uploadedCount={mobilierCount}
        uploadedFileName={latestDocumentName(workspace.documents, isMobilierDocument)}
        onFiles={(files) => handleUpload(files, "amortissement")}
        onSkip={() => setMobilierSkipped(true)}
        skipLabel="Je n'ai pas de factures de mobilier"
        visible={showMobilierSection}
        cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
        delayMs={400}
      />

      {isProcessing ? (
        <ActiviteAiProcessing onComplete={handleAiAnimationComplete} steps={AMORTISSEMENT_AI_STEPS} />
      ) : null}

      {aiAnimationDone && !showVentilationTable && !validatedSuccess ? (
        <AmortissementItemCards
          invoices={extractedInvoices}
          cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
          visible={travauxCount > 0 || mobilierCount > 0 || manualMode}
        />
      ) : null}

      {showSummary && ventilation ? (
        <AmortissementSummaryCard
          summary={ventilation.summary}
          cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
          onShowVentilation={() => setShowVentilationTable(true)}
        />
      ) : null}

      {showTable && ventilation ? (
        <AmortissementVentilationTable
          components={ventilation.components}
          onChange={handleComponentsChange}
          onConfirm={handleConfirm}
          cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
        />
      ) : null}

      {validatedSuccess ? (
        <div
          className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
          style={{
            borderRadius: radius.lg,
            border: `1px solid ${colors.success.border}`,
            backgroundColor: colors.success.surface,
            boxShadow: shadows.card.default,
            padding: spacing.card.md,
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize.xl,
              color: colors.success.DEFAULT,
            }}
          >
            ✓ Amortissements préparés
          </p>
          <p className="mt-4" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Le logiciel utilisera automatiquement ces données pour :
          </p>
          <ul className="mx-auto mt-3 max-w-sm space-y-1 text-left">
            {[
              "les prochaines années fiscales",
              "les calculs futurs",
              "la continuité comptable",
            ].map((item) => (
              <li key={item} style={{ ...typography.body.desktop, color: colors.text.secondary }}>
                · {item}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex justify-center">
            <Button href={LMNP_ROUTES.dashboard}>Retour au tableau de bord</Button>
          </div>
        </div>
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
            Réessayez avec un autre format ou complétez manuellement la ventilation.
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
