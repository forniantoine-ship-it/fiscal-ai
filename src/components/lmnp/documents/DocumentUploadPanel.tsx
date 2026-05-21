"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACCEPTED_MIME_TYPES, MAX_FILE_BYTES } from "@/lib/lmnp/constants/documents";
import { inferUploadFromFileName } from "@/lib/lmnp/services/document-classifier";
import { useLmnp } from "@/lib/lmnp/store";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import { useFeedback } from "@/components/lmnp/shared/FeedbackProvider";
import { AiActivityFeed } from "@/components/lmnp/journey/AiActivityFeed";
import { AiDocumentRow } from "./AiDocumentRow";
import type { DocumentCategory } from "@/lib/lmnp/types";

export function DocumentUploadPanel() {
  const { workspace, dispatch, getFile } = useLmnp();
  const { showSuccess, showError, showInfo } = useFeedback();
  const inputRef = useRef<HTMLInputElement>(null);
  const analyzingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const base = `/app/exercices/${workspace.fiscalYear.id}`;
  const uploadedIds = workspace.documents.filter((d) => d.status === "uploaded").map((d) => d.id);
  const hasProcessing = workspace.documents.some((d) => d.status === "processing");
  const isBusy = isAnalyzing || hasProcessing;

  const runAnalysisForIds = useCallback(
    async (documentIds: string[]) => {
      if (documentIds.length === 0 || analyzingRef.current) return;
      analyzingRef.current = true;
      setError(null);
      setIsAnalyzing(true);

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
            "L’IA a pré-rempli votre dossier.",
            `${base}/validation`,
          );
        }

        if (failed > 0 && succeeded === 0) {
          const msg = "PDF illisible — essayez une version plus nette.";
          setError(msg);
          showError("Analyse impossible", msg);
        } else if (failed > 0) {
          const msg = `${failed} échec${failed > 1 ? "s" : ""} — touchez Réessayer.`;
          setError(msg);
          showError("Analyse partielle", msg);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur pendant l’analyse.";
        setError(msg);
        showError("Erreur", msg);
      } finally {
        analyzingRef.current = false;
        setIsAnalyzing(false);
      }
    },
    [workspace.documents, workspace.fiscalYear.year, getFile, dispatch, showSuccess, showError, base],
  );

  useEffect(() => {
    if (uploadedIds.length === 0 || hasProcessing || isAnalyzing) return;
    const timer = window.setTimeout(() => {
      void runAnalysisForIds(uploadedIds);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [uploadedIds.join(","), hasProcessing, isAnalyzing, runAnalysisForIds]);

  const processFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;
      setError(null);
      const valid: { file: File; category: DocumentCategory }[] = [];

      for (const file of Array.from(fileList)) {
        const okType =
          ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number]) ||
          /\.(pdf|jpe?g|png|webp)$/i.test(file.name);
        if (!okType) {
          showError("Format refusé", `"${file.name}" : PDF, JPG ou PNG uniquement.`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          showError("Fichier trop lourd", `"${file.name}" dépasse 20 Mo.`);
          continue;
        }
        const { category } = inferUploadFromFileName(file.name);
        valid.push({ file, category });
      }

      if (valid.length > 0) {
        dispatch({ type: "UPLOAD_DOCUMENTS", files: valid });
        showInfo("Reçu", "L’IA démarre l’analyse…");
      }
    },
    [dispatch, showError, showInfo],
  );

  return (
    <div className="space-y-8">
      {!isBusy && workspace.documents.length === 0 && (
        <div
          id="upload-zone"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            processFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-3xl border border-dashed px-8 py-16 text-center transition-all ${
            isDragging
              ? "border-emerald-400/60 bg-emerald-500/[0.06]"
              : "border-white/10 bg-white/[0.01] hover:border-white/20"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              processFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="text-lg font-medium text-zinc-200">Déposer vos documents</p>
          <p className="mt-6 text-xs text-zinc-600">
            Glisser-déposer ou <span className="text-zinc-400 underline">parcourir</span>
          </p>
        </div>
      )}

      {(isBusy || workspace.documents.length > 0) && (
        <div className="space-y-4">
          {isBusy && workspace.documents.length > 0 && (
            <AiActivityFeed
              documentType={
                workspace.documents.find((d) => d.status === "processing")?.documentType
              }
            />
          )}

          {!isBusy && workspace.documents.length > 0 && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full rounded-2xl border border-dashed border-white/10 py-3 text-xs text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-400"
            >
              + Ajouter un document
            </button>
          )}

          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              processFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <ul className="space-y-3">
            {workspace.documents.map((doc) => (
              <AiDocumentRow
                key={doc.id}
                doc={doc}
                extractionCount={workspace.extractions.filter((e) => e.documentId === doc.id).length}
                onRetry={() => {
                  dispatch({ type: "DOCUMENT_SET_STATUS", documentId: doc.id, status: "uploaded" });
                }}
                onRemove={() => dispatch({ type: "REMOVE_DOCUMENT", documentId: doc.id })}
              />
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/20 px-4 py-3 text-sm text-red-300">{error}</p>
      )}
    </div>
  );
}
