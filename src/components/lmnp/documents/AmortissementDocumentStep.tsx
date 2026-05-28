"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { ActiviteAiProcessing } from "@/components/lmnp/activite/ActiviteAiProcessing";
import { AmortissementFromChargesSection } from "@/components/lmnp/amortissement/AmortissementFromChargesSection";
import { AmortissementHero } from "@/components/lmnp/amortissement/AmortissementHero";
import { AmortissementItemCards } from "@/components/lmnp/amortissement/AmortissementItemCards";
import { AmortissementSummaryCard } from "@/components/lmnp/amortissement/AmortissementSummaryCard";
import { AmortissementUploadSection } from "@/components/lmnp/amortissement/AmortissementUploadSection";
import { AmortissementVentilationTable } from "@/components/lmnp/amortissement/AmortissementVentilationTable";
import { DocumentExtractionSummary } from "@/components/lmnp/documents/DocumentExtractionSummary";
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
  buildVentilationFromDossier,
  countAmortissementDocuments,
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
import { buildAmortissementConfiguredSummary } from "@/lib/lmnp/services/configured-dossier-summaries";
import {
  DOCUMENT_WORKFLOW_CARD_STYLE,
} from "@/components/lmnp/documents/document-workflow-shared";
import { runBulkDocumentExtraction } from "@/lib/ai/extract-document-client";
import type { ExtractDocumentResult } from "@/lib/ai/document-types";
import type { ResolvedDocumentClassification } from "@/lib/ai/document-classification-types";
import { getCurrentDossierId } from "@/lib/lmnp/dossier/current-dossier";
import { resolveDocumentFile } from "@/lib/lmnp/services/resolve-document-file";
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

function fileUploadKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
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
  const [sectionUploadCounts, setSectionUploadCounts] = useState({
    continuity: 0,
    travaux: 0,
    mobilier: 0,
  });
  const [sectionContinued, setSectionContinued] = useState({
    continuity: false,
    travaux: false,
    mobilier: false,
  });
  const [readyForAnalysis, setReadyForAnalysis] = useState(false);
  const [analysisTriggered, setAnalysisTriggered] = useState(false);
  const [aiAnimationDone, setAiAnimationDone] = useState(false);
  const [showVentilationTable, setShowVentilationTable] = useState(false);
  const [validatedSuccess, setValidatedSuccess] = useState(() => confirmed);
  const [isEditing, setIsEditing] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [extractedInvoices, setExtractedInvoices] = useState<ExtractedInvoice[]>(MOCK_EXTRACTED_INVOICES);
  const [extractionResults, setExtractionResults] = useState<ExtractDocumentResult[]>([]);
  const [extractionFileNames, setExtractionFileNames] = useState<string[]>([]);
  const [extractionProcessing, setExtractionProcessing] = useState(false);
  const [extractionProgressLabel, setExtractionProgressLabel] = useState<string>();
  const [supabaseDocByFileKey, setSupabaseDocByFileKey] = useState<Record<string, string>>({});
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

  const continuityDisplayCount =
    sectionUploadCounts.continuity > 0 ? sectionUploadCounts.continuity : continuityDocs.length;
  const travauxDisplayCount =
    sectionUploadCounts.travaux > 0 ? sectionUploadCounts.travaux : travauxDocs.length;
  const mobilierDisplayCount =
    sectionUploadCounts.mobilier > 0 ? sectionUploadCounts.mobilier : mobilierDocs.length;

  const continuityCount = Math.max(continuityDocs.length, sectionUploadCounts.continuity);
  const travauxCount = Math.max(travauxDocs.length, sectionUploadCounts.travaux);
  const mobilierCount = Math.max(mobilierDocs.length, sectionUploadCounts.mobilier);
  const totalUploadedCount = continuityCount + travauxCount + mobilierCount;

  const activityAnswered = existingActivity !== null;
  const needsContinuity = existingActivity === "yes";
  const continuityReady =
    !needsContinuity || continuitySkipped || sectionUploadCounts.continuity > 0;
  const travauxReady = travauxSkipped || sectionUploadCounts.travaux > 0;
  const mobilierReady = mobilierSkipped || sectionUploadCounts.mobilier > 0;
  const allSectionsReady = continuityReady && travauxReady && mobilierReady;
  const uploadsComplete = allSectionsReady;

  const relevantDocs = useMemo(() => {
    const matched = [...continuityDocs, ...travauxDocs, ...mobilierDocs];
    if (matched.length > 0 || totalUploadedCount === 0) return matched;
    return workspace.documents.filter(
      (doc) => doc.category === "amortissement" || doc.category === "charges",
    );
  }, [continuityDocs, travauxDocs, mobilierDocs, totalUploadedCount, workspace.documents]);

  const pendingDocIds = useMemo(
    () => relevantDocs.filter((doc) => doc.status === "uploaded").map((doc) => doc.id),
    [relevantDocs],
  );

  useEffect(() => {
    const hasRemoteRestored = workspace.documents.some((doc) => doc.remoteRestored);
    if (!hasRemoteRestored) return;

    setSectionUploadCounts((current) => ({
      continuity: Math.max(
        current.continuity,
        countAmortissementDocuments(workspace.documents, "continuity"),
      ),
      travaux: Math.max(current.travaux, countAmortissementDocuments(workspace.documents, "travaux")),
      mobilier: Math.max(
        current.mobilier,
        countAmortissementDocuments(workspace.documents, "mobilier"),
      ),
    }));
  }, [workspace.documents]);

  const hasProcessing = relevantDocs.some((doc) => doc.status === "processing");
  const hasFailed = relevantDocs.some((doc) => doc.status === "failed");
  const documentsReady =
    totalUploadedCount === 0 || allDocumentsAnalyzed(relevantDocs);
  const canRunAi =
    analysisTriggered && !aiAnimationDone && !confirmed && !manualMode;
  const isProcessing = canRunAi;
  const isFailed =
    hasFailed && !aiAnimationDone && !manualMode && (readyForAnalysis || analysisTriggered);
  const fromChargesItems = draft?.amortissementFromCharges ?? [];

  const showConfiguredCard = (validatedSuccess || confirmed) && !isEditing;
  const showSummary = aiAnimationDone && !showVentilationTable && !showConfiguredCard;
  const showTable = showVentilationTable && !showConfiguredCard;
  const showFromChargesSection =
    fromChargesItems.length > 0 && (aiAnimationDone || showConfiguredCard || showVentilationTable);

  const continuityStepDone = !needsContinuity || continuitySkipped || sectionContinued.continuity;
  const travauxStepDone = travauxSkipped || sectionContinued.travaux;
  const mobilierStepDone = mobilierSkipped || sectionContinued.mobilier;

  const continuityCanContinue =
    sectionUploadCounts.continuity > 0 && !sectionContinued.continuity;
  const travauxCanContinue = sectionUploadCounts.travaux > 0 && !sectionContinued.travaux;
  const mobilierCanContinue =
    allSectionsReady &&
    !sectionContinued.mobilier &&
    (sectionUploadCounts.mobilier > 0 || mobilierDisplayCount > 0);
  const showMobilierLaunchAnalysis = mobilierCanContinue;

  const showContinuitySection = activityAnswered && needsContinuity && !continuitySkipped;
  const showTravauxSection =
    activityAnswered && !travauxSkipped && (continuityStepDone || allSectionsReady);
  const showMobilierSection =
    activityAnswered && !mobilierSkipped && (travauxStepDone || allSectionsReady);

  const showAnalysisCTA =
    allSectionsReady && !aiAnimationDone && !confirmed && !manualMode && !isProcessing;
  const showFooterAnalysisCTA =
    showAnalysisCTA && !(showMobilierSection && showMobilierLaunchAnalysis);
  const showResultsPanel = showSummary && Boolean(ventilation);
  const showNextStepCTA = showConfiguredCard && Boolean(ventilation);
  const showFooterActions = showFooterAnalysisCTA || showNextStepCTA;

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
    setSectionContinued({ continuity: false, travaux: false, mobilier: false });
    setReadyForAnalysis(false);
    setAnalysisTriggered(false);
    setAiAnimationDone(false);
    setShowVentilationTable(false);
    setValidatedSuccess(false);
    setManualMode(false);
    persistActivity(value);
  };

  const handleClassificationResolved = useCallback(
    (extractionRowId: string, classification: ResolvedDocumentClassification) => {
      setExtractionResults((current) =>
        current.map((result) =>
          result.id === extractionRowId ? { ...result, classification } : result,
        ),
      );
    },
    [],
  );

  const runExtraction = useCallback(
    async (documentIds: string[]) => {
      if (!documentIds.length) {
        console.log("[analysis] extraction skipped", {
          source: "AmortissementDocumentStep.runExtraction",
          reason: "empty documentIds",
        });
        return;
      }
      if (analyzingRef.current) {
        console.log("[analysis] extraction skipped", {
          source: "AmortissementDocumentStep.runExtraction",
          reason: "already analyzing",
          documentIds,
        });
        return;
      }

      const dossierId = getCurrentDossierId();
      if (!dossierId) {
        console.log("[analysis] extraction skipped", {
          source: "AmortissementDocumentStep.runExtraction",
          reason: "no active dossier_id",
          documentIds,
        });
        console.error("[extract] aborted: no active dossier_id");
        return;
      }

      console.log("[analysis] trigger requested", {
        source: "AmortissementDocumentStep.runExtraction",
        documentIds,
        dossierId,
        pipeline: "runBulkDocumentExtraction",
      });

      analyzingRef.current = true;
      setExtractionProcessing(true);
      setExtractionResults([]);
      setExtractionProgressLabel("Préparation de l'analyse…");

      const processedDocIds: string[] = [];
      const items: Array<{
        file: File;
        documentId?: string | null;
        label: string;
        legacyDocumentCategory?: string;
      }> = [];

      for (const docId of documentIds) {
        const doc = relevantDocs.find((d) => d.id === docId);
        if (!doc) continue;

        try {
          const file = await resolveDocumentFile(doc, getFile);
          processedDocIds.push(docId);
          items.push({
            file,
            documentId: supabaseDocByFileKey[fileUploadKey(file)] ?? doc.id,
            label: doc.fileName,
            legacyDocumentCategory: doc.category,
          });

          dispatch({ type: "DOCUMENT_SET_STATUS", documentId: docId, status: "processing" });
        } catch (err) {
          console.error("[extract] file resolve failed", {
            docId,
            fileName: doc.fileName,
            storagePath: doc.storagePath,
            err,
          });
          dispatch({ type: "DOCUMENT_SET_STATUS", documentId: docId, status: "failed" });
        }
      }

      if (!items.length) {
        console.log("[analysis] no analyzable documents", {
          source: "AmortissementDocumentStep.runExtraction",
          reason: "no resolvable files after download",
          documentIds,
        });
        analyzingRef.current = false;
        setExtractionProcessing(false);
        setExtractionProgressLabel(undefined);
        return;
      }

      setExtractionFileNames(items.map((item) => item.label));

      try {
        const { results, succeeded, failed } = await runBulkDocumentExtraction({
          items,
          dossierId,
          onProgress: (index, total, label) => {
            setExtractionProgressLabel(`Analyse ${index + 1}/${total} : ${label}`);
          },
        });

        setExtractionResults(results);

        processedDocIds.forEach((docId, index) => {
          const result = results[index];
          dispatch({
            type: "DOCUMENT_SET_STATUS",
            documentId: docId,
            status: result?.extractionStatus === "completed" ? "analyzed" : "failed",
          });
        });

        console.log("[analysis] extraction completed", {
          source: "AmortissementDocumentStep.runExtraction",
          pipeline: "runBulkDocumentExtraction",
          succeeded,
          failed,
        });
        console.log("[extract] batch complete", { succeeded, failed });
      } finally {
        setExtractionProcessing(false);
        setExtractionProgressLabel(undefined);
        analyzingRef.current = false;
      }
    },
    [relevantDocs, getFile, dispatch, supabaseDocByFileKey],
  );

  useEffect(() => {
    if (!analysisTriggered) {
      if (pendingDocIds.length > 0) {
        console.log("[analysis] extraction skipped", {
          source: "AmortissementDocumentStep.useEffect",
          reason: "analysisTriggered is false — user has not launched analysis yet",
          pendingDocIds,
        });
      }
      return;
    }
    if (!pendingDocIds.length) {
      console.log("[analysis] no analyzable documents", {
        source: "AmortissementDocumentStep.useEffect",
        reason: "no pending uploaded docs",
        relevantDocCount: relevantDocs.length,
      });
      return;
    }
    if (hasProcessing) {
      console.log("[analysis] extraction skipped", {
        source: "AmortissementDocumentStep.useEffect",
        reason: "hasProcessing",
        pendingDocIds,
      });
      return;
    }
    if (analyzingRef.current) {
      console.log("[analysis] extraction skipped", {
        source: "AmortissementDocumentStep.useEffect",
        reason: "analyzingRef already set",
        pendingDocIds,
      });
      return;
    }

    console.log("[analysis] trigger requested", {
      source: "AmortissementDocumentStep.useEffect",
      pendingDocIds,
      pipeline: "runBulkDocumentExtraction",
    });
    void runExtraction(pendingDocIds);
  }, [analysisTriggered, pendingDocIds.join(","), hasProcessing, runExtraction, relevantDocs.length, pendingDocIds]);

  useEffect(() => {
    if (isProcessing) {
      console.log("[analysis] animation triggered");
    }
  }, [isProcessing]);

  useEffect(() => {
    console.log("[AmortissementDocumentStep] workflow state", {
      continuityReady,
      travauxReady,
      mobilierReady,
      uploadsComplete,
      allSectionsReady,
      sectionContinued,
      sectionUploadCounts,
      continuityDisplayCount,
      travauxDisplayCount,
      mobilierDisplayCount,
      continuityDocs: continuityDocs.length,
      travauxDocs: travauxDocs.length,
      mobilierDocs: mobilierDocs.length,
      relevantDocs: relevantDocs.length,
      continuityCanContinue,
      travauxCanContinue,
      mobilierCanContinue,
      showMobilierLaunchAnalysis,
      showAnalysisCTA,
      showFooterAnalysisCTA,
      showResultsPanel,
      showNextStepCTA,
      showFooterActions,
      showSummary,
      showConfiguredCard,
      isProcessing,
      aiAnimationDone,
      showContinueButton: {
        continuity: continuityCanContinue,
        travaux: travauxCanContinue,
        mobilier: showMobilierLaunchAnalysis,
      },
      readyForAnalysis,
      analysisTriggered,
      documentsReady,
      canRunAi,
    });
  }, [
    continuityReady,
    travauxReady,
    mobilierReady,
    uploadsComplete,
    allSectionsReady,
    sectionContinued,
    sectionUploadCounts,
    continuityDisplayCount,
    travauxDisplayCount,
    mobilierDisplayCount,
    continuityDocs.length,
    travauxDocs.length,
    mobilierDocs.length,
    relevantDocs.length,
    continuityCanContinue,
    travauxCanContinue,
    mobilierCanContinue,
    showMobilierLaunchAnalysis,
    showAnalysisCTA,
    showFooterAnalysisCTA,
    showResultsPanel,
    showNextStepCTA,
    showFooterActions,
    showSummary,
    showConfiguredCard,
    isProcessing,
    aiAnimationDone,
    readyForAnalysis,
    analysisTriggered,
    documentsReady,
    canRunAi,
  ]);

  useEffect(() => {
    if (confirmed) {
      setValidatedSuccess(true);
      setIsEditing(false);
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

  const handleSectionContinue = (section: "continuity" | "travaux" | "mobilier") => {
    setSectionContinued((current) => ({ ...current, [section]: true }));

    if (section === "mobilier") {
      handleLaunchAnalysis();
    }
  };

  function handleLaunchAnalysis() {
    console.log("[analysis] handleLaunchAnalysis start", {
      allSectionsReady,
      confirmed,
      manualMode,
      aiAnimationDone,
      analysisTriggered,
      documentsReady,
    });

    if (!allSectionsReady || confirmed || manualMode || aiAnimationDone || analysisTriggered) {
      console.log("[analysis] handleLaunchAnalysis blocked");
      return;
    }

    setReadyForAnalysis(true);
    setAnalysisTriggered(true);
    console.log("[analysis] readyForAnalysis set");
    console.log("[analysis] processing started");
  }

  const handleUpload = (
    files: File[],
    category: DocumentCategory,
    section: "continuity" | "travaux" | "mobilier",
    meta?: { supabaseDocumentIds: string[] },
  ) => {
    if (!files.length) return;

    setValidatedSuccess(false);
    setAiAnimationDone(false);
    setShowVentilationTable(false);
    setManualMode(false);
    setReadyForAnalysis(false);
    setAnalysisTriggered(false);
    setExtractionResults([]);
    setExtractionFileNames([]);

    if (meta?.supabaseDocumentIds?.length) {
      setSupabaseDocByFileKey((current) => {
        const next = { ...current };
        files.forEach((file, index) => {
          const supabaseDocumentId = meta.supabaseDocumentIds[index];
          if (supabaseDocumentId) {
            next[fileUploadKey(file)] = supabaseDocumentId;
          }
        });
        return next;
      });
    }

    setSectionUploadCounts((current) => ({
      ...current,
      [section]: current[section] + files.length,
    }));
    setSectionContinued((current) => ({
      ...current,
      [section]: false,
    }));

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
    console.log("[analysis] summary generation triggered");
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
    setAnalysisTriggered(true);
    setExtractionResults([]);
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

  function handleEditFromCharges(itemId: string) {
    const item = fromChargesItems.find((entry) => entry.id === itemId);
    if (!item) return;

    setIsEditing(true);
    setShowVentilationTable(true);
    setValidatedSuccess(false);

    if (!ventilation) {
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
    }
  }

  function handleConfirm() {
    if (!ventilation) return;
    dispatch({
      type: "CONFIRM_AMORTISSEMENT",
      ventilation,
    });
    setValidatedSuccess(true);
    setIsEditing(false);
    showSuccess(
      "Amortissements préparés",
      "Vos données seront réutilisées pour les prochaines années fiscales.",
    );
  }

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <WorkflowPageBackLink />

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
        uploadedCount={continuityDisplayCount}
        uploadedFileName={latestDocumentName(workspace.documents, isContinuityDocument)}
        onFiles={(files, meta) => handleUpload(files, "amortissement", "continuity", meta)}
        canContinue={continuityCanContinue}
        onContinue={() => handleSectionContinue("continuity")}
        onSkip={() => setContinuitySkipped(true)}
        skipLabel="Continuer sans document de continuité"
        visible={showContinuitySection}
        cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
      />

      <AmortissementUploadSection
        title="Ajoutez vos factures de travaux"
        uploadedCount={travauxDisplayCount}
        uploadedFileName={latestDocumentName(workspace.documents, isTravauxDocument)}
        onFiles={(files, meta) => handleUpload(files, "charges", "travaux", meta)}
        canContinue={travauxCanContinue}
        onContinue={() => handleSectionContinue("travaux")}
        onSkip={() => setTravauxSkipped(true)}
        skipLabel="Je n'ai pas de factures de travaux"
        visible={showTravauxSection}
        cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
        delayMs={200}
      />

      <AmortissementUploadSection
        title="Ajoutez vos factures de mobilier"
        uploadedCount={mobilierDisplayCount}
        uploadedFileName={latestDocumentName(workspace.documents, isMobilierDocument)}
        onFiles={(files, meta) => handleUpload(files, "amortissement", "mobilier", meta)}
        canContinue={showMobilierLaunchAnalysis}
        onContinue={() => handleSectionContinue("mobilier")}
        continueLabel="Lancer l'analyse"
        onSkip={() => setMobilierSkipped(true)}
        skipLabel="Je n'ai pas de factures de mobilier"
        visible={showMobilierSection}
        cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
        delayMs={400}
      />

      {isProcessing ? (
        <ActiviteAiProcessing onComplete={handleAiAnimationComplete} steps={AMORTISSEMENT_AI_STEPS} />
      ) : null}

      {analysisTriggered || extractionResults.length > 0 ? (
        <DocumentExtractionSummary
          results={extractionResults}
          fileNames={extractionFileNames}
          isProcessing={extractionProcessing}
          progressLabel={extractionProgressLabel}
          cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
          onClassificationResolved={handleClassificationResolved}
        />
      ) : null}

      {aiAnimationDone && !showVentilationTable && !showConfiguredCard ? (
        <AmortissementItemCards
          invoices={extractedInvoices}
          cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
          visible={travauxCount > 0 || mobilierCount > 0 || manualMode}
        />
      ) : null}

      {showFromChargesSection ? (
        <AmortissementFromChargesSection
          items={fromChargesItems}
          onEdit={handleEditFromCharges}
          cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
        />
      ) : null}

      {showResultsPanel ? (
        <AmortissementSummaryCard
          summary={ventilation!.summary}
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

      {showFooterActions ? (
        <div className="flex w-full flex-col items-center gap-4 animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]">
          {showFooterAnalysisCTA ? (
            <Button
              onClick={() => {
                console.log("[analysis] button clicked");
                handleLaunchAnalysis();
              }}
            >
              Lancer l&apos;analyse
            </Button>
          ) : null}
          {showNextStepCTA ? <WorkflowProgressionActions currentStepId="amortissement" /> : null}
        </div>
      ) : null}

      {showConfiguredCard && ventilation ? (
        <>
          <ConfiguredDossierCard
            title="✓ Amortissements configurés"
            rows={buildAmortissementConfiguredSummary(
              ventilation,
              draft?.propertyBackgroundExtraction?.acquisitionPrice,
            )}
            onEdit={() => {
              setIsEditing(true);
              setShowVentilationTable(true);
              setVentilation(ventilationFromDraft(draft) ?? ventilation);
            }}
          />
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
