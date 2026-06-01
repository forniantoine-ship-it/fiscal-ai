"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { DocumentUploadZone } from "@/components/lmnp/design-system/DocumentUploadZone";
import { PersistentTunnelPanel } from "@/components/lmnp/documents/PersistentTunnelPanel";
import type { PersistedTunnelId } from "@/components/lmnp/documents/documents-workspace.types";
import {
  FrozenActiviteDocumentStep,
  FrozenAmortissementDocumentStep,
  FrozenChargesDocumentStep,
  FrozenCreditDocumentStep,
  FrozenLogementDocumentStep,
  FrozenRevenusDocumentStep,
  FrozenValidationDocumentStep,
} from "@/components/lmnp/documents/memoized-tunnel-steps";
import { useFeedback } from "@/components/lmnp/shared/FeedbackProvider";
import { WorkflowPageBackLink } from "@/components/lmnp/shared/WorkflowProgressionActions";
import { WorkspaceProgress } from "@/components/lmnp/shared/WorkspaceProgress";
import {
  getDocumentJourneyStep,
  type DocumentJourneyStepId,
} from "@/lib/lmnp/constants/document-journey";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import type { DocumentCategory, LmnpDocument } from "@/lib/lmnp/types";

const STATUS_LABEL: Record<LmnpDocument["status"], string> = {
  uploaded: "En attente d'analyse",
  processing: "Analyse en cours",
  analyzed: "Analysé",
  failed: "Échec de lecture",
};

/** Survives DocumentsWorkspace remounts within the same browser session. */
const visitedPersistedTunnels = new Set<PersistedTunnelId>();

function resolveStepId(
  raw: string | null,
): DocumentJourneyStepId | "credit" | "amortissements" | "revenus" | "charges" | "validation" {
  if (raw === "credit") return "credit";
  if (raw === "amortissements") return "amortissements";
  if (raw === "revenus") return "revenus";
  if (raw === "charges") return "charges";
  if (raw === "validation") return "validation";
  const allowed = new Set([
    "inpi",
    "logement",
    "credit-immobilier",
    "bail",
    "taxe-fonciere",
    "assurance",
    "factures-travaux",
  ]);
  if (raw && allowed.has(raw)) return raw as DocumentJourneyStepId;
  return "inpi";
}

function resolvePersistedTunnel(
  stepId: ReturnType<typeof resolveStepId>,
): PersistedTunnelId | "generic" {
  if (stepId === "credit-immobilier" || stepId === "credit") return "credit";
  if (stepId === "inpi") return "inpi";
  if (stepId === "logement") return "logement";
  if (stepId === "amortissements") return "amortissements";
  if (stepId === "revenus") return "revenus";
  if (stepId === "charges") return "charges";
  if (stepId === "validation") return "validation";
  return "generic";
}

function DocumentRow({
  doc,
  extractionCount,
  onRetry,
  onRemove,
  isBusy,
}: {
  doc: LmnpDocument;
  extractionCount: number;
  onRetry: () => void;
  onRemove: () => void;
  isBusy: boolean;
}) {
  const statusColor =
    doc.status === "analyzed"
      ? colors.success.DEFAULT
      : doc.status === "failed"
        ? colors.error.DEFAULT
        : doc.status === "processing"
          ? colors.orange[500]
          : colors.text.muted;

  return (
    <li
      className="flex flex-wrap items-center justify-between gap-3"
      style={{
        padding: spacing.scale[3],
        borderRadius: radius.md,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.primary,
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate" style={{ ...typography.body.desktop, color: colors.text.primary }}>
          {doc.fileName}
        </p>
        <p style={{ ...typography.caption.desktop, color: statusColor }}>
          {STATUS_LABEL[doc.status]}
          {doc.status === "analyzed" && extractionCount > 0
            ? ` · ${extractionCount} montant${extractionCount > 1 ? "s" : ""}`
            : ""}
        </p>
        {doc.ocrMeta?.warnings?.length ? (
          <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            {doc.ocrMeta.warnings[0]}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {doc.status === "failed" ? (
          <Button variant="secondary" onClick={onRetry} disabled={isBusy}>
            Réessayer
          </Button>
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          disabled={isBusy && doc.status === "processing"}
          style={{ ...typography.caption.desktop, color: colors.text.muted }}
        >
          Supprimer
        </button>
      </div>
    </li>
  );
}

function GenericDocumentStep({ stepId }: { stepId: DocumentJourneyStepId }) {
  const step = getDocumentJourneyStep(stepId);
  const { workspace, dispatch, getFile } = useLmnp();
  const { showSuccess, showError, showInfo } = useFeedback();
  const analyzingRef = useRef(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const documents = useMemo(
    () => [...workspace.documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    [workspace.documents],
  );

  const uploadedIds = workspace.documents
    .filter((d) => d.status === "uploaded" && d.category === step.category)
    .map((d) => d.id);
  const hasProcessing = workspace.documents.some(
    (d) => d.status === "processing" && d.category === step.category,
  );
  // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
  console.log("[generic-step-analysis-scope]", {
    currentStep: stepId,
    stepCategory: step.category,
    uploadedIds,
    uploadedDocs: workspace.documents
      .filter((d) => d.status === "uploaded")
      .map((d) => ({ id: d.id, fileName: d.fileName, category: d.category })),
  });
  const isBusy = isAnalyzing || hasProcessing;

  const runAnalysisForIds = useCallback(
    async (documentIds: string[]) => {
      if (documentIds.length === 0) {
        console.log("[analysis] no analyzable documents", {
          source: "DocumentsWorkspace.runAnalysisForIds",
          reason: "empty documentIds",
        });
        return;
      }
      if (analyzingRef.current) {
        console.log("[analysis] extraction skipped", {
          source: "DocumentsWorkspace.runAnalysisForIds",
          reason: "already analyzing",
          documentIds,
        });
        return;
      }
      analyzingRef.current = true;
      setIsAnalyzing(true);
      showInfo("Analyse en cours", "L'IA lit vos documents et extrait les montants.");

      console.log("[analysis] trigger requested", {
        source: "DocumentsWorkspace.runAnalysisForIds",
        documentIds,
        pipeline: "runBulkDocumentAnalysis",
      });
      // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
      console.log("[charges-runBulk-callsite]", {
        source: "DocumentsWorkspace.runAnalysisForIds",
        documentIds,
        allUploadedStatuses: workspace.documents
          .filter((d) => documentIds.includes(d.id))
          .map((d) => ({ id: d.id, fileName: d.fileName, status: d.status, category: d.category })),
        stack: new Error().stack,
      });

      try {
        const { succeeded, failed } = await runBulkDocumentAnalysis({
          documents: workspace.documents,
          documentIds,
          getFile,
          dispatch,
          fiscalYear: workspace.fiscalYear.year,
        });

        if (succeeded > 0) {
          showSuccess(
            `${succeeded} document${succeeded > 1 ? "s" : ""} analysé${succeeded > 1 ? "s" : ""}`,
            "Consultez la validation dans Déclarations.",
            LMNP_ROUTES.declarations,
          );
        }
        if (failed > 0 && succeeded === 0) {
          showError("Analyse impossible", "Essayez une version plus nette du PDF.");
        } else if (failed > 0) {
          showError("Analyse partielle", `${failed} document${failed > 1 ? "s" : ""} n'a pas pu être lu.`);
        }
      } catch {
        showError("Erreur d'analyse", "Réessayez dans un instant.");
      } finally {
        analyzingRef.current = false;
        setIsAnalyzing(false);
      }
    },
    [workspace.documents, workspace.fiscalYear.year, getFile, dispatch, showSuccess, showError, showInfo],
  );

  useEffect(() => {
    if (uploadedIds.length === 0) {
      return;
    }
    if (hasProcessing) {
      console.log("[analysis] extraction skipped", {
        source: "DocumentsWorkspace.useEffect",
        reason: "hasProcessing",
        uploadedIds,
      });
      return;
    }
    if (isAnalyzing) {
      console.log("[analysis] extraction skipped", {
        source: "DocumentsWorkspace.useEffect",
        reason: "isAnalyzing",
        uploadedIds,
      });
      return;
    }

    console.log("[analysis] trigger requested", {
      source: "DocumentsWorkspace.useEffect",
      uploadedIds,
      pipeline: "runBulkDocumentAnalysis",
    });
    // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
    console.log("[ocr-trigger-owner]", {
      system: "T2-generic-auto",
      component: "GenericDocumentStep",
      reason: "uploadedIds non-empty for current step category",
      docs: uploadedIds,
      step: stepId,
      category: step.category,
      guard: "uploadedIds + hasProcessing + isAnalyzing + 400ms debounce — NO executionPendingRef",
    });

    const timer = window.setTimeout(() => {
      void runAnalysisForIds(uploadedIds);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [uploadedIds.join(","), hasProcessing, isAnalyzing, runAnalysisForIds, uploadedIds]);

  function handleUpload(files: File[]) {
    if (!files.length) return;
    dispatch({
      type: "UPLOAD_DOCUMENTS",
      files: files.map((file) => ({ file, category: step.category as DocumentCategory })),
    });
    showInfo(
      `${files.length} fichier${files.length > 1 ? "s" : ""} reçu${files.length > 1 ? "s" : ""}`,
      "L'analyse démarre automatiquement.",
    );
  }

  function handleRemove(documentId: string) {
    dispatch({ type: "REMOVE_DOCUMENT", documentId });
  }

  function handleRetry(documentId: string) {
    dispatch({ type: "DOCUMENT_SET_STATUS", documentId, status: "uploaded" });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p style={{ ...typography.caption.desktop, color: colors.text.accent }}>
          Étape documents
        </p>
        <h1
          className="mt-2 text-3xl"
          style={{
            fontFamily: typography.fontFamily.display,
            fontWeight: typography.fontWeight.regular,
            color: colors.text.primary,
          }}
        >
          {step.screenTitle}
        </h1>
        <p className="mt-3" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          {step.explanation}
        </p>
      </header>

      <WorkspaceProgress label="Progression documents & dossier" />

      <Card interactive>
        <DocumentUploadZone hint={step.uploadHint} onFiles={handleUpload} />
        <div className="mt-4 flex items-center justify-between gap-4">
          <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            {isBusy ? "Analyse IA en cours…" : "PDF ou images — dépôt multiple accepté"}
          </p>
          <WorkflowPageBackLink />
        </div>
      </Card>

      <Card variant="muted" interactive>
        <h2 style={{ ...typography.cardTitle.desktop, color: colors.text.primary }}>
          Documents déposés ({documents.length})
        </h2>
        {documents.length === 0 ? (
          <p className="mt-3" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Aucun document pour le moment. Commencez par importer votre pièce.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                extractionCount={workspace.extractions.filter((e) => e.documentId === doc.id).length}
                onRetry={() => handleRetry(doc.id)}
                onRemove={() => handleRemove(doc.id)}
                isBusy={isBusy}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function DocumentsWorkspace() {
  const searchParams = useSearchParams();
  const stepId = resolveStepId(searchParams.get("step"));
  const activeTunnel = resolvePersistedTunnel(stepId);

  if (activeTunnel !== "generic") {
    visitedPersistedTunnels.add(activeTunnel);
  }

  const shouldMount = (tunnel: PersistedTunnelId) => visitedPersistedTunnels.has(tunnel);

  const isInpiActive = activeTunnel === "inpi";
  const isLogementActive = activeTunnel === "logement";
  const isCreditActive = activeTunnel === "credit";
  const isAmortissementsActive = activeTunnel === "amortissements";
  const isRevenusActive = activeTunnel === "revenus";
  const isChargesActive = activeTunnel === "charges";
  const isValidationActive = activeTunnel === "validation";

  const tunnelPanels = (
    <>
      {shouldMount("inpi") ? (
        <PersistentTunnelPanel tunnel="inpi" active={isInpiActive}>
          <FrozenActiviteDocumentStep isActive={isInpiActive} />
        </PersistentTunnelPanel>
      ) : null}

      {shouldMount("logement") ? (
        <PersistentTunnelPanel tunnel="logement" active={isLogementActive}>
          <FrozenLogementDocumentStep isActive={isLogementActive} />
        </PersistentTunnelPanel>
      ) : null}

      {shouldMount("credit") ? (
        <PersistentTunnelPanel tunnel="credit" active={isCreditActive}>
          <FrozenCreditDocumentStep isActive={isCreditActive} />
        </PersistentTunnelPanel>
      ) : null}

      {shouldMount("amortissements") ? (
        <PersistentTunnelPanel tunnel="amortissements" active={isAmortissementsActive}>
          <FrozenAmortissementDocumentStep isActive={isAmortissementsActive} />
        </PersistentTunnelPanel>
      ) : null}

      {shouldMount("revenus") ? (
        <PersistentTunnelPanel tunnel="revenus" active={isRevenusActive}>
          <FrozenRevenusDocumentStep isActive={isRevenusActive} />
        </PersistentTunnelPanel>
      ) : null}

      {shouldMount("charges") ? (
        <PersistentTunnelPanel tunnel="charges" active={isChargesActive}>
          <FrozenChargesDocumentStep isActive={isChargesActive} />
        </PersistentTunnelPanel>
      ) : null}

      {shouldMount("validation") ? (
        <PersistentTunnelPanel tunnel="validation" active={isValidationActive}>
          <FrozenValidationDocumentStep isActive={isValidationActive} />
        </PersistentTunnelPanel>
      ) : null}

      {activeTunnel === "generic" ? (
        <GenericDocumentStep stepId={stepId as DocumentJourneyStepId} />
      ) : null}
    </>
  );

  return (
    <>
      {activeTunnel !== "generic" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr" }}>
          {tunnelPanels}
        </div>
      ) : (
        tunnelPanels
      )}
    </>
  );
}
