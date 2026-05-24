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
import { useFeedback } from "@/components/lmnp/shared/FeedbackProvider";
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

function resolveStepId(raw: string | null): DocumentJourneyStepId {
  const allowed = new Set([
    "inpi",
    "credit-immobilier",
    "bail",
    "taxe-fonciere",
    "assurance",
    "factures-travaux",
  ]);
  if (raw && allowed.has(raw)) return raw as DocumentJourneyStepId;
  return "inpi";
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

export function DocumentsWorkspace() {
  const searchParams = useSearchParams();
  const stepId = resolveStepId(searchParams.get("step"));
  const step = getDocumentJourneyStep(stepId);
  const { workspace, dispatch, getFile } = useLmnp();
  const { showSuccess, showError, showInfo } = useFeedback();
  const analyzingRef = useRef(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const documents = useMemo(
    () => [...workspace.documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    [workspace.documents],
  );

  const uploadedIds = workspace.documents.filter((d) => d.status === "uploaded").map((d) => d.id);
  const hasProcessing = workspace.documents.some((d) => d.status === "processing");
  const isBusy = isAnalyzing || hasProcessing;

  const runAnalysisForIds = useCallback(
    async (documentIds: string[]) => {
      if (documentIds.length === 0 || analyzingRef.current) return;
      analyzingRef.current = true;
      setIsAnalyzing(true);
      showInfo("Analyse en cours", "L'IA lit vos documents et extrait les montants.");

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
    if (uploadedIds.length === 0 || hasProcessing || isAnalyzing) return;
    const timer = window.setTimeout(() => {
      void runAnalysisForIds(uploadedIds);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [uploadedIds.join(","), hasProcessing, isAnalyzing, runAnalysisForIds]);

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

      <Card>
        <DocumentUploadZone hint={step.uploadHint} onFiles={handleUpload} />
        <div className="mt-4 flex items-center justify-between gap-4">
          <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            {isBusy ? "Analyse IA en cours…" : "PDF ou images — dépôt multiple accepté"}
          </p>
          <Button href={LMNP_ROUTES.dashboard} variant="secondary">
            Tableau de bord
          </Button>
        </div>
      </Card>

      <Card variant="muted">
        <h2 style={{ ...typography.cardTitle.desktop, color: colors.text.primary }}>
          Documents déposés ({documents.length})
        </h2>
        {documents.length === 0 ? (
          <p className="mt-3" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Aucun document pour le moment. Commencez par importer votre pièce INPI.
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
