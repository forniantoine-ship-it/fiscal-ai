"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { OnboardingProgress } from "./OnboardingProgress";
import { AiAssistantChat } from "./AiAssistantChat";
import {
  INITIAL_PROPERTY,
  ONBOARDING_STEPS,
  type OcrExtractedField,
  type OnboardingStepId,
  type PropertyFormData,
  type UploadedDocument,
} from "./types";
import { WelcomeStep } from "./steps/WelcomeStep";
import { DocumentUploadStep } from "./steps/DocumentUploadStep";
import { OcrAnalysisStep } from "./steps/OcrAnalysisStep";
import { PropertyFormStep } from "./steps/PropertyFormStep";
import { ReviewStep } from "./steps/ReviewStep";

export function LmnpOnboarding() {
  const [step, setStep] = useState<OnboardingStepId>("welcome");
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [ocrFields, setOcrFields] = useState<OcrExtractedField[]>([]);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [property, setProperty] = useState<PropertyFormData>(INITIAL_PROPERTY);
  const [chatOpen, setChatOpen] = useState(false);
  const [completed, setCompleted] = useState(false);

  const stepIndex = ONBOARDING_STEPS.findIndex((s) => s.id === step);
  const currentStepMeta = ONBOARDING_STEPS[stepIndex];

  const goNext = useCallback(() => {
    const next = ONBOARDING_STEPS[stepIndex + 1];
    if (next) setStep(next.id);
  }, [stepIndex]);

  const goBack = useCallback(() => {
    const prev = ONBOARDING_STEPS[stepIndex - 1];
    if (prev) setStep(prev.id);
  }, [stepIndex]);

  const handleDocumentsAdd = (docs: UploadedDocument[]) => {
    setDocuments((prev) => [...prev, ...docs]);
  };

  const handleDocumentsRemove = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const startOcrAndAdvance = () => {
    setIsOcrRunning(true);
    setStep("ocr");
  };

  const handleOcrComplete = useCallback((fields: OcrExtractedField[]) => {
    setOcrFields(fields);
    setIsOcrRunning(false);
    setProperty((prev) => ({
      ...prev,
      annualRent: prev.annualRent || "18240",
      propertyTax: prev.propertyTax || "1420",
      loanInterest: prev.loanInterest || "4680",
      furnitureValue: prev.furnitureValue || "12500",
    }));
  }, []);

  const canProceedFromDocuments = documents.length > 0;

  const canProceedFromProperty =
    property.address.trim() &&
    property.city.trim() &&
    property.postalCode.trim() &&
    property.annualRent.trim();

  if (completed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="gradient-mesh absolute inset-0 -z-10" />
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/40">
          <svg className="h-10 w-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1
          className="text-3xl font-normal tracking-tight"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Dossier LMNP prêt à l&apos;export
        </h1>
        <p className="mt-3 max-w-md text-sm text-zinc-400">
          Votre liasse 2031 / 2033 a été préparée. Un expert fiscal peut la valider sous 48 h.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="gradient-mesh pointer-events-none absolute inset-0 -z-10" />

      <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <div className="mb-8 lg:grid lg:grid-cols-[1fr_340px] lg:gap-8">
          <header className="mb-6 lg:mb-0">
            <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Fiscal AI
            </Link>
            <p className="text-xs font-medium uppercase tracking-wider text-amber-400/90">
              Onboarding LMNP
            </p>
            <h1 className="mt-1 text-lg font-semibold text-zinc-100 sm:text-xl">
              {currentStepMeta?.label}
            </h1>
          </header>
          <div className="hidden lg:block" />
        </div>

        <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-8">
          <main className="min-w-0">
            <div className="glass mb-8 rounded-2xl p-4 sm:p-6">
              <OnboardingProgress currentStep={step} />
            </div>

            <div className="glass min-h-[400px] rounded-2xl p-5 sm:p-8">
              {step === "welcome" && <WelcomeStep onNext={goNext} />}
              {step === "documents" && (
                <DocumentUploadStep
                  documents={documents}
                  onDocumentsAdd={handleDocumentsAdd}
                  onDocumentRemove={handleDocumentsRemove}
                />
              )}
              {step === "ocr" && (
                <OcrAnalysisStep
                  documents={documents}
                  isAnalyzing={isOcrRunning}
                  extractedFields={ocrFields}
                  onComplete={handleOcrComplete}
                />
              )}
              {step === "property" && (
                <PropertyFormStep data={property} ocrFields={ocrFields} onChange={setProperty} />
              )}
              {step === "review" && (
                <ReviewStep
                  documents={documents}
                  property={property}
                  onSubmit={() => setCompleted(true)}
                />
              )}
            </div>

            {step !== "welcome" && step !== "review" && (
              <nav className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/10"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Retour
                </button>

                {step === "documents" && (
                  <button
                    type="button"
                    onClick={startOcrAndAdvance}
                    disabled={!canProceedFromDocuments}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Lancer l&apos;analyse OCR
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}

                {step === "ocr" && !isOcrRunning && ocrFields.length > 0 && (
                  <button
                    type="button"
                    onClick={goNext}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
                  >
                    Continuer vers le bien
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}

                {step === "property" && (
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={!canProceedFromProperty}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
                  >
                    Voir le récapitulatif
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </nav>
            )}
          </main>

          <aside className="mt-8 lg:mt-0">
            <AiAssistantChat
              currentStep={step}
              isOpen={chatOpen}
              onToggle={() => setChatOpen((o) => !o)}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
