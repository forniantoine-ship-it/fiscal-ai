"use client";

import { ONBOARDING_STEPS, type OnboardingStepId } from "./types";

interface OnboardingProgressProps {
  currentStep: OnboardingStepId;
}

export function OnboardingProgress({ currentStep }: OnboardingProgressProps) {
  const currentIndex = ONBOARDING_STEPS.findIndex((s) => s.id === currentStep);
  const progress = ((currentIndex + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-medium text-stone-600">
          Étape {currentIndex + 1} sur {ONBOARDING_STEPS.length}
        </span>
        <span className="font-semibold text-accent">{Math.round(progress)} %</span>
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-stone-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent via-accent to-stone-400 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
        <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      </div>

      <div className="mt-4 hidden gap-1 sm:flex">
        {ONBOARDING_STEPS.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = step.id === currentStep;

          return (
            <div key={step.id} className="flex flex-1 flex-col items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${
                  isComplete
                    ? "bg-accent-muted text-accent ring-1 ring-accent/30"
                    : isCurrent
                      ? "bg-accent text-white shadow-lg shadow-stone-900/5"
                      : "bg-stone-100 text-stone-500 ring-1 ring-stone-200"
                }`}
              >
                {isComplete ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={`hidden text-center text-[10px] font-medium uppercase tracking-wider lg:block ${
                  isCurrent ? "text-accent" : isComplete ? "text-stone-600" : "text-stone-500"
                }`}
              >
                {step.shortLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
