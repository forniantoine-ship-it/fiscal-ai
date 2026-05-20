"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACCEPTED_MIME_TYPES, DOCUMENT_CATEGORIES, MAX_FILE_BYTES } from "@/lib/lmnp/constants/documents";
import { DOCUMENT_TYPE_SHORT_LABEL } from "@/lib/lmnp/constants/document-tab-mapping";
import { useLmnp } from "@/lib/lmnp/store";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import { ConfidencePill } from "@/components/lmnp/shared/ConfidencePill";
import { useFeedback } from "@/components/lmnp/shared/FeedbackProvider";
import { DocumentsEmptyIcon, EmptyState } from "@/components/lmnp/shared/EmptyState";
import type { DocumentCategory, LmnpDocument } from "@/lib/lmnp/types";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

const STATUS_LABELS: Record<string, string> = {
  uploaded: "En file d'attente",
  processing: "Analyse en cours…",
  analyzed: "Analysé",
  failed: "Échec de lecture",
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
  if (doc.documentType === "unknown") return null;
  return DOCUMENT_TYPE_SHORT_LABEL[doc.documentType] ?? doc.documentType;
}

export function DocumentUploadPanel() {
  const { workspace, dispatch, getFile } = useLmnp();
  const { showSuccess, showError, showInfo } = useFeedback();
  const inputRef = useRef<HTMLInputElement>(null);
  const analyzingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [category, setCategory] = useState<DocumentCategory>("revenus");
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
        });

        if (succeeded > 0) {
          showSuccess(
            `${succeeded} document${succeeded > 1 ? "s" : ""} analysé${succeeded > 1 ? "s" : ""}`,
            "Consultez Validation pour confirmer, ou parcourez vos onglets métier",
            `${base}/validation`,
          );
        }

        if (failed > 0 && succeeded === 0) {
          const msg =
            "Impossible de lire vos documents. Vérifiez votre connexion ou réessayez avec un PDF plus net.";
          setError(msg);
          showError("Analyse impossible", msg);
        } else if (failed > 0) {
          const msg = `${failed} document${failed > 1 ? "s" : ""} en échec — utilisez « Réessayer » sur la ligne concernée.`;
          setError(msg);
          showError("Analyse partielle", msg);
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Une erreur est survenue pendant l'analyse.";
        setError(msg);
        showError("Erreur d'analyse", msg);
      } finally {
        analyzingRef.current = false;
        setIsAnalyzing(false);
      }
    },
    [workspace.documents, getFile, dispatch, showSuccess, showError, base],
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
          const msg = `"${file.name}" : format non accepté — utilisez PDF, JPG ou PNG.`;
          setError(msg);
          showError("Format refusé", msg);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          const msg = `"${file.name}" dépasse 20 Mo. Compressez le fichier ou scindez-le.`;
          setError(msg);
          showError("Fichier trop lourd", msg);
          continue;
        }
        valid.push({ file, category });
      }

      if (valid.length > 0) {
        dispatch({ type: "UPLOAD_DOCUMENTS", files: valid });
        showInfo(
          `${valid.length} fichier${valid.length > 1 ? "s" : ""} ajouté${valid.length > 1 ? "s" : ""}`,
          "Analyse automatique en cours…",
        );
      }
    },
    [category, dispatch, showError, showInfo],
  );

  const retryDocument = (doc: LmnpDocument) => {
    dispatch({ type: "DOCUMENT_SET_STATUS", documentId: doc.id, status: "uploaded" });
    showInfo(`Nouvelle analyse de « ${doc.fileName} »…`);
  };

  return (
    <div className="space-y-6">
      {workspace.documents.length === 0 && (
        <EmptyState
          icon={<DocumentsEmptyIcon />}
          title="Commencez par vos pièces justificatives"
          description="Bail, relevé de loyers, taxe foncière, facture meublé… L'IA lit vos documents et pré-remplit votre dossier. Vous gardez le contrôle sur chaque montant."
          primaryAction={{ label: "Ajouter un document", href: "#upload-zone" }}
        />
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-300">Type de document</p>
        <div className="flex flex-wrap gap-2">
          {DOCUMENT_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                category === cat.id
                  ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40"
                  : "bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:text-zinc-200"
              }`}
              title={cat.hint}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

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
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
          isDragging
            ? "border-emerald-400 bg-emerald-500/10"
            : "border-white/15 bg-white/[0.02] hover:border-emerald-500/40"
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
        <p className="text-base font-semibold text-zinc-200">Glissez vos fichiers ici</p>
        <p className="mt-2 text-sm text-zinc-500">
          ou <span className="text-emerald-400">parcourir</span> — PDF, JPG, PNG
        </p>
        <p className="mt-2 text-xs text-zinc-600">
          Analyse lancée automatiquement · montants ≥ 95 % synchronisés dans vos onglets
        </p>
      </div>

      {(isAnalyzing || hasProcessing) && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-300">Lecture IA en cours</p>
            <p className="text-xs text-zinc-500">
              Extraction des montants — quelques secondes par document
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {uploadedIds.length > 0 && !isAnalyzing && !hasProcessing && (
        <button
          type="button"
          onClick={() => runAnalysisForIds(uploadedIds)}
          className="w-full rounded-full border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
        >
          Relancer l&apos;analyse ({uploadedIds.length} en attente)
        </button>
      )}

      {workspace.documents.length > 0 && (
        <ul className="space-y-2">
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
