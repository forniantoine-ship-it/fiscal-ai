"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { DocumentUploadZone } from "@/components/lmnp/design-system/DocumentUploadZone";
import {
  getDocumentJourneyStep,
  type DocumentJourneyStepId,
} from "@/lib/lmnp/constants/document-journey";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import type { DocumentCategory } from "@/lib/lmnp/types";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "En attente",
  processing: "Analyse en cours",
  analyzed: "Analysé",
  failed: "Échec",
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

export function DocumentsWorkspace() {
  const searchParams = useSearchParams();
  const stepId = resolveStepId(searchParams.get("step"));
  const step = getDocumentJourneyStep(stepId);
  const { workspace, dispatch, getFile } = useLmnp();
  const analyzingRef = useRef(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const documents = useMemo(
    () => [...workspace.documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    [workspace.documents],
  );

  const uploadedIds = workspace.documents.filter((d) => d.status === "uploaded").map((d) => d.id);
  const hasProcessing = workspace.documents.some((d) => d.status === "processing");

  const runAnalysisForIds = useCallback(
    async (documentIds: string[]) => {
      if (documentIds.length === 0 || analyzingRef.current) return;
      analyzingRef.current = true;
      setIsAnalyzing(true);
      setFeedback(null);

      try {
        const { succeeded, failed } = await runBulkDocumentAnalysis({
          documents: workspace.documents,
          documentIds,
          getFile,
          dispatch,
          fiscalYear: workspace.fiscalYear.year,
        });

        if (succeeded > 0) {
          setFeedback(
            `${succeeded} document${succeeded > 1 ? "s" : ""} analysé${succeeded > 1 ? "s" : ""} — vérifiez le tableau de bord.`,
          );
        }
        if (failed > 0 && succeeded === 0) {
          setFeedback("Analyse impossible — essayez une version plus nette du PDF.");
        } else if (failed > 0) {
          setFeedback(`${failed} document${failed > 1 ? "s" : ""} n'a pas pu être analysé.`);
        }
      } catch {
        setFeedback("Une erreur est survenue pendant l'analyse.");
      } finally {
        analyzingRef.current = false;
        setIsAnalyzing(false);
      }
    },
    [workspace.documents, workspace.fiscalYear.year, getFile, dispatch],
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
  }

  return (
    <div className="mx-auto max-w-3xl">
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

      <Card className="mt-8">
        <DocumentUploadZone hint={step.uploadHint} onFiles={handleUpload} />
        <div className="mt-4 flex items-center justify-between gap-4">
          <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            {isAnalyzing || hasProcessing
              ? "Analyse IA en cours…"
              : "PDF ou images — l'analyse démarre automatiquement"}
          </p>
          <Button href={LMNP_ROUTES.dashboard} variant="secondary">
            Retour au tableau de bord
          </Button>
        </div>
        {feedback ? (
          <p className="mt-4" style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
            {feedback}
          </p>
        ) : null}
      </Card>

      <Card className="mt-6" variant="muted">
        <h2 style={{ ...typography.cardTitle.desktop, color: colors.text.primary }}>Documents déposés</h2>
        {documents.length === 0 ? (
          <p className="mt-3" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Aucun document pour le moment.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-4"
                style={{ paddingBlock: spacing.scale[2] }}
              >
                <div className="min-w-0">
                  <p className="truncate" style={{ ...typography.body.desktop, color: colors.text.primary }}>
                    {doc.fileName}
                  </p>
                  <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                    {doc.documentType !== "unknown" ? doc.documentType : doc.category}
                  </p>
                </div>
                <span style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
                  {STATUS_LABEL[doc.status] ?? doc.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
