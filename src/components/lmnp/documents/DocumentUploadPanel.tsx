"use client";

import { useCallback, useRef, useState } from "react";
import { ACCEPTED_MIME_TYPES, DOCUMENT_CATEGORIES, MAX_FILE_BYTES } from "@/lib/lmnp/constants/documents";
import { useLmnp } from "@/lib/lmnp/store";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import type { DocumentCategory } from "@/lib/lmnp/types";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

const STATUS_LABELS: Record<string, string> = {
  uploaded: "En attente d'analyse",
  processing: "Analyse IA en cours…",
  analyzed: "Analysé",
  failed: "Échec — réessayez",
};

export function DocumentUploadPanel() {
  const { workspace, dispatch, getFile } = useLmnp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [category, setCategory] = useState<DocumentCategory>("revenus");
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const pendingAnalysis = workspace.documents.some((d) => d.status === "uploaded");
  const hasProcessing = workspace.documents.some((d) => d.status === "processing");

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
          setError("Format non accepté — utilisez PDF, JPG ou PNG.");
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          setError("Fichier trop volumineux (max 20 Mo).");
          continue;
        }
        valid.push({ file, category });
      }

      if (valid.length > 0) {
        dispatch({ type: "UPLOAD_DOCUMENTS", files: valid });
      }
    },
    [category, dispatch],
  );

  const runAnalysis = async () => {
    setError(null);
    setIsAnalyzing(true);
    const ids = workspace.documents.filter((d) => d.status === "uploaded").map((d) => d.id);

    try {
      const { succeeded, failed } = await runBulkDocumentAnalysis({
        documents: workspace.documents,
        documentIds: ids,
        getFile,
        dispatch,
      });

      if (failed > 0 && succeeded === 0) {
        setError(
          "L'analyse OCR a échoué. Vérifiez OPENAI_API_KEY et votre connexion, puis réessayez.",
        );
      } else if (failed > 0) {
        setError(`${failed} document(s) en échec — les autres ont été analysés.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'analyse.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
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
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div
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
          Analyse OpenAI Vision — montants à haute confiance synchronisés automatiquement dans vos
          onglets Recettes, Dépenses, etc.
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {(pendingAnalysis || hasProcessing) && (
        <button
          type="button"
          onClick={runAnalysis}
          disabled={isAnalyzing || hasProcessing}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isAnalyzing || hasProcessing ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-950/30 border-t-zinc-950" />
              Analyse Vision en cours…
            </>
          ) : (
            "Lancer l'analyse OCR (OpenAI Vision)"
          )}
        </button>
      )}

      {workspace.documents.length > 0 && (
        <ul className="space-y-2">
          {workspace.documents.map((doc) => (
            <li key={doc.id} className="glass flex items-center gap-3 rounded-xl px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-200">{doc.fileName}</p>
                <p className="text-xs text-zinc-500">
                  {STATUS_LABELS[doc.status]} · {formatSize(doc.sizeBytes)}
                  {doc.status === "analyzed" && doc.documentType !== "unknown" && (
                    <span className="text-emerald-500/80"> · {doc.documentType}</span>
                  )}
                </p>
              </div>
              {doc.status === "processing" && (
                <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
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
          ))}
        </ul>
      )}
    </div>
  );
}
