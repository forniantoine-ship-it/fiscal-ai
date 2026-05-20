"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACCEPTED_MIME_TYPES, MAX_FILE_BYTES } from "@/lib/lmnp/constants/documents";
import { DOCUMENT_TYPE_SHORT_LABEL } from "@/lib/lmnp/constants/document-tab-mapping";
import { inferUploadFromFileName } from "@/lib/lmnp/services/document-classifier";
import { useLmnp } from "@/lib/lmnp/store";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import { ConfidencePill } from "@/components/lmnp/shared/ConfidencePill";
import { useFeedback } from "@/components/lmnp/shared/FeedbackProvider";
import { DocumentsEmptyIcon } from "@/components/lmnp/shared/EmptyState";
import type { DocumentCategory, LmnpDocument } from "@/lib/lmnp/types";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

const STATUS_LABELS: Record<string, string> = {
  uploaded: "En attente d’analyse",
  processing: "L’IA lit votre document…",
  analyzed: "Analysé — montants extraits",
  failed: "Lecture impossible",
};

function avgConfidenceForDocument(
  documentId: string,
  extractions: { documentId: string; confidence: number }[],
): number | null {
  const scoped = extractions.filter((e) => e.documentId === documentId);
  if (scoped.length === 0) return null;
  return Math.round(scoped.reduce((sum, e) => sum + e.confidence, 0) / scoped.length);
}

function documentTypeLabel(doc: LmnpDocument): string | null {
  if (doc.documentType === "unknown") return "Document classé par l’IA";
  return DOCUMENT_TYPE_SHORT_LABEL[doc.documentType] ?? null;
}

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
            "Les montants sont dans Mes loyers et Mes dépenses — confirmez-les en un clic.",
            `${base}/recettes`,
          );
        }

        if (failed > 0 && succeeded === 0) {
          const msg =
            "Impossible de lire vos documents. Essayez un PDF plus net ou réimportez le fichier.";
          setError(msg);
          showError("Analyse impossible", msg);
        } else if (failed > 0) {
          const msg = `${failed} document${failed > 1 ? "s" : ""} en échec — touchez « Réessayer » sur la ligne concernée.`;
          setError(msg);
          showError("Analyse partielle", msg);
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Une erreur est survenue pendant l’analyse.";
        setError(msg);
        showError("Erreur d’analyse", msg);
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
          const msg = `"${file.name}" : utilisez un PDF, JPG ou PNG.`;
          setError(msg);
          showError("Format refusé", msg);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          const msg = `"${file.name}" dépasse 20 Mo — compressez ou scindez le fichier.`;
          setError(msg);
          showError("Fichier trop lourd", msg);
          continue;
        }
        const { category } = inferUploadFromFileName(file.name);
        valid.push({ file, category });
      }

      if (valid.length > 0) {
        dispatch({ type: "UPLOAD_DOCUMENTS", files: valid });
        showInfo(
          `${valid.length} fichier${valid.length > 1 ? "s" : ""} reçu${valid.length > 1 ? "s" : ""}`,
          "L’IA analyse et classe automatiquement…",
        );
      }
    },
    [dispatch, showError, showInfo],
  );

  const retryDocument = (doc: LmnpDocument) => {
    dispatch({ type: "DOCUMENT_SET_STATUS", documentId: doc.id, status: "uploaded" });
    showInfo(`Nouvelle lecture de « ${doc.fileName} »…`);
  };

  return (
    <div className="space-y-6">
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
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
          isDragging
            ? "border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
            : "border-white/15 bg-white/[0.02] hover:border-emerald-500/40 hover:bg-emerald-500/[0.03]"
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
        <DocumentsEmptyIcon />
        <p className="mt-4 text-lg font-semibold text-zinc-100">
          Téléversez simplement vos documents
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          L&apos;IA les analysera automatiquement — acte notarié, factures, taxe foncière, relevés
          de loyers…
        </p>
        <p className="mt-4 text-sm text-emerald-400/90">
          Glissez-déposez ici ou <span className="underline">parcourir vos fichiers</span>
        </p>
        <p className="mt-2 text-xs text-zinc-600">PDF, JPG, PNG · max 20 Mo par fichier</p>
      </div>

      {(isAnalyzing || hasProcessing) && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-300">L’IA lit vos documents</p>
            <p className="text-xs text-zinc-500">
              Classification, extraction des montants, remplissage de votre dossier…
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {workspace.documents.length === 0 && !isAnalyzing && !hasProcessing && (
        <p className="text-center text-sm text-zinc-500">
          Pas de case à cocher, pas de jargon — déposez vos PDF et laissez l&apos;assistant faire le
          tri.
        </p>
      )}

      {workspace.documents.length > 0 && (
        <ul className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Vos fichiers
          </p>
          {workspace.documents.map((doc) => {
            const confidence = avgConfidenceForDocument(doc.id, workspace.extractions);
            const typeLabel = documentTypeLabel(doc);

            return (
              <li key={doc.id} className="glass flex items-center gap-3 rounded-xl px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-200">{doc.fileName}</p>
                  <p className="text-xs text-zinc-500">
                    {STATUS_LABELS[doc.status]} · {formatSize(doc.sizeBytes)}
                    {typeLabel && <span className="text-emerald-500/80"> · {typeLabel}</span>}
                  </p>
                  {confidence !== null && doc.status === "analyzed" && (
                    <div className="mt-1.5">
                      <ConfidencePill score={confidence} />
                    </div>
                  )}
                </div>
                {doc.status === "processing" && (
                  <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
                )}
                {doc.status === "failed" && (
                  <button
                    type="button"
                    onClick={() => retryDocument(doc)}
                    className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/25"
                  >
                    Réessayer
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dispatch({ type: "REMOVE_DOCUMENT", documentId: doc.id })}
                  disabled={doc.status === "processing"}
                  className="rounded-lg p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                  aria-label="Supprimer"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
