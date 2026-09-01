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
  mapExtractionResultToAnalysisResult,
  mapExtractionResultToInvoice,
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
import {
  makeDocumentEnrichedEvent,
  makeAnalysisFailedEvent,
  makeValidationEvent,
  makeRecommendationEvent,
} from "@/lib/lmnp/services/ai-activity-events";
import { AiActivityFeed } from "@/components/lmnp/ai-activity";
import { useLmnp } from "@/lib/lmnp/store";
import type { TunnelStepProps } from "@/components/lmnp/documents/frozen-tunnel-step";
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

type LaunchAnalysisEligibilityInput = {
  allSectionsReady: boolean;
  aiAnimationDone: boolean;
  confirmed: boolean;
  manualMode: boolean;
  isProcessing: boolean;
};

/** Shared gate for launching analysis and all upload-section primary CTAs. */
function canLaunchAnalysis(input: LaunchAnalysisEligibilityInput): boolean {
  return (
    input.allSectionsReady &&
    !input.aiAnimationDone &&
    !input.confirmed &&
    !input.manualMode &&
    !input.isProcessing
  );
}

function launchEligibilityReasons(input: LaunchAnalysisEligibilityInput): string[] {
  const reasons: string[] = [];
  if (!input.allSectionsReady) reasons.push("notAllSectionsReady");
  if (input.aiAnimationDone) reasons.push("aiAnimationDone");
  if (input.confirmed) reasons.push("confirmed");
  if (input.manualMode) reasons.push("manualMode");
  if (input.isProcessing) reasons.push("isProcessing");
  return reasons;
}

function unmetRequirements(requirements: Record<string, boolean>): string[] {
  return Object.entries(requirements)
    .filter(([, met]) => !met)
    .map(([key]) => key);
}

type AllSectionsReadyDiagnosticsInput = {
  needsContinuity: boolean;
  continuitySkipped: boolean;
  travauxSkipped: boolean;
  mobilierSkipped: boolean;
  hasDetectedMobilier: boolean;
  sectionUploadCounts: { continuity: number; travaux: number; mobilier: number };
};

function allSectionsReadyDiagnostics(input: AllSectionsReadyDiagnosticsInput) {
  const continuityReady =
    !input.needsContinuity || input.continuitySkipped || input.sectionUploadCounts.continuity > 0;
  const travauxReady = input.travauxSkipped || input.sectionUploadCounts.travaux > 0;
  const mobilierReady =
    input.mobilierSkipped ||
    input.sectionUploadCounts.mobilier > 0 ||
    !input.hasDetectedMobilier;
  const allSectionsReady = continuityReady && travauxReady && mobilierReady;

  const blockingConditions: string[] = [];
  const readyConditions: string[] = [];

  if (!continuityReady) {
    blockingConditions.push("continuity:needsUploadOrSkip");
  } else {
    if (!input.needsContinuity) readyConditions.push("continuity:notRequired");
    if (input.continuitySkipped) readyConditions.push("continuity:skipped");
    if (input.sectionUploadCounts.continuity > 0) readyConditions.push("continuity:hasUploads");
  }

  if (!travauxReady) {
    blockingConditions.push("travaux:needsUploadOrSkip");
  } else {
    if (input.travauxSkipped) readyConditions.push("travaux:skipped");
    if (input.sectionUploadCounts.travaux > 0) readyConditions.push("travaux:hasUploads");
  }

  if (!mobilierReady) {
    blockingConditions.push("mobilier:needsUploadOrSkip");
  } else {
    if (!input.hasDetectedMobilier) readyConditions.push("mobilier:notDetectedOptional");
    if (input.mobilierSkipped) readyConditions.push("mobilier:skipped");
    if (input.sectionUploadCounts.mobilier > 0) readyConditions.push("mobilier:hasUploads");
  }

  return {
    continuityReady,
    travauxReady,
    mobilierReady,
    allSectionsReady,
    blockingConditions,
    readyConditions,
    breakdown: {
      continuity: {
        ready: continuityReady,
        needsContinuity: input.needsContinuity,
        skipped: input.continuitySkipped,
        uploadCount: input.sectionUploadCounts.continuity,
      },
      travaux: {
        ready: travauxReady,
        skipped: input.travauxSkipped,
        uploadCount: input.sectionUploadCounts.travaux,
      },
      mobilier: {
        ready: mobilierReady,
        detected: input.hasDetectedMobilier,
        skipped: input.mobilierSkipped,
        uploadCount: input.sectionUploadCounts.mobilier,
      },
    },
  };
}

function launchEligibleDiagnostics(
  launchInput: LaunchAnalysisEligibilityInput,
  sectionsBlocking: string[],
) {
  const launchBlockingConditions = launchEligibilityReasons(launchInput);
  const launchReadyConditions: string[] = [];

  if (launchInput.allSectionsReady) launchReadyConditions.push("allSectionsReady");
  if (!launchInput.aiAnimationDone) launchReadyConditions.push("aiAnimationPending");
  if (!launchInput.confirmed) launchReadyConditions.push("notConfirmed");
  if (!launchInput.manualMode) launchReadyConditions.push("notManualMode");
  if (!launchInput.isProcessing) launchReadyConditions.push("notProcessing");

  const launchEligible = canLaunchAnalysis(launchInput);
  const blockingConditions = [
    ...sectionsBlocking,
    ...launchBlockingConditions.filter((reason) => reason !== "notAllSectionsReady"),
  ];

  return {
    launchEligible,
    blockingConditions,
    launchBlockingConditions,
    launchReadyConditions,
  };
}

export function AmortissementDocumentStep({ isActive = true }: TunnelStepProps) {
  const { workspace, dispatch, getFile } = useLmnp();
  const { showSuccess, showInfo } = useFeedback();
  const analyzingRef = useRef(false);
  const aiAnimationDoneSourceRef = useRef<string>("initial");

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
  const [extractedInvoices, setExtractedInvoices] = useState<ExtractedInvoice[]>(
    () => draft?.amortissementExtractedInvoices ?? [],
  );
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
  const hasDetectedMobilier = mobilierDocs.length > 0;
  const mobilierReady =
    mobilierSkipped || sectionUploadCounts.mobilier > 0 || !hasDetectedMobilier;
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

  const launchEligibilityInput: LaunchAnalysisEligibilityInput = {
    allSectionsReady,
    aiAnimationDone,
    confirmed,
    manualMode,
    isProcessing,
  };
  const launchEligible = canLaunchAnalysis(launchEligibilityInput);
  const launchIneligibleReasons = launchEligibilityReasons(launchEligibilityInput);

  const continuitySectionReady =
    sectionUploadCounts.continuity > 0 && !sectionContinued.continuity;
  const travauxSectionReady = sectionUploadCounts.travaux > 0 && !sectionContinued.travaux;
  const mobilierSectionReady =
    !sectionContinued.mobilier && sectionUploadCounts.mobilier > 0;

  const continuityCanContinue = continuitySectionReady && launchEligible;
  const travauxCanContinue = travauxSectionReady && launchEligible;
  const mobilierCanContinue = mobilierSectionReady && launchEligible;
  const showMobilierLaunchAnalysis = mobilierCanContinue;

  const showContinuitySection = activityAnswered && needsContinuity && !continuitySkipped;
  const showTravauxSection =
    activityAnswered && !travauxSkipped && (continuityStepDone || allSectionsReady);
  const showMobilierSection =
    activityAnswered &&
    !mobilierSkipped &&
    hasDetectedMobilier &&
    (travauxStepDone || allSectionsReady);
  const showMobilierDetectedNotice = showMobilierSection && hasDetectedMobilier;

  const showAnalysisCTA = launchEligible;
  const showFooterAnalysisCTA =
    launchEligible && !(showMobilierSection && showMobilierLaunchAnalysis);
  const showResultsPanel = showSummary && Boolean(ventilation);
  const showNextStepCTA = showConfiguredCard && Boolean(ventilation);
  const showFooterActions = showFooterAnalysisCTA || showNextStepCTA;

  const workflowRecomputeLog = useMemo(() => {
    const sectionsDiag = allSectionsReadyDiagnostics({
      needsContinuity,
      continuitySkipped,
      travauxSkipped,
      mobilierSkipped,
      hasDetectedMobilier,
      sectionUploadCounts,
    });
    const launchDiag = launchEligibleDiagnostics(
      launchEligibilityInput,
      sectionsDiag.blockingConditions,
    );

    const mobilierSectionHiddenBecause = unmetRequirements({
      activityAnswered,
      mobilierNotSkipped: !mobilierSkipped,
      mobilierDetected: hasDetectedMobilier,
      travauxStepDoneOrAllSectionsReady: travauxStepDone || allSectionsReady,
    });

    const launchAnalysisCtaHiddenBecause: string[] = [];
    if (!launchEligible) {
      launchAnalysisCtaHiddenBecause.push(...launchDiag.launchBlockingConditions);
    }
    if (!showMobilierLaunchAnalysis) {
      if (!mobilierSectionReady) {
        if (sectionContinued.mobilier) {
          launchAnalysisCtaHiddenBecause.push("mobilierInline:sectionAlreadyContinued");
        }
        if (sectionUploadCounts.mobilier === 0) {
          launchAnalysisCtaHiddenBecause.push("mobilierInline:noMobilierUploads");
        }
      }
      if (!launchEligible && mobilierSectionReady) {
        launchAnalysisCtaHiddenBecause.push("mobilierInline:launchNotEligible");
      }
    }
    if (!showFooterAnalysisCTA) {
      if (!launchEligible) {
        launchAnalysisCtaHiddenBecause.push("footer:launchNotEligible");
      } else if (showMobilierSection && showMobilierLaunchAnalysis) {
        launchAnalysisCtaHiddenBecause.push("footer:suppressedByMobilierInlineCta");
      }
    }

    const nextStepCtaHiddenBecause = unmetRequirements({
      configuredOrValidatedCard: showConfiguredCard,
      hasVentilation: Boolean(ventilation),
    });

    const blockingConditions = launchDiag.blockingConditions;
    const readyConditions = launchDiag.launchEligible
      ? [...sectionsDiag.readyConditions, ...launchDiag.launchReadyConditions]
      : sectionsDiag.readyConditions;

    return {
      continuityReady: sectionsDiag.continuityReady,
      travauxReady: sectionsDiag.travauxReady,
      mobilierReady: sectionsDiag.mobilierReady,
      uploadsComplete: sectionsDiag.allSectionsReady,
      confirmed,
      manualMode,
      aiAnimationDone,
      aiAnimationDoneSource: aiAnimationDoneSourceRef.current,
      analysisTriggered,
      isProcessing,
      allSectionsReady: sectionsDiag.allSectionsReady,
      launchEligible: launchDiag.launchEligible,
      blockingConditions,
      readyConditions,
      allSectionsReadyBreakdown: {
        blockingConditions: sectionsDiag.blockingConditions,
        readyConditions: sectionsDiag.readyConditions,
        breakdown: sectionsDiag.breakdown,
      },
      launchEligibleBreakdown: {
        blockingConditions: launchDiag.launchBlockingConditions,
        readyConditions: launchDiag.launchReadyConditions,
      },
      visibilityExplanations: {
        amortissementsMobilierSection: {
          visible: showMobilierSection,
          hiddenBecause: mobilierSectionHiddenBecause,
          requirements: {
            activityAnswered,
            mobilierNotSkipped: !mobilierSkipped,
            mobilierDetected: hasDetectedMobilier,
            travauxStepDoneOrAllSectionsReady: travauxStepDone || allSectionsReady,
          },
        },
        launchAnalysisCta: {
          footerVisible: showFooterAnalysisCTA,
          mobilierInlineVisible: showMobilierLaunchAnalysis,
          anyVisible: showFooterAnalysisCTA || showMobilierLaunchAnalysis,
          hiddenBecause: [...new Set(launchAnalysisCtaHiddenBecause)],
        },
        nextStepCta: {
          visible: showNextStepCTA,
          hiddenBecause: nextStepCtaHiddenBecause,
          requirements: {
            configuredOrValidatedCard: showConfiguredCard,
            hasVentilation: Boolean(ventilation),
            validatedSuccess,
            isEditing,
            amortissementConfirmedAt: confirmed,
          },
        },
      },
    };
  }, [
    needsContinuity,
    continuitySkipped,
    travauxSkipped,
    mobilierSkipped,
    hasDetectedMobilier,
    sectionUploadCounts,
    launchEligibilityInput,
    activityAnswered,
    mobilierSkipped,
    travauxStepDone,
    allSectionsReady,
    launchEligible,
    showMobilierSection,
    showMobilierLaunchAnalysis,
    showFooterAnalysisCTA,
    mobilierSectionReady,
    sectionContinued.mobilier,
    showConfiguredCard,
    ventilation,
    validatedSuccess,
    isEditing,
    confirmed,
    manualMode,
    aiAnimationDone,
    analysisTriggered,
    isProcessing,
    showNextStepCTA,
  ]);

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
    aiAnimationDoneSourceRef.current = "activity-change-reset";
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

        const persistedInvoices: ExtractedInvoice[] = [];

        processedDocIds.forEach((docId, index) => {
          const result = results[index];
          const doc = relevantDocs.find((d) => d.id === docId);
          if (!doc) return;

          if (result?.extractionStatus === "completed") {
            // APPLY_DOCUMENT_ANALYSIS: writes extraction entry to workspace.extractions,
            // sets doc.status = "analyzed", and makes hydration promotion visible on reload.
            const analysisResult = mapExtractionResultToAnalysisResult(doc, result);
            dispatch({ type: "APPLY_DOCUMENT_ANALYSIS", documentId: docId, result: analysisResult });

            // Collect invoice for ventilation (skip continuity docs — no invoice data there).
            if (!isContinuityDocument(doc)) {
              persistedInvoices.push(mapExtractionResultToInvoice(doc, result));
            }

            // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
            console.log("[amortissement-analysis-persist]", {
              documentId: docId,
              fileName: doc.fileName,
              extractionKeys: Object.keys(analysisResult.extractions[0] ?? {}),
              extractionType: "APPLY_DOCUMENT_ANALYSIS",
              persisted: true,
            });
          } else {
            dispatch({ type: "DOCUMENT_SET_STATUS", documentId: docId, status: "failed" });
          }
        });

        // Persist invoices to draft so they survive remounts and hydration.
        if (persistedInvoices.length > 0) {
          dispatch({
            type: "DECLARATION_PATCH_DRAFT",
            patch: { amortissementExtractedInvoices: persistedInvoices },
          });
          setExtractedInvoices(persistedInvoices);
        }

        console.log("[analysis] extraction completed", {
          source: "AmortissementDocumentStep.runExtraction",
          pipeline: "runBulkDocumentExtraction",
          succeeded,
          failed,
        });
        console.log("[extract] batch complete", { succeeded, failed });

        const propertyLabel = workspace.properties[0]?.label?.trim() || "Amortissements";

        if (succeeded > 0) {
          dispatch({
            type: "ADD_AI_ACTIVITY_EVENT",
            event: makeDocumentEnrichedEvent(
              "amortissement",
              "amortissement-main",
              propertyLabel,
              processedDocIds[0] ?? "batch",
              `${succeeded} document${succeeded > 1 ? "s" : ""} analysé${succeeded > 1 ? "s" : ""}`,
              "L'IA a extrait les informations de vos documents d'amortissement.",
              { nextValues: { succeeded } },
            ),
          });
        }

        if (failed > 0) {
          dispatch({
            type: "ADD_AI_ACTIVITY_EVENT",
            event: makeAnalysisFailedEvent(
              "amortissement",
              "amortissement-main",
              propertyLabel,
              processedDocIds[0] ?? "batch",
              `${failed} document${failed > 1 ? "s" : ""} n'ont pas pu être analysés. Essayez de les réimporter.`,
            ),
          });
        }
      } finally {
        setExtractionProcessing(false);
        setExtractionProgressLabel(undefined);
        analyzingRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [relevantDocs, getFile, dispatch, supabaseDocByFileKey, workspace.properties],
  );

  useEffect(() => {
    const extractionBlockers = {
      analysisNotTriggered: !analysisTriggered,
      noPendingDocs: pendingDocIds.length === 0,
      hasProcessing,
      analyzingRefBusy: analyzingRef.current,
    };
    const blockedReasons = (
      Object.entries(extractionBlockers) as Array<[keyof typeof extractionBlockers, boolean]>
    )
      .filter(([, blocked]) => blocked)
      .map(([key]) => key);

    // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
    console.log("[amortissement-analysis-execution]", {
      analysisTriggered,
      pendingDocIds,
      blockedReasons,
      shouldTriggerAnalysis: blockedReasons.length === 0,
      uploadedDocs: relevantDocs
        .filter((d) => d.status === "uploaded")
        .map((d) => ({ id: d.id, fileName: d.fileName, status: d.status })),
      workspaceExtractionCount: workspace.extractions.length,
      extractionsForRelevantDocs: workspace.extractions.filter((e) =>
        relevantDocs.some((d) => d.id === e.documentId),
      ).length,
    });

    if (blockedReasons.length > 0) {
      if (pendingDocIds.length > 0 || analysisTriggered) {
        console.log("[analysis] extraction effect skipped", {
          blockedReasons,
          extractionBlockers,
          pendingDocIds,
          relevantDocCount: relevantDocs.length,
          relevantDocStatuses: relevantDocs.map((doc) => ({
            id: doc.id,
            status: doc.status,
            fileName: doc.fileName,
          })),
        });
      }
      return;
    }

    console.log("[analysis] extraction effect starting", {
      pendingDocIds,
      pipeline: "runBulkDocumentExtraction",
    });
    // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
    console.log("[ocr-trigger-owner]", {
      system: "T6-amortissement-manual",
      component: "AmortissementDocumentStep",
      reason: "analysisTriggered=true + pendingDocIds non-empty",
      docs: pendingDocIds,
      step: "amortissement",
      category: "amortissement",
      guard: "analysisTriggered(user-click) + pendingDocIds + hasProcessing + analyzingRef — NO executionPendingRef (manual gate instead)",
    });
    void runExtraction(pendingDocIds);
  }, [analysisTriggered, pendingDocIds.join(","), hasProcessing, runExtraction, relevantDocs.length, pendingDocIds]);

  useEffect(() => {
    if (isProcessing) {
      console.log("[analysis] animation triggered");
    }
  }, [isProcessing]);

  useEffect(() => {
    console.log("[AmortissementDocumentStep] workflow recompute", workflowRecomputeLog);
  }, [workflowRecomputeLog]);

  useEffect(() => {
    if (confirmed) {
      setValidatedSuccess(true);
      setIsEditing(false);
      aiAnimationDoneSourceRef.current = "confirmed-hydration";
      setAiAnimationDone(true);
      setShowVentilationTable(true);
      setVentilation(ventilationFromDraft(draft));
      if (draft?.amortissementExistingActivity === true) setExistingActivity("yes");
      if (draft?.amortissementExistingActivity === false) setExistingActivity("no");
      return;
    }

    if (draft?.amortissementVentilation && !ventilation) {
      console.log("[analysis] draft ventilation restored without aiAnimationDone", {
        source: "AmortissementDocumentStep.useEffect",
        aiAnimationDoneSource: aiAnimationDoneSourceRef.current,
        requiresConfirmedForAnimationDone: true,
      });
      setVentilation(draft.amortissementVentilation);
    }
  }, [confirmed, draft, ventilation]);

  // Restore persisted extracted invoices from draft on remount / hydration.
  // Skipped when an active analysis session is running to avoid clobbering in-flight results.
  useEffect(() => {
    const stored = draft?.amortissementExtractedInvoices;
    if (!stored?.length || analysisTriggered) return;
    setExtractedInvoices(stored);
    // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
    stored.forEach((invoice) => {
      const doc = relevantDocs.find((d) => d.id === invoice.id);
      const extractionCountForDoc = workspace.extractions.filter(
        (e) => e.documentId === invoice.id,
      ).length;
      console.log("[amortissement-restored-extractions]", {
        documentId: invoice.id,
        status: doc?.status,
        extractionCountForDoc,
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.amortissementExtractedInvoices]);

  // Restore post-analysis workflow stage from persisted analyzed documents.
  // Fires when all relevant docs are "analyzed" with persisted extractions but the
  // local UI hasn't advanced past the pre-analysis screen yet (aiAnimationDone = false).
  // This effect is the ONLY place that sets aiAnimationDone outside of user-driven flows.
  useEffect(() => {
    if (confirmed) return; // already handled by the confirmed restore effect above
    if (aiAnimationDone) return; // already in post-analysis state
    if (analysisTriggered) return; // active extraction in progress
    if (relevantDocs.length === 0) return;

    if (!allDocumentsAnalyzed(relevantDocs)) return;

    const hasPersistedExtractions = relevantDocs.some((doc) =>
      workspace.extractions.some((e) => e.documentId === doc.id),
    );
    const hasDraftInvoices = Boolean(draft?.amortissementExtractedInvoices?.length);
    if (!hasPersistedExtractions && !hasDraftInvoices) return;

    // All docs analyzed + extractions confirmed — advance to post-analysis stage.
    const storedInvoices = draft?.amortissementExtractedInvoices ?? [];

    // Restore section counts from actual workspace docs so allSectionsReady is correct.
    setSectionUploadCounts((current) => ({
      continuity: Math.max(current.continuity, continuityDocs.length),
      travaux: Math.max(current.travaux, travauxDocs.length),
      mobilier: Math.max(current.mobilier, mobilierDocs.length),
    }));
    // Mark all sections as continued so the progression gates open.
    setSectionContinued({ continuity: true, travaux: true, mobilier: true });

    // Rebuild ventilation from persisted extractions and invoices.
    const restoredVentilation = buildVentilationFromDossier(
      {
        fiscalYear: workspace.fiscalYear,
        properties: workspace.properties,
        documents: workspace.documents,
        extractions: workspace.extractions,
        validationItems: workspace.validationItems,
        ledgerEntries: workspace.ledgerEntries,
        declarationDraft: workspace.declarationDraft,
      },
      storedInvoices,
    );
    setVentilation(restoredVentilation);
    aiAnimationDoneSourceRef.current = "hydration-restore";
    setAiAnimationDone(true);

    // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
    const analyzedDocs = relevantDocs.filter(
      (doc) => doc.status === "analyzed" || doc.status === "failed",
    );
    const extractionCounts = Object.fromEntries(
      relevantDocs.map((doc) => [
        doc.id,
        workspace.extractions.filter((e) => e.documentId === doc.id).length,
      ]),
    );
    console.log("[amortissement-workflow-restore]", {
      analyzedDocs: analyzedDocs.map((doc) => ({ id: doc.id, status: doc.status })),
      extractionCounts,
      continuityReady,
      travauxReady,
      mobilierReady,
      uploadsComplete: allSectionsReady,
      confirmed,
      restoredWorkflowStage: "post-analysis",
    });
  // Intentional: we only re-evaluate when the extractions list or relevant-doc
  // statuses change. Other deps (workspace shape, ventilation, counts) are
  // stable once hydration has completed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantDocs, workspace.extractions, confirmed, aiAnimationDone, analysisTriggered]);

  const handleSectionContinue = (section: "continuity" | "travaux" | "mobilier") => {
    setSectionContinued((current) => ({ ...current, [section]: true }));

    if (section === "mobilier") {
      handleLaunchAnalysis("mobilier-section");
    }
  };

  function handleLaunchAnalysis(source: "footer" | "mobilier-section" = "footer") {
    const blockedReasons = [
      ...launchIneligibleReasons,
      ...(analysisTriggered ? ["alreadyTriggered"] : []),
    ];

    console.log("[analysis] handleLaunchAnalysis", {
      source,
      blocked: blockedReasons.length > 0,
      blockedReasons,
      launchEligible,
      launchIneligibleReasons,
      aiAnimationDoneSource: aiAnimationDoneSourceRef.current,
      ctaVisibility: {
        continuity: continuityCanContinue,
        travaux: travauxCanContinue,
        mobilier: showMobilierLaunchAnalysis,
        footer: showFooterAnalysisCTA,
      },
      pendingDocIds,
      documentsReady,
    });

    if (!launchEligible || analysisTriggered) {
      console.log("[analysis] handleLaunchAnalysis blocked", { blockedReasons });
      return;
    }

    setReadyForAnalysis(true);
    setAnalysisTriggered(true);
    console.log("[analysis] handleLaunchAnalysis accepted", { source });
  }

  const handleUpload = (
    files: File[],
    category: DocumentCategory,
    section: "continuity" | "travaux" | "mobilier",
    meta?: { supabaseDocumentIds: string[] },
  ) => {
    if (!files.length) return;

    setValidatedSuccess(false);
    aiAnimationDoneSourceRef.current = "upload-reset";
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
    aiAnimationDoneSourceRef.current = "ai-animation-complete";
    setAiAnimationDone(true);
  }, [workspace, extractedInvoices]);

  function handleRetry() {
    const failedIds = [...continuityDocs, ...travauxDocs, ...mobilierDocs]
      .filter((doc) => doc.status === "failed")
      .map((doc) => doc.id);
    failedIds.forEach((documentId) => {
      dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "uploaded" });
    });
    aiAnimationDoneSourceRef.current = "retry-reset";
    setAiAnimationDone(false);
    setShowVentilationTable(false);
    setReadyForAnalysis(true);
    setAnalysisTriggered(true);
    setExtractionResults([]);
  }

  function handleManualContinue() {
    setManualMode(true);
    aiAnimationDoneSourceRef.current = "manual-continue";
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

    const propertyLabel = workspace.properties[0]?.label?.trim() || "Amortissements";
    const componentCount = ventilation.components.length;
    dispatch({
      type: "ADD_AI_ACTIVITY_EVENT",
      event: makeValidationEvent(
        "amortissement",
        "amortissement-main",
        propertyLabel,
        `${componentCount} composant${componentCount > 1 ? "s" : ""} d'amortissement vérifiés et enregistrés.`,
      ),
    });

    // Emit a recommendation if there are large work amounts that need attention
    const travauxComponents = ventilation.components.filter(
      (c) => c.source === "travaux" && c.amount > 10000,
    );
    if (travauxComponents.length > 0) {
      dispatch({
        type: "ADD_AI_ACTIVITY_EVENT",
        event: makeRecommendationEvent(
          "amortissement",
          "amortissement-main",
          propertyLabel,
          "Durée d'amortissement à vérifier",
          `${travauxComponents.length} composant${travauxComponents.length > 1 ? "s" : ""} de travaux ont été détectés. Vérifiez la durée d'amortissement recommandée avec votre comptable.`,
        ),
      });
    }

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
        title="Ajoutez vos factures de travaux (et mobilier si concerné)"
        helper="Vous pouvez regrouper ici vos factures de travaux et, le cas échéant, vos factures de mobilier. Une section dédiée apparaîtra si du mobilier est détecté."
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

      {showMobilierDetectedNotice ? (
        <p
          className="mx-auto max-w-2xl text-center animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
          style={{ ...typography.body.desktop, color: colors.text.secondary }}
        >
          Du mobilier a été détecté dans vos documents. Nous avons créé une section dédiée.
        </p>
      ) : null}

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

      <AiActivityFeed
        events={workspace.aiActivityFeed}
        step="amortissement"
        onReimport={() => handleRetry()}
      />
    </div>
  );
}
