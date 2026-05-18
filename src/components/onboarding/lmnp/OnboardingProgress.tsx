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
        <span className="font-medium text-zinc-400">
          Étape {currentIndex + 1} sur {ONBOARDING_STEPS.length}
        </span>
        <span className="font-semibold text-emerald-400">{Math.round(progress)} %</span>
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-amber-400 transition-all duration-500 ease-out"
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
                    ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40"
                    : isCurrent
                      ? "bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/30"
                      : "bg-white/5 text-zinc-500 ring-1 ring-white/10"
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
                  isCurrent ? "text-emerald-400" : isComplete ? "text-zinc-400" : "text-zinc-600"
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
