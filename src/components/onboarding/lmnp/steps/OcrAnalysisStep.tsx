"use client";

import { useEffect, useState } from "react";
import type { OcrExtractedField, UploadedDocument } from "../types";

interface OcrAnalysisStepProps {
  documents: UploadedDocument[];
  onComplete: (fields: OcrExtractedField[]) => void;
  isAnalyzing: boolean;
  extractedFields: OcrExtractedField[];
}

const SIMULATED_FIELDS: OcrExtractedField[] = [
  { label: "Loyers annuels perçus", value: "18 240,00 €", confidence: 96 },
  { label: "Charges copropriété", value: "2 156,00 €", confidence: 91 },
  { label: "Assurance PNO", value: "348,00 €", confidence: 94 },
  { label: "Taxe foncière", value: "1 420,00 €", confidence: 88 },
  { label: "Intérêts d'emprunt", value: "4 680,00 €", confidence: 85 },
  { label: "Mobilier amortissable", value: "12 500,00 €", confidence: 79 },
];

const SCAN_PHASES = [
  "Numérisation des documents…",
  "Détection des tableaux et montants…",
  "Extraction des données fiscales…",
  "Vérification de cohérence LMNP…",
  "Finalisation de l'analyse…",
];

export function OcrAnalysisStep({
  documents,
  onComplete,
  isAnalyzing,
  extractedFields,
}: OcrAnalysisStepProps) {
  const [progress, setProgress] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [visibleFields, setVisibleFields] = useState<OcrExtractedField[]>([]);

  useEffect(() => {
    if (!isAnalyzing) return;

    setProgress(0);
    setPhaseIndex(0);
    setVisibleFields([]);

    const progressInterval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return p + 2;
      });
    }, 80);

    const phaseInterval = setInterval(() => {
      setPhaseIndex((i) => Math.min(i + 1, SCAN_PHASES.length - 1));
    }, 900);

    const fieldTimeouts: ReturnType<typeof setTimeout>[] = [];
    SIMULATED_FIELDS.forEach((field, index) => {
      fieldTimeouts.push(
        setTimeout(() => {
          setVisibleFields((prev) => [...prev, field]);
        }, 1200 + index * 400),
      );
    });

    const completeTimeout = setTimeout(() => {
      onComplete(SIMULATED_FIELDS);
    }, 4200);

    return () => {
      clearInterval(progressInterval);
      clearInterval(phaseInterval);
      fieldTimeouts.forEach(clearTimeout);
      clearTimeout(completeTimeout);
    };
  }, [isAnalyzing, onComplete]);

  const displayFields = isAnalyzing ? visibleFields : extractedFields;
  const showResults = !isAnalyzing || progress >= 85;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">
          {isAnalyzing ? "Analyse OCR en cours" : "Analyse OCR terminée"}
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          {documents.length} document{documents.length > 1 ? "s" : ""} en cours d&apos;analyse par
          notre moteur de reconnaissance fiscale.
        </p>
      </div>

      <div className="glass overflow-hidden rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
            {isAnalyzing && (
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
            )}
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <svg
                className={`h-7 w-7 text-emerald-400 ${isAnalyzing ? "animate-pulse" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-200">
              {isAnalyzing ? SCAN_PHASES[phaseIndex] : "Analyse terminée"}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-amber-400 transition-all duration-300"
                style={{ width: `${isAnalyzing ? progress : 100}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">{isAnalyzing ? progress : 100} % complété</p>
          </div>
        </div>

        {showResults && displayFields.length > 0 && (
          <div className="mt-6 border-t border-white/5 pt-6">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-emerald-400">
              Données extraites
            </p>
            <ul className="space-y-2">
              {displayFields.map((field) => (
                <li
                  key={field.label}
                  className="flex items-center justify-between gap-4 rounded-lg bg-white/[0.03] px-3 py-2.5 animate-fade-in"
                >
                  <span className="text-sm text-zinc-400">{field.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-zinc-100">{field.value}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        field.confidence >= 90
                          ? "bg-emerald-500/15 text-emerald-400"
                          : field.confidence >= 80
                            ? "bg-amber-500/15 text-amber-400"
                            : "bg-zinc-500/15 text-zinc-400"
                      }`}
                    >
                      {field.confidence} %
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!isAnalyzing && extractedFields.length > 0 && (
        <p className="text-center text-xs text-zinc-500">
          Vous pourrez ajuster ces montants à l&apos;étape « Bien locatif ».
        </p>
      )}
    </div>
  );
}
