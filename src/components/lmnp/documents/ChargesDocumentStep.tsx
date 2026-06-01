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
import { uploadFilesForUser } from "@/lib/uploadDocument";
import { supabase } from "@/lib/supabase";
import {
  areChargesExtractionsEqual,
  buildChargesDraftPatch,
  buildChargesExtraction,
  chargesExtractionFingerprint,
  chargesFromDraft,
  countChargesDocuments,
  isChargesExtractionIncomplete,
  logChargesAuthority,
  logChargesLoopGuard,
  resolveChargesAmortizationDecisions,
  resolveChargesDocuments,
  hasCrossStepRecoveryAvailable,
  type ChargesExtractionBuildContext,
  type ChargesExtractionData,
  type ChargesExtractionSource,
} from "@/lib/lmnp/services/charges-profile";
import { buildChargesConfiguredSummary } from "@/lib/lmnp/services/configured-dossier-summaries";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import {
  makeDocumentEnrichedEvent,
  makeAnalysisFailedEvent,
  makeValidationEvent,
} from "@/lib/lmnp/services/ai-activity-events";
import { AiActivityFeed } from "@/components/lmnp/ai-activity";
import { useTunnelHydration } from "@/lib/lmnp/hydration";
import { useLmnp } from "@/lib/lmnp/store";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { TunnelStepProps } from "@/components/lmnp/documents/frozen-tunnel-step";

const CHARGES_UPLOAD_CATEGORY = "charges" as const;

const CHARGES_AI_STEPS = [
  "Documents détectés",
  "Classification des charges",
  "Préparation des données",
  "Vérification cohérence",
] as const;

function chargesBuildContext(
  workspace: PersistedWorkspace,
  draft?: DeclarationDraft,
  options?: Pick<ChargesExtractionBuildContext, "includeCrossStepRecovery" | "requireAnalyzedDocuments">,
): ChargesExtractionBuildContext {
  return {
    documents: workspace.documents,
    extractions: workspace.extractions,
    chargeDocumentIds: draft?.chargesDocumentIds,
    includeCrossStepRecovery: options?.includeCrossStepRecovery,
    requireAnalyzedDocuments: options?.requireAnalyzedDocuments,
  };
}

function chargesRestoreDebugPayload(
  trigger: string,
  ws: PersistedWorkspace,
  currentDraft: DeclarationDraft | undefined,
  chargesDocs: ReturnType<typeof resolveChargesDocuments>,
  pendingDocIds: string[],
): {
  trigger: string;
  restoredDocumentIds: string[];
  currentUploadDocumentIds: string[];
  staleDocumentIds: string[];
  pendingDocumentIds: string[];
  analyzedDocumentIds: string[];
} {
  const restoredDocumentIds = currentDraft?.chargesDocumentIds ?? [];
  const currentUploadDocumentIds = chargesDocs.map((doc) => doc.id);
  const analyzedDocumentIds = chargesDocs
    .filter((doc) => doc.status === "analyzed")
    .map((doc) => doc.id);
  const staleDocumentIds = analyzedDocumentIds.filter(
    (id) => pendingDocIds.length > 0 && !pendingDocIds.includes(id),
  );

  return {
    trigger,
    restoredDocumentIds,
    currentUploadDocumentIds,
    staleDocumentIds,
    pendingDocumentIds: pendingDocIds,
    analyzedDocumentIds,
  };
}

function logChargesRestoreDebug(
  trigger: string,
  ws: PersistedWorkspace,
  currentDraft: DeclarationDraft | undefined,
  chargesDocs: ReturnType<typeof resolveChargesDocuments>,
  pendingDocIds: string[],
): void {
  console.log(
    "[charges-debug-restore]",
    chargesRestoreDebugPayload(trigger, ws, currentDraft, chargesDocs, pendingDocIds),
  );
}

function logChargesAnalyzedDocumentsSelector(
  chargesDocs: ReturnType<typeof resolveChargesDocuments>,
): void {
  const analyzedDocuments = chargesDocs.filter((doc) => doc.status === "analyzed");
  console.log("[charges-analyzed-selector]", {
    analyzedDocuments: analyzedDocuments.map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      status: doc.status,
      documentType: doc.documentType,
      category: doc.category,
    })),
    allChargesDocs: chargesDocs.map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      status: doc.status,
      documentType: doc.documentType,
    })),
  });
}

export function ChargesDocumentStep({ isActive = true }: TunnelStepProps) {
  const { workspace, dispatch, getFile } = useLmnp();
  const { showSuccess, showInfo } = useFeedback();
  const { markExecution, shouldRunExtraction } = useTunnelHydration("charges");
  const analyzingRef = useRef(false);
  const pendingUploadRef = useRef(false);
  const executionPendingRef = useRef(false);
  const syncedConfirmedAtRef = useRef<string | undefined>(undefined);
  const lastAmortizationRefreshKeyRef = useRef<string>("");
  const lastAmortizationAppliedFingerprintRef = useRef<string>("");
  const lastPersistedExtractionFingerprintRef = useRef<string>("");
  const lastRestoreRebuildKeyRef = useRef<string>("");
  const lastAnimationRebuildKeyRef = useRef<string>("");
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  const draft = workspace.declarationDraft;
  const draftRef = useRef(draft);
  draftRef.current = draft;
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
  const hasAnalyzedChargeDocs = useMemo(
    () => chargesDocs.some((doc) => doc.status === "analyzed"),
    [chargesDocs],
  );
  const crossStepRecoveryEnabled = Boolean(draft?.chargesCrossStepRecoveryEnabled);
  const primaryPropertyLabel = workspace.properties[0]?.label?.trim() || "Bien locatif";
  const canOfferCrossStepRecovery = useMemo(
    () =>
      uploadedCount > 0 &&
      !crossStepRecoveryEnabled &&
      hasCrossStepRecoveryAvailable(draft, primaryPropertyLabel),
    [uploadedCount, crossStepRecoveryEnabled, draft, primaryPropertyLabel],
  );

  const [hasUploaded, setHasUploaded] = useState(
    () => Boolean(draft?.chargesDocumentIds?.length || draft?.chargesConfirmedAt),
  );
  const [aiAnimationDone, setAiAnimationDone] = useState(false);
  const [validatedSuccess, setValidatedSuccess] = useState(() => confirmed);
  const [isEditing, setIsEditing] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [extraction, setExtraction] = useState<ChargesExtractionData | undefined>(() => {
    if (draft?.chargesDocumentIds?.length && !confirmed) return undefined;
    return chargesFromDraft(draft, { documents: workspace.documents });
  });
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [transferConfirmedId, setTransferConfirmedId] = useState<string | null>(null);

  // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
  useEffect(() => {
    const analyzedCount = chargesDocs.filter((d) => d.status === "analyzed").length;
    const pendingCount = chargesDocs.filter((d) => d.status === "uploaded").length;
    console.log("[charges-remount]", {
      chargesDocsCount: chargesDocs.length,
      analyzedCount,
      pendingCount,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
  useEffect(() => {
    const pendingDocs = chargesDocs.filter((d) => d.status === "uploaded");
    console.log("[charges-pending-derivation]", {
      pendingDocs: pendingDocs.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        status: doc.status,
        hasAnalysis: workspaceRef.current.extractions.some((e) => e.documentId === doc.id),
      })),
    });
  }, [chargesDocs]);

  const pendingDocIds = useMemo(
    () => chargesDocs.filter((doc) => doc.status === "uploaded").map((doc) => doc.id),
    [chargesDocs],
  );
  const analyzedDocuments = useMemo(
    () => chargesDocs.filter((doc) => doc.status === "analyzed"),
    [chargesDocs],
  );
  const hasProcessing = chargesDocs.some((doc) => doc.status === "processing");
  const hasFailed = chargesDocs.some((doc) => doc.status === "failed");

  // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
  useEffect(() => {
    const ws = workspaceRef.current;
    console.log("[charges-analyzed-debug]", {
      allChargesDocs: chargesDocs.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        status: doc.status,
        category: doc.category,
        documentType: doc.documentType,
        hasExtractions: ws.extractions.some((e) => e.documentId === doc.id),
      })),
      analyzedDocs: analyzedDocuments.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
      })),
    });
  }, [chargesDocs, analyzedDocuments]);

  // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
  useEffect(() => {
    const ws = workspaceRef.current;
    console.log("[charges-pending-debug]", {
      pendingDocs: pendingDocIds.map((id) => {
        const doc = chargesDocs.find((d) => d.id === id);
        return {
          id,
          fileName: doc?.fileName,
          status: doc?.status,
          category: doc?.category,
          documentType: doc?.documentType,
          hasExtractions: ws.extractions.some((e) => e.documentId === id),
        };
      }),
    });
  }, [pendingDocIds, chargesDocs]);

  // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
  useEffect(() => {
    const ws = workspaceRef.current;
    console.log("[charges-final-selector-state]", {
      allChargesDocs: chargesDocs.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        status: doc.status,
        category: doc.category,
        documentType: doc.documentType,
        hasExtractions: ws.extractions.some((e) => e.documentId === doc.id),
      })),
      analyzedDocs: analyzedDocuments.map((doc) => ({
        id: doc.id,
        status: doc.status,
      })),
      pendingDocs: pendingDocIds.map((id) => {
        const doc = chargesDocs.find((d) => d.id === id);
        return { id, status: doc?.status };
      }),
      totalExtractions: ws.extractions.length,
      chargesExtractionDocIds: ws.extractions
        .filter((e) =>
          chargesDocs.some((d) => d.id === e.documentId),
        )
        .map((e) => e.documentId)
        .filter((v, i, a) => a.indexOf(v) === i),
    });
  }, [chargesDocs, analyzedDocuments, pendingDocIds]);

  const isProcessing =
    hasUploaded &&
    !confirmed &&
    !aiAnimationDone &&
    !manualMode &&
    uploadedCount > 0 &&
    !hasAnalyzedChargeDocs;
  const isFailed = hasFailed && !aiAnimationDone && !manualMode && hasUploaded;
  const showConfiguredCard = (validatedSuccess || confirmed) && !isEditing;
  const hasChargeRows =
    Boolean(extraction) &&
    (extraction!.categories.length > 0 || extraction!.recoveredFromOtherSteps > 0);
  const showChargesContent =
    aiAnimationDone && !showConfiguredCard && Boolean(extraction) && hasChargeRows;
  const showEmptyExtraction =
    aiAnimationDone && !showConfiguredCard && Boolean(extraction) && !hasChargeRows && hasUploaded;
  const incomplete = extraction ? isChargesExtractionIncomplete(extraction) : false;

  const amortizationDecisionsKey = useMemo(
    () =>
      (draft?.chargesAmortizationDecisions ?? [])
        .map((item) => `${item.expenseLineId}:${item.status}`)
        .join("|"),
    [draft?.chargesAmortizationDecisions],
  );

  const chargesBuildKey = useMemo(() => {
    const docSig = chargesDocs.map((doc) => `${doc.id}:${doc.status}`).join("|");
    const propertySig = workspace.properties
      .map((property) => `${property.id ?? ""}:${property.label ?? ""}`)
      .join("|");
    const linkedIds = new Set([
      ...chargesDocs.map((doc) => doc.id),
      ...(draft?.chargesDocumentIds ?? []),
    ]);
    const extractionSig = workspace.extractions
      .filter((entry) => linkedIds.has(entry.documentId))
      .map(
        (entry) =>
          `${entry.documentId}:${entry.fieldKey}:${entry.status}:${JSON.stringify(entry.normalizedValue)}`,
      )
      .sort()
      .join("|");
    return [
      docSig,
      propertySig,
      extractionSig,
      draft?.chargesDocumentIds?.join(",") ?? "",
      crossStepRecoveryEnabled ? "1" : "0",
    ].join("::");
  }, [
    chargesDocs,
    workspace.properties,
    workspace.extractions,
    draft?.chargesDocumentIds,
    crossStepRecoveryEnabled,
  ]);

  const restoreRebuildKey = useMemo(() => {
    if (chargesConfirmedAt) return "confirmed";
    return [
      draft?.chargesDocumentIds?.join(",") ?? "",
      hasAnalyzedChargeDocs ? "1" : "0",
      crossStepRecoveryEnabled ? "1" : "0",
      chargesBuildKey,
    ].join("|");
  }, [
    chargesConfirmedAt,
    draft?.chargesDocumentIds,
    hasAnalyzedChargeDocs,
    crossStepRecoveryEnabled,
    chargesBuildKey,
  ]);

  const animationRebuildKey = useMemo(() => {
    if (
      !draft?.chargesDocumentIds?.length ||
      !hasAnalyzedChargeDocs ||
      aiAnimationDone ||
      confirmed
    ) {
      return "";
    }
    return [
      draft.chargesDocumentIds.join(","),
      crossStepRecoveryEnabled ? "1" : "0",
      chargesBuildKey,
    ].join("|");
  }, [
    draft?.chargesDocumentIds,
    hasAnalyzedChargeDocs,
    aiAnimationDone,
    confirmed,
    crossStepRecoveryEnabled,
    chargesBuildKey,
  ]);

  const amortizationDecisions = useMemo(() => {
    if (!extraction) return [];
    return resolveChargesAmortizationDecisions(extraction, draft);
  }, [extraction, amortizationDecisionsKey, draft?.chargesExtraction]);

  const pendingSuggestions = useMemo(
    () => pendingAmortizationSuggestions(amortizationDecisions),
    [amortizationDecisions],
  );

  const extractionRef = useRef(extraction);
  extractionRef.current = extraction;

  const persistChargesExtraction = useCallback(
    (nextExtraction: ChargesExtractionData, triggeredBy: string) => {
      if (areChargesExtractionsEqual(extractionRef.current, nextExtraction)) {
        logChargesLoopGuard({ skippedBecauseEqual: true, triggeredBy });
        return;
      }

      const fingerprint = chargesExtractionFingerprint(nextExtraction);
      if (fingerprint === lastPersistedExtractionFingerprintRef.current) {
        logChargesLoopGuard({ skippedBecauseEqual: true, triggeredBy });
        return;
      }
      lastPersistedExtractionFingerprintRef.current = fingerprint;

      setExtraction(nextExtraction);
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: buildChargesDraftPatch(nextExtraction, draftRef.current),
      });
    },
    [dispatch],
  );

  const applyAuthoritativeExtraction = useCallback(
    (
      rebuilt: ChargesExtractionData,
      authority: {
        source: ChargesExtractionSource;
        authoritative: boolean;
      },
      triggeredBy: string,
    ) => {
      if (areChargesExtractionsEqual(extractionRef.current, rebuilt)) {
        logChargesLoopGuard({ skippedBecauseEqual: true, triggeredBy });
        return;
      }

      logChargesAuthority({
        source: authority.source,
        authoritative: authority.authoritative,
        replacedPreviousExtraction: extractionRef.current !== undefined,
        categoryCount: rebuilt.categories.length,
      });
      persistChargesExtraction(rebuilt, triggeredBy);
    },
    [persistChargesExtraction],
  );

  const handleAiAnimationComplete = useCallback(() => {
    if (!hasAnalyzedChargeDocs) return;
    const ws = workspaceRef.current;
    const currentDraft = draftRef.current;
    const pendingIds = ws.documents
      .filter((doc) => doc.status === "uploaded")
      .map((doc) => doc.id);
    logChargesRestoreDebug(
      "ai-animation-complete",
      ws,
      currentDraft,
      resolveChargesDocuments(ws.documents, currentDraft?.chargesDocumentIds),
      pendingIds.filter((id) =>
        resolveChargesDocuments(ws.documents, currentDraft?.chargesDocumentIds).some(
          (doc) => doc.id === id,
        ),
      ),
    );
    const rebuilt = buildChargesExtraction(
      ws.properties,
      currentDraft,
      chargesBuildContext(ws, currentDraft, {
        requireAnalyzedDocuments: true,
        includeCrossStepRecovery: crossStepRecoveryEnabled,
      }),
    );
    applyAuthoritativeExtraction(rebuilt, { source: "documents", authoritative: true }, "ai-animation");
    setAiAnimationDone(true);
  }, [hasAnalyzedChargeDocs, crossStepRecoveryEnabled, applyAuthoritativeExtraction]);

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

    const fromDraft = chargesFromDraft(draft, { documents: workspace.documents });
    if (fromDraft) {
      applyAuthoritativeExtraction(fromDraft, {
        source: "draft_restore",
        authoritative: true,
      }, "confirmed-restore");
    }
  }, [chargesConfirmedAt, draft, workspace.documents, applyAuthoritativeExtraction]);

  useEffect(() => {
    logChargesAnalyzedDocumentsSelector(chargesDocs);
  }, [chargesDocs]);

  useEffect(() => {
    if (chargesConfirmedAt) return;
    if (lastRestoreRebuildKeyRef.current === restoreRebuildKey) {
      console.log("[charges-effect-skip]", { effect: "restore-rebuild", key: restoreRebuildKey });
      return;
    }

    const ws = workspaceRef.current;
    const currentDraft = draftRef.current;
    const pendingIds = chargesDocs.filter((doc) => doc.status === "uploaded").map((doc) => doc.id);

    if (currentDraft?.chargesDocumentIds?.length) {
      logChargesRestoreDebug("restore-rebuild:pre-check", ws, currentDraft, chargesDocs, pendingIds);

      if (!hasAnalyzedChargeDocs) return;

      if (pendingDocIds.length > 0) {
        console.log("[charges-rebuild-guard]", {
          reason: "pending-documents",
          pendingDocIds,
        });
        return;
      }

      console.log("[charges-rebuild-snapshot]", {
        trigger: "restore-rebuild",
        workspaceDocuments: ws.documents.map((d) => ({
          id: d.id,
          fileName: d.fileName,
          status: d.status,
          documentType: d.documentType,
          category: d.category,
        })),
        chargesDocumentIds: currentDraft?.chargesDocumentIds ?? [],
        pendingDocIds,
      });

      const rebuilt = buildChargesExtraction(
        ws.properties,
        currentDraft,
        chargesBuildContext(ws, currentDraft, {
          requireAnalyzedDocuments: true,
          includeCrossStepRecovery: crossStepRecoveryEnabled,
        }),
      );
      if (areChargesExtractionsEqual(extractionRef.current, rebuilt)) {
        lastRestoreRebuildKeyRef.current = restoreRebuildKey;
        logChargesLoopGuard({ skippedBecauseEqual: true, triggeredBy: "restore-rebuild" });
        console.log("[charges-effect-skip]", {
          effect: "restore-rebuild",
          reason: "equalExtraction",
          key: restoreRebuildKey,
        });
        setAiAnimationDone(true);
        setHasUploaded(true);
        return;
      }

      console.log("[charges-effect-run]", { effect: "restore-rebuild", key: restoreRebuildKey });
      logChargesRestoreDebug("restore-rebuild:document-rebuild", ws, currentDraft, chargesDocs, pendingIds);
      lastRestoreRebuildKeyRef.current = restoreRebuildKey;
      applyAuthoritativeExtraction(rebuilt, { source: "documents", authoritative: true }, "restore-rebuild");
      setAiAnimationDone(true);
      setHasUploaded(true);
      return;
    }

    const restored = chargesFromDraft(currentDraft, { documents: ws.documents });
    if (!restored) return;
    logChargesRestoreDebug("restore-rebuild:draft-fallback", ws, currentDraft, chargesDocs, pendingIds);
    if (areChargesExtractionsEqual(extractionRef.current, restored)) {
      lastRestoreRebuildKeyRef.current = restoreRebuildKey;
      logChargesLoopGuard({ skippedBecauseEqual: true, triggeredBy: "restore-rebuild" });
      console.log("[charges-effect-skip]", {
        effect: "restore-rebuild",
        reason: "equalExtraction",
        key: restoreRebuildKey,
      });
      setAiAnimationDone(true);
      setHasUploaded(true);
      return;
    }

    console.log("[charges-effect-run]", { effect: "restore-rebuild", key: restoreRebuildKey });
    lastRestoreRebuildKeyRef.current = restoreRebuildKey;
    applyAuthoritativeExtraction(restored, { source: "draft_restore", authoritative: false }, "restore-rebuild");
    setAiAnimationDone(true);
    setHasUploaded(true);
  }, [
    chargesConfirmedAt,
    restoreRebuildKey,
    hasAnalyzedChargeDocs,
    crossStepRecoveryEnabled,
    applyAuthoritativeExtraction,
  ]);

  useEffect(() => {
    if (chargesDocs.length === 0) return;

    const ids = chargesDocs.map((doc) => doc.id);
    const existing = new Set(draft?.chargesDocumentIds ?? []);
    const missing = ids.filter((id) => !existing.has(id));
    if (missing.length === 0) {
      pendingUploadRef.current = false;
      return;
    }

    pendingUploadRef.current = false;
    ids.forEach((id) => existing.add(id));
    console.log("[charges-pno-debug] chargesDocumentIds sync", {
      added: missing,
      merged: [...existing],
      uploadedDocumentIds: chargesDocs
        .filter((doc) => doc.status === "uploaded")
        .map((doc) => doc.id),
      analyzedDocumentIds: chargesDocs
        .filter((doc) => doc.status === "analyzed")
        .map((doc) => doc.id),
      chargesDocStatuses: chargesDocs.map((doc) => ({
        id: doc.id,
        status: doc.status,
        documentType: doc.documentType,
        fileName: doc.fileName,
      })),
    });
    dispatch({
      type: "DECLARATION_PATCH_DRAFT",
      patch: { chargesDocumentIds: [...existing] },
    });
  }, [chargesDocs, draft?.chargesDocumentIds, dispatch]);

  const runAnalysis = useCallback(
    async (documentIds: string[]) => {
      // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
      const uploadedCount = workspaceRef.current.documents.filter(
        (d) => d.status === "uploaded",
      ).length;
      const analyzedCount = workspaceRef.current.documents.filter(
        (d) => d.status === "analyzed",
      ).length;
      console.log("[charges-runAnalysis-entry]", {
        pendingDocIds: documentIds,
        uploadedCount,
        analyzedCount,
        analyzingRefAlreadySet: analyzingRef.current,
      });

      if (!documentIds.length) {
        console.log("[analysis] extraction skipped", {
          source: "ChargesDocumentStep.runAnalysis",
          reason: "empty documentIds",
        });
        return;
      }
      if (analyzingRef.current) {
        console.log("[analysis] extraction skipped", {
          source: "ChargesDocumentStep.runAnalysis",
          reason: "already analyzing",
          documentIds,
        });
        return;
      }
      analyzingRef.current = true;

      console.log("[analysis] trigger requested", {
        source: "ChargesDocumentStep.runAnalysis",
        documentIds,
        pipeline: "runBulkDocumentAnalysis",
        note: "Charges does NOT call runBulkDocumentExtraction",
      });
      // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
      console.log("[charges-runBulk-callsite]", {
        source: "ChargesDocumentStep.runAnalysis",
        documentIds,
        stack: new Error().stack,
      });

      try {
        const result = await runBulkDocumentAnalysis({
          documents: workspace.documents,
          documentIds,
          getFile,
          dispatch,
          fiscalYear: workspace.fiscalYear.year,
        });

        const propertyLabel =
          workspaceRef.current.properties[0]?.label?.trim() || "Charges déductibles";

        if (result.succeeded > 0) {
          dispatch({
            type: "ADD_AI_ACTIVITY_EVENT",
            event: makeDocumentEnrichedEvent(
              "charges",
              "charges-main",
              propertyLabel,
              documentIds[0] ?? "batch",
              `${result.succeeded} document${result.succeeded > 1 ? "s" : ""} analysé${result.succeeded > 1 ? "s" : ""}`,
              `L'IA a extrait les charges déductibles depuis vos documents.`,
              { nextValues: { documentsAnalysed: result.succeeded } },
            ),
          });
        }

        if (result.failed > 0) {
          const failedId = documentIds.find((id) => {
            const doc = workspaceRef.current.documents.find((d) => d.id === id);
            return doc?.status === "failed";
          }) ?? documentIds[0] ?? "batch";
          dispatch({
            type: "ADD_AI_ACTIVITY_EVENT",
            event: makeAnalysisFailedEvent(
              "charges",
              "charges-main",
              propertyLabel,
              failedId,
              `${result.failed} document${result.failed > 1 ? "s" : ""} n'a pas pu être analysé. Essayez de réimporter avec un autre format.`,
            ),
          });
        }
      } finally {
        analyzingRef.current = false;
      }
    },
    [workspace.documents, workspace.fiscalYear.year, getFile, dispatch],
  );

  useEffect(() => {
    const uploadedDocumentIds = chargesDocs
      .filter((doc) => doc.status === "uploaded")
      .map((doc) => doc.id);
    const analyzedDocumentIds = chargesDocs
      .filter((doc) => doc.status === "analyzed")
      .map((doc) => doc.id);

    // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
    const shouldTriggerAnalysis =
      pendingDocIds.length > 0 && !hasProcessing && !analyzingRef.current;
    console.log("[charges-analysis-trigger]", {
      uploadedDocs: chargesDocs.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        status: doc.status,
        hasAnalysis: workspaceRef.current.extractions.some((e) => e.documentId === doc.id),
        detectedDocumentType: doc.documentType,
      })),
      pendingDocIds,
      analyzedDocumentIds,
      shouldTriggerAnalysis,
    });

    if (!pendingDocIds.length) {
      if (hasUploaded || chargesDocs.length > 0) {
        console.log("[charges-pno-debug] analysis gate", {
          reason: "no pending uploaded docs",
          chargeDocumentIds: draft?.chargesDocumentIds ?? [],
          uploadedDocumentIds,
          analyzedDocumentIds,
          pendingDocIds,
          hasProcessing,
          analyzing: analyzingRef.current,
          chargesDocStatuses: chargesDocs.map((doc) => ({
            id: doc.id,
            status: doc.status,
            documentType: doc.documentType,
            fileName: doc.fileName,
          })),
        });
        console.log("[analysis] no analyzable documents", {
          source: "ChargesDocumentStep.useEffect",
          reason: "no pending uploaded docs",
          hasUploaded,
          chargesDocCount: chargesDocs.length,
          chargesDocStatuses: chargesDocs.map((doc) => ({ id: doc.id, status: doc.status })),
        });
      }
      return;
    }
    if (hasProcessing) {
      console.log("[charges-pno-debug] analysis gate", {
        reason: "hasProcessing",
        chargeDocumentIds: draft?.chargesDocumentIds ?? [],
        uploadedDocumentIds,
        analyzedDocumentIds,
        pendingDocIds,
      });
      console.log("[analysis] extraction skipped", {
        source: "ChargesDocumentStep.useEffect",
        reason: "hasProcessing",
        pendingDocIds,
      });
      return;
    }
    if (analyzingRef.current) {
      console.log("[charges-pno-debug] analysis gate", {
        reason: "analyzingRef already set",
        chargeDocumentIds: draft?.chargesDocumentIds ?? [],
        uploadedDocumentIds,
        analyzedDocumentIds,
        pendingDocIds,
      });
      console.log("[analysis] extraction skipped", {
        source: "ChargesDocumentStep.useEffect",
        reason: "analyzingRef already set",
        pendingDocIds,
      });
      return;
    }

    // LIFECYCLE FIREWALL — mirrors the pattern used in CreditDocumentStep / RevenusDocumentStep
    // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
    console.log("[charges-lifecycle-firewall]", {
      executionPending: executionPendingRef.current,
      shouldRun: shouldRunExtraction(),
      pendingDocIds,
    });
    if (!executionPendingRef.current || !shouldRunExtraction()) {
      console.log("[analysis] extraction skipped", {
        source: "ChargesDocumentStep.useEffect",
        reason: !executionPendingRef.current ? "no_execution_pending" : "passive_hydration",
        pendingDocIds,
      });
      return;
    }
    executionPendingRef.current = false;

    console.log("[charges-pno-debug] analysis gate", {
      reason: "triggering runAnalysis",
      chargeDocumentIds: draft?.chargesDocumentIds ?? [],
      uploadedDocumentIds,
      analyzedDocumentIds,
      pendingDocIds,
    });
    console.log("[analysis] trigger requested", {
      source: "ChargesDocumentStep.useEffect",
      pendingDocIds,
      pipeline: "runBulkDocumentAnalysis",
    });
    // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
    console.log("[charges-ocr-trigger]", {
      reason: "pendingDocIds non-empty",
      pendingDocIds,
      documentsSnapshot: chargesDocs.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        status: doc.status,
        hasAnalysis: workspaceRef.current.extractions.some((e) => e.documentId === doc.id),
      })),
    });
    // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
    console.log("[charges-runAnalysis-callsite]", {
      source: "ChargesDocumentStep.useEffect[pendingDocIds]",
      pendingDocIds,
      shouldTriggerAnalysis: pendingDocIds.length > 0 && !hasProcessing && !analyzingRef.current,
      stack: new Error().stack,
    });
    console.log("[ocr-trigger-owner]", {
      system: "T1-charges-auto",
      component: "ChargesDocumentStep",
      reason: "pendingDocIds non-empty after upload/hydration",
      docs: pendingDocIds,
      step: "charges",
      category: "charges",
      guard: "pendingDocIds + hasProcessing + analyzingRef — NO executionPendingRef",
    });
    void runAnalysis(pendingDocIds);
  }, [pendingDocIds.join(","), hasProcessing, runAnalysis, shouldRunExtraction, chargesDocs, hasUploaded, draft?.chargesDocumentIds]);

  useEffect(() => {
    if (!animationRebuildKey) return;
    if (lastAnimationRebuildKeyRef.current === animationRebuildKey) {
      console.log("[charges-effect-skip]", { effect: "animation-rebuild", key: animationRebuildKey });
      return;
    }

    const ws = workspaceRef.current;
    const currentDraft = draftRef.current;
    const pendingIds = chargesDocs.filter((doc) => doc.status === "uploaded").map((doc) => doc.id);
    if (pendingDocIds.length > 0) {
      console.log("[charges-rebuild-guard]", {
        reason: "pending-documents",
        pendingDocIds,
      });
      return;
    }
    logChargesRestoreDebug("animation-rebuild", ws, currentDraft, chargesDocs, pendingIds);
    console.log("[charges-rebuild-snapshot]", {
      trigger: "animation-rebuild",
      workspaceDocuments: ws.documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        status: d.status,
        documentType: d.documentType,
        category: d.category,
      })),
      chargesDocumentIds: currentDraft?.chargesDocumentIds ?? [],
      pendingDocIds,
    });
    const rebuilt = buildChargesExtraction(
      ws.properties,
      currentDraft,
      chargesBuildContext(ws, currentDraft, {
        requireAnalyzedDocuments: true,
        includeCrossStepRecovery: crossStepRecoveryEnabled,
      }),
    );
    if (areChargesExtractionsEqual(extractionRef.current, rebuilt)) {
      lastAnimationRebuildKeyRef.current = animationRebuildKey;
      logChargesLoopGuard({ skippedBecauseEqual: true, triggeredBy: "animation-rebuild" });
      console.log("[charges-effect-skip]", {
        effect: "animation-rebuild",
        reason: "equalExtraction",
        key: animationRebuildKey,
      });
      setHasUploaded(true);
      setAiAnimationDone(true);
      return;
    }

    console.log("[charges-effect-run]", { effect: "animation-rebuild", key: animationRebuildKey });
    lastAnimationRebuildKeyRef.current = animationRebuildKey;
    setHasUploaded(true);
    applyAuthoritativeExtraction(rebuilt, { source: "documents", authoritative: true }, "animation-rebuild");
    setAiAnimationDone(true);
  }, [animationRebuildKey, crossStepRecoveryEnabled, applyAuthoritativeExtraction]);

  async function handleUpload(files: File[]) {
    if (!files.length) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error("[ChargesDocumentStep] upload aborted: user not authenticated");
      alert("Utilisateur non connecté");
      return;
    }

    const { files: uploadedFiles, documentIds } = await uploadFilesForUser(files, user.id);

    if (uploadedFiles.length === 0) {
      console.error("[ChargesDocumentStep] upload failed: no files stored in Supabase");
      return;
    }

    setValidatedSuccess(false);
    setAiAnimationDone(false);
    setManualMode(false);
    setHasUploaded(true);
    pendingUploadRef.current = true;
    executionPendingRef.current = true;
    markExecution("document_upload");
    // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
    console.log("[charges-execution-intent]", {
      source: "handleUpload",
      pendingDocIds: uploadedFiles.map((_, i) => documentIds[i]),
    });
    lastAmortizationRefreshKeyRef.current = "";
    lastAmortizationAppliedFingerprintRef.current = "";
    lastPersistedExtractionFingerprintRef.current = "";
    lastRestoreRebuildKeyRef.current = "";
    lastAnimationRebuildKeyRef.current = "";

    dispatch({
      type: "UPLOAD_DOCUMENTS",
      files: uploadedFiles.map((file, index) => ({
        file,
        documentId: documentIds[index],
        category: CHARGES_UPLOAD_CATEGORY,
      })),
    });

    console.log("[analysis] trigger requested", {
      source: "ChargesDocumentStep.handleUpload",
      uploadedCount: uploadedFiles.length,
      fileNames: uploadedFiles.map((file) => file.name),
      pipeline: "runBulkDocumentAnalysis",
      note: "upload complete — analysis deferred to useEffect when pendingDocIds populate",
    });

    showInfo(
      `${uploadedFiles.length} fichier${uploadedFiles.length > 1 ? "s" : ""} reçu${uploadedFiles.length > 1 ? "s" : ""}`,
      "L'IA prépare vos charges déductibles.",
    );
  }

  function handleRetry() {
    const failedIds = chargesDocs.filter((doc) => doc.status === "failed").map((doc) => doc.id);
    failedIds.forEach((documentId) => {
      dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "uploaded" });
    });
    executionPendingRef.current = true;
    markExecution("reanalyze");
    // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
    console.log("[charges-execution-intent]", {
      source: "handleRetry",
      pendingDocIds: failedIds,
    });
    setAiAnimationDone(false);
  }

  function handleManualContinue() {
    setManualMode(true);
    setAiAnimationDone(true);
    const rebuilt = buildChargesExtraction(
      workspace.properties,
      draft,
      chargesBuildContext(workspace, draft, {
        requireAnalyzedDocuments: hasAnalyzedChargeDocs,
        includeCrossStepRecovery: crossStepRecoveryEnabled,
      }),
    );
    applyAuthoritativeExtraction(rebuilt, {
      source: hasAnalyzedChargeDocs ? "documents" : "recovered",
      authoritative: hasAnalyzedChargeDocs,
    }, "manual-continue");
  }

  function handleEnableCrossStepRecovery() {
    dispatch({
      type: "DECLARATION_PATCH_DRAFT",
      patch: { chargesCrossStepRecoveryEnabled: true },
    });
    const ws = workspaceRef.current;
    const currentDraft = draftRef.current;
    const rebuilt = buildChargesExtraction(
      ws.properties,
      { ...currentDraft, chargesCrossStepRecoveryEnabled: true },
      chargesBuildContext(ws, currentDraft, {
        requireAnalyzedDocuments: true,
        includeCrossStepRecovery: true,
      }),
    );
    applyAuthoritativeExtraction(rebuilt, { source: "recovered", authoritative: true }, "cross-step-recovery");
    setAiAnimationDone(true);
  }

  useEffect(() => {
    if (!aiAnimationDone || confirmed) return;
    if (lastAmortizationRefreshKeyRef.current === amortizationDecisionsKey) {
      console.log("[charges-effect-skip]", {
        effect: "amortization-refresh",
        reason: "decisionsKey",
        key: amortizationDecisionsKey,
      });
      return;
    }

    const ws = workspaceRef.current;
    const draftState = draftRef.current;
    const decisions = draftState?.chargesAmortizationDecisions;
    const rebuilt = buildChargesExtraction(
      ws.properties,
      draftState,
      chargesBuildContext(ws, draftState, {
        requireAnalyzedDocuments: true,
        includeCrossStepRecovery: draftState?.chargesCrossStepRecoveryEnabled,
      }),
    );
    const withSuggestions: ChargesExtractionData = {
      ...rebuilt,
      amortizationSuggestions:
        decisions && decisions.length > 0
          ? decisions
          : resolveChargesAmortizationDecisions(rebuilt, draftState),
    };

    const fingerprint = chargesExtractionFingerprint(withSuggestions);
    if (
      areChargesExtractionsEqual(extractionRef.current, withSuggestions) ||
      fingerprint === lastAmortizationAppliedFingerprintRef.current
    ) {
      lastAmortizationRefreshKeyRef.current = amortizationDecisionsKey;
      logChargesLoopGuard({ skippedBecauseEqual: true, triggeredBy: "amortization-refresh" });
      console.log("[charges-effect-skip]", {
        effect: "amortization-refresh",
        reason: "equalExtraction",
        key: amortizationDecisionsKey,
      });
      return;
    }

    console.log("[charges-effect-run]", {
      effect: "amortization-refresh",
      key: amortizationDecisionsKey,
    });
    lastAmortizationRefreshKeyRef.current = amortizationDecisionsKey;
    lastAmortizationAppliedFingerprintRef.current = fingerprint;
    applyAuthoritativeExtraction(
      withSuggestions,
      { source: "documents", authoritative: true },
      "amortization-refresh",
    );
  }, [
    amortizationDecisionsKey,
    aiAnimationDone,
    confirmed,
    chargesBuildKey,
    applyAuthoritativeExtraction,
  ]);

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

    const propertyLabel = workspace.properties[0]?.label?.trim() || "Charges déductibles";
    dispatch({
      type: "ADD_AI_ACTIVITY_EVENT",
      event: makeValidationEvent(
        "charges",
        "charges-main",
        propertyLabel,
        `${extraction.summary.categoryCount} catégorie${extraction.summary.categoryCount > 1 ? "s" : ""} de charges vérifiées et enregistrées.`,
      ),
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

      {showEmptyExtraction ? (
        <section
          className="w-full text-center animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
          style={{
            ...DOCUMENT_WORKFLOW_CARD_STYLE,
            padding: spacing.card.md,
          }}
        >
          <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Aucune charge n&apos;a pu être extraite de vos documents pour le moment.
            Vérifiez que l&apos;analyse est terminée ou complétez les informations manuellement.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            {canOfferCrossStepRecovery ? (
              <Button variant="secondary" onClick={handleEnableCrossStepRecovery}>
                Importer les charges des autres étapes
              </Button>
            ) : null}
            <Button variant="secondary" onClick={handleManualContinue}>
              Continuer sans charge détectée
            </Button>
          </div>
        </section>
      ) : null}

      {showChargesContent && canOfferCrossStepRecovery ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={handleEnableCrossStepRecovery}>
            Importer aussi les charges des autres étapes (Crédit, Revenus, Amortissements)
          </Button>
        </div>
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

      <AiActivityFeed
        events={workspace.aiActivityFeed}
        step="charges"
        onReimport={() => handleRetry()}
      />
    </div>
  );
}
