"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCEPTED_MIME_TYPES, MAX_FILE_BYTES } from "@/lib/lmnp/constants/documents";
import {
  type DocumentJourneyStepId,
  getDocumentJourneyStep,
  nextDocumentStepId,
  documentJourneyStepHref,
  DOCUMENT_JOURNEY_ORDER,
} from "@/lib/lmnp/constants/document-journey";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import { useLmnp } from "@/lib/lmnp/store";
import { PrimaryButton, SecondaryButton } from "@/components/lmnp/design-system";

interface SequentialDocumentStepProps {
  stepId: DocumentJourneyStepId;
}

export function SequentialDocumentStep({ stepId }: SequentialDocumentStepProps) {
  const router = useRouter();
  const { workspace, dispatch, getFile } = useLmnp();
  const def = getDocumentJourneyStep(stepId);
  const base = `/app/exercices/${workspace.fiscalYear.id}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const stepIndex = DOCUMENT_JOURNEY_ORDER.indexOf(stepId) + 1;

  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingUploadRef = useRef(false);

  const existing = workspace.documents.find(
    (d) => def.fileNamePattern.test(d.fileName) && d.status === "analyzed",
  );

  useEffect(() => {
    if (existing) setDone(true);
  }, [existing]);

  const analyzeLatest = useCallback(
    async (documentId: string) => {
      setAnalyzing(true);
      setError(null);
      const { succeeded } = await runBulkDocumentAnalysis({
        documents: workspace.documents,
        documentIds: [documentId],
        getFile,
        dispatch,
        fiscalYear: workspace.fiscalYear.year,
      });
      setAnalyzing(false);
      if (succeeded > 0) {
        setDone(true);
        dispatch({ type: "COMPLETE_DOCUMENT_JOURNEY_STEP", stepId });
      } else {
        setError("Lecture impossible — réessayez avec un fichier plus lisible.");
      }
    },
    [workspace.documents, workspace.fiscalYear.year, getFile, dispatch, stepId],
  );

  useEffect(() => {
    if (!pendingUploadRef.current) return;
    const doc = workspace.documents.at(-1);
    if (doc?.status === "uploaded") {
      pendingUploadRef.current = false;
      void analyzeLatest(doc.id);
    }
  }, [workspace.documents, analyzeLatest]);

  const handleFile = (file: File) => {
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

  const continueNext = () => {
    const next = nextDocumentStepId(stepId);
    if (next) {
      router.push(documentJourneyStepHref(workspace.fiscalYear.id, next));
    } else {
      router.push(base);
    }
  };

  const skipOptional = () => {
    dispatch({ type: "COMPLETE_DOCUMENT_JOURNEY_STEP", stepId });
    continueNext();
  };

  return (
    <div className="mx-auto max-w-lg animate-fade-in px-4 py-12 sm:py-16">
      <p className="text-[11px] text-stone-400">
        Étape {stepIndex} · Pièce justificative
      </p>
      <h1
        className="mt-4 text-[1.65rem] font-normal leading-snug text-stone-800"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        {def.screenTitle}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-stone-500">{def.explanation}</p>

      {!done && (
        <button
          type="button"
          disabled={analyzing}
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
          className={`mt-10 w-full rounded-[var(--radius-xl)] border border-dashed px-8 py-14 text-center transition-all ${
            dragging
              ? "border-primary/40 bg-primary-muted"
              : "border-stone-200/90 bg-card/70 hover:border-stone-300"
          } ${analyzing ? "opacity-60" : ""}`}
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
          <p className="text-sm font-medium text-stone-700">
            {analyzing ? "Analyse en cours…" : def.ctaLabel}
          </p>
          <p className="mt-2 text-[12px] text-stone-500">{def.uploadHint}</p>
        </button>
      )}

      {error && <p className="mt-4 text-center text-[12px] text-red-800/80">{error}</p>}

      {done && (
        <p className="mt-10 text-center text-[14px] text-accent">✓ Document enregistré</p>
      )}

      <div className="mt-12 flex flex-col items-center gap-4">
        {(done || existing) && (
          <PrimaryButton onClick={continueNext}>Continuer</PrimaryButton>
        )}
        {def.optional && !done && (
          <button
            type="button"
            onClick={skipOptional}
            className="text-[12px] text-stone-400 hover:text-stone-600"
          >
            Passer cette étape
          </button>
        )}
        <SecondaryButton href={base}>Tableau de bord</SecondaryButton>
      </div>
    </div>
  );
}
