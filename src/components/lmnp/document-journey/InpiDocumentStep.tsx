"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCEPTED_MIME_TYPES, MAX_FILE_BYTES } from "@/lib/lmnp/constants/documents";
import {
  getDocumentJourneyStep,
  nextDocumentStepId,
  documentJourneyStepHref,
} from "@/lib/lmnp/constants/document-journey";
import { buildInpiDetection, type InpiProfile } from "@/lib/lmnp/services/inpi-profile";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import { useLmnp } from "@/lib/lmnp/store";
import { FormField, TextInput, PrimaryButton } from "@/components/lmnp/design-system";

type Phase = "upload" | "analyzing" | "results" | "confirm";

const ANALYSIS_LINES = [
  "Analyse du document…",
  "Vérification du SIRET…",
  "Création du dossier…",
];

const INPI_BULLETS = ["identité", "SIRET", "adresse", "informations exploitant"];

export function InpiDocumentStep() {
  const router = useRouter();
  const { workspace, dispatch, getFile } = useLmnp();
  const def = getDocumentJourneyStep("inpi");
  const base = `/app/exercices/${workspace.fiscalYear.id}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingUploadRef = useRef(false);

  const inpiDoc = workspace.documents.find(
    (d) => d.id === workspace.declarationDraft?.inpiDocumentId,
  );

  const [phase, setPhase] = useState<Phase>(() => {
    if (workspace.declarationDraft?.inpiConfirmedAt) return "confirm";
    if (inpiDoc?.status === "analyzed") return "results";
    return "upload";
  });
  const [dragging, setDragging] = useState(false);
  const [analysisLine, setAnalysisLine] = useState(0);
  const [detection, setDetection] = useState(() =>
    inpiDoc ? buildInpiDetection(workspace, inpiDoc) : { profile: {}, checks: [] },
  );
  const [form, setForm] = useState<InpiProfile>(() => detection.profile);
  const [error, setError] = useState<string | null>(null);

  const runAnalysisAnimation = useCallback(
    async (documentId: string) => {
      setPhase("analyzing");
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

      if (succeeded === 0) {
        setError("Lecture impossible — essayez un PDF plus net.");
        setPhase("upload");
        return;
      }

      const doc = workspace.documents.find((d) => d.id === documentId);
      if (!doc) return;
      const det = buildInpiDetection(workspace, { ...doc, status: "analyzed" });
      setDetection(det);
      setForm(det.profile);
      setPhase("results");
    },
    [workspace, getFile, dispatch],
  );

  useEffect(() => {
    if (!pendingUploadRef.current) return;
    const doc = workspace.documents.at(-1);
    if (doc?.status === "uploaded") {
      pendingUploadRef.current = false;
      dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { inpiDocumentId: doc.id } });
      void runAnalysisAnimation(doc.id);
    }
  }, [workspace.documents, dispatch, runAnalysisAnimation]);

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

  const confirmAndContinue = () => {
    dispatch({
      type: "CONFIRM_INPI_PROFILE",
      profile: {
        siren: form.siren,
        siret: form.siret,
        firstName: form.firstName,
        lastName: form.lastName,
        address: form.address,
        city: form.city,
        postalCode: form.postalCode,
      },
      documentId: workspace.declarationDraft?.inpiDocumentId,
    });
    const next = nextDocumentStepId("inpi");
    router.push(next ? documentJourneyStepHref(workspace.fiscalYear.id, next) : base);
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

      {phase === "upload" && (
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

      {phase === "analyzing" && (
        <div className="mt-14 text-center">
          <div className="mx-auto h-px w-12 overflow-hidden bg-stone-200">
            <div className="h-full w-1/2 animate-pulse bg-stone-400/60" />
          </div>
          <p className="mt-8 text-[15px] text-stone-600">{ANALYSIS_LINES[analysisLine]}</p>
        </div>
      )}

      {phase === "results" && (
        <div className="mt-12">
          <ul className="space-y-3">
            {detection.checks.map((c) => (
              <li key={c.id} className="flex items-center gap-3 text-[14px] text-stone-600">
                <span className={c.ok ? "text-accent" : "text-stone-300"}>
                  {c.ok ? "✓" : "·"}
                </span>
                {c.label}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-10 text-[13px] text-stone-500 underline decoration-stone-300 underline-offset-4 hover:text-stone-700"
            onClick={() => setPhase("confirm")}
          >
            Vérifier les informations
          </button>
        </div>
      )}

      {phase === "confirm" && (
        <div className="mt-10 space-y-5">
          <FormField label="Nom">
            <TextInput
              value={form.lastName ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            />
          </FormField>
          <FormField label="Prénom">
            <TextInput
              value={form.firstName ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            />
          </FormField>
          <FormField label="SIREN">
            <TextInput
              value={form.siren ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, siren: e.target.value }))}
              inputMode="numeric"
            />
          </FormField>
          <FormField label="SIRET">
            <TextInput
              value={form.siret ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, siret: e.target.value }))}
              inputMode="numeric"
            />
          </FormField>
          <FormField label="Adresse">
            <TextInput
              value={form.address ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Code postal">
              <TextInput
                value={form.postalCode ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
              />
            </FormField>
            <FormField label="Ville">
              <TextInput
                value={form.city ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </FormField>
          </div>
          <div className="pt-6">
            <PrimaryButton onClick={confirmAndContinue}>Confirmer et continuer</PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
