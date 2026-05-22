"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCEPTED_MIME_TYPES, MAX_FILE_BYTES } from "@/lib/lmnp/constants/documents";
import { getDocumentJourneyStep } from "@/lib/lmnp/constants/document-journey";
import {
  inpiJourneyHref,
  isDocumentJourneyStarted,
} from "@/lib/lmnp/engine/document-journey-progress";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import { useLmnp } from "@/lib/lmnp/store";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

const ANALYSIS_LINES = [
  "Analyse du document…",
  "Vérification du SIRET…",
  "Création du dossier…",
];

const INPI_BULLETS = ["identité", "SIRET", "adresse", "informations exploitant"];

function toWorkspace(ws: ReturnType<typeof useLmnp>["workspace"]): PersistedWorkspace {
  return {
    fiscalYear: ws.fiscalYear,
    properties: ws.properties,
    documents: ws.documents,
    extractions: ws.extractions,
    validationItems: ws.validationItems,
    ledgerEntries: ws.ledgerEntries,
    declarationDraft: ws.declarationDraft,
  };
}

export function InpiUploadStep() {
  const router = useRouter();
  const { workspace, dispatch, getFile } = useLmnp();
  const def = getDocumentJourneyStep("inpi");
  const base = `/app/exercices/${workspace.fiscalYear.id}`;
  const validationHref = `${base}/piece/inpi/validation`;
  const ws = toWorkspace(workspace);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingUploadRef = useRef(false);

  const inpiDoc = workspace.documents.find(
    (d) => d.id === workspace.declarationDraft?.inpiDocumentId,
  );

  const [analyzing, setAnalyzing] = useState(
    inpiDoc?.status === "uploaded" || inpiDoc?.status === "processing",
  );
  const [dragging, setDragging] = useState(false);
  const [analysisLine, setAnalysisLine] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDocumentJourneyStarted(ws)) {
      router.replace(base);
      return;
    }
    if (workspace.declarationDraft?.inpiConfirmedAt) {
      router.replace(inpiJourneyHref(workspace.fiscalYear.id, ws));
      return;
    }
    if (inpiDoc?.status === "analyzed" || inpiDoc?.status === "failed") {
      router.replace(validationHref);
    }
  }, [ws, workspace.declarationDraft?.inpiConfirmedAt, inpiDoc?.status, router, base, validationHref]);

  const runAnalysis = useCallback(
    async (documentId: string) => {
      setAnalyzing(true);
      setAnalysisLine(0);

      for (let i = 0; i < ANALYSIS_LINES.length; i++) {
        setAnalysisLine(i);
        await new Promise((r) => setTimeout(r, 900));
      }

      const { succeeded } = await runBulkDocumentAnalysis({
        documents: workspace.documents,
        documentIds: [documentId],
        getFile,
        dispatch,
        fiscalYear: workspace.fiscalYear.year,
      });

      setAnalyzing(false);

      if (succeeded === 0) {
        setError("Lecture impossible — essayez un PDF plus net.");
        return;
      }

      router.push(validationHref);
    },
    [workspace, getFile, dispatch, router, validationHref],
  );

  useEffect(() => {
    if (!pendingUploadRef.current) return;
    const doc = workspace.documents.at(-1);
    if (doc?.status === "uploaded") {
      pendingUploadRef.current = false;
      dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { inpiDocumentId: doc.id } });
      void runAnalysis(doc.id);
    }
  }, [workspace.documents, dispatch, runAnalysis]);

  const handleFile = (file: File) => {
    setError(null);
    if (
      !(ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type) ||
      file.size > MAX_FILE_BYTES
    ) {
      setError("Format non supporté ou fichier trop volumineux.");
      return;
    }
    pendingUploadRef.current = true;
    dispatch({ type: "UPLOAD_DOCUMENTS", files: [{ file, category: def.category }] });
  };

  return (
    <div className="mx-auto max-w-lg animate-fade-in px-4 py-12 sm:py-16">
      <p className="text-[11px] text-stone-400">Étape 1 · Document fondateur</p>
      <h1
        className="mt-4 text-[1.65rem] font-normal leading-snug text-stone-800 sm:text-[1.75rem]"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        {def.screenTitle}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-stone-500">{def.explanation}</p>

      {!analyzing && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            className={`mt-10 w-full rounded-[var(--radius-xl)] border border-dashed px-8 py-16 text-center transition-all duration-300 ${
              dragging
                ? "border-primary/40 bg-primary-muted"
                : "border-stone-200/90 bg-card/70 hover:border-stone-300 hover:bg-card/90"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <p className="text-sm font-medium text-stone-700">{def.ctaLabel}</p>
            <p className="mt-2 text-[12px] text-stone-500">{def.uploadHint}</p>
          </button>
          {error && <p className="mt-4 text-center text-[12px] text-red-800/80">{error}</p>}
          <p className="mt-8 text-center text-[12px] leading-relaxed text-stone-500">
            L’IA extrait automatiquement :
            <br />
            {INPI_BULLETS.map((b) => (
              <span key={b} className="block">
                · {b}
              </span>
            ))}
          </p>
        </>
      )}

      {analyzing && (
        <div className="mt-14 text-center">
          <div className="mx-auto h-px w-12 overflow-hidden bg-stone-200">
            <div className="h-full w-1/2 animate-pulse bg-stone-400/60" />
          </div>
          <p className="mt-8 text-[15px] text-stone-600">{ANALYSIS_LINES[analysisLine]}</p>
        </div>
      )}
    </div>
  );
}
