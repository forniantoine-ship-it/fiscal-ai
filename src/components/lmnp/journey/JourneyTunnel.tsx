"use client";

import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";
import type { JourneyStepView } from "@/lib/lmnp/types";

export function JourneyTunnel() {
  const { workspace } = useLmnp();
  const { journey, nextAction, assistant } = workspace;

  if (journey.isComplete) {
    return (
      <div className="mx-auto max-w-xl px-2 py-6">
        <p className="text-[11px] text-stone-400">Parcours terminé</p>
        <h1 className="mt-3 text-xl font-normal leading-relaxed text-stone-600">
          Déclaration transmise
        </h1>
        <CompletedSteps steps={journey.steps} />
      </div>
    );
  }

  const insights = assistant.insights.slice(0, 2);
  const activeStep = journey.steps.find((s) => s.status === "active");

  return (
    <div className="mx-auto w-full max-w-xl px-2 py-2 sm:py-4">
      <div className="mb-10">
        <div className="flex items-baseline justify-between text-[11px] text-stone-500">
          <span>
            Étape {journey.currentStepIndex} sur {journey.totalSteps}
          </span>
          <span className="tabular-nums">{journey.percentComplete}%</span>
        </div>
        <div
          className="mt-3 h-px overflow-hidden bg-stone-100"
          role="progressbar"
          aria-valuenow={journey.percentComplete}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progression du parcours"
        >
          <div
            className="h-full bg-stone-300 transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(journey.percentComplete, 4)}%` }}
          />
        </div>
        {activeStep && (
          <p className="mt-2 hidden text-[11px] text-stone-400 lg:block">{activeStep.title}</p>
        )}
      </div>

      <h1 className="text-xl font-normal leading-[1.5] tracking-tight text-stone-700">
        {assistant.headline}
      </h1>

      {insights.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
          {insights.map((insight) => (
            <li
              key={insight.id}
              className={`text-[11px] ${
                insight.tone === "ai"
                  ? "text-stone-500"
                  : insight.tone === "pending"
                    ? "text-stone-500"
                    : "text-stone-400"
              }`}
            >
              {insight.text}
            </li>
          ))}
        </ul>
      )}

      <Link
        href={nextAction.href}
        className="mt-9 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground shadow-sm shadow-stone-900/5 transition-opacity hover:opacity-90"
      >
        {nextAction.cta}
        <span aria-hidden className="text-stone-400">
          →
        </span>
      </Link>

      <nav
        className="mt-14 border-t border-stone-200/80 pt-8 lg:hidden"
        aria-label="Étapes du parcours"
      >
        <p className="mb-5 text-[10px] tracking-wide text-stone-400">Parcours</p>
        <ol className="space-y-0.5">
          {journey.steps.map((step) => (
            <li key={step.id}>
              <TunnelStepRow step={step} />
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}

function CompletedSteps({ steps }: { steps: JourneyStepView[] }) {
  return (
    <nav className="mt-12 border-t border-stone-200/80 pt-8" aria-label="Étapes du parcours">
      <ol className="space-y-0.5">
        {steps.map((step) => (
          <li key={step.id}>
            <TunnelStepRow step={step} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function TunnelStepRow({ step }: { step: JourneyStepView }) {
  const isLocked = step.status === "locked";
  const isDone = step.status === "completed";
  const isActive = step.status === "active";

  const row = (
    <>
      <StepMarker step={step} />
      <span
        className={`min-w-0 flex-1 text-sm ${
          isActive ? "text-stone-600" : isDone ? "text-stone-400" : "text-stone-400"
        }`}
      >
        {step.title}
      </span>
      <span className="shrink-0 text-[10px] text-stone-400">
        {isDone ? "Fait" : isActive ? "En cours" : "—"}
      </span>
    </>
  );

  if (isLocked) {
    return (
      <div className="flex items-center gap-3 rounded-lg px-2 py-2.5 opacity-80">{row}</div>
    );
  }

  return (
    <Link
      href={step.href}
      className={`flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors ${
        isActive ? "bg-stone-100/80" : "hover:bg-stone-100/50"
      }`}
    >
      {row}
    </Link>
  );
}

function StepMarker({ step }: { step: JourneyStepView }) {
  const isDone = step.status === "completed";
  const isActive = step.status === "active";

  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] ${
        isDone
          ? "text-stone-500"
          : isActive
            ? "ring-1 ring-accent/25 text-accent"
            : "text-stone-400"
      }`}
    >
      {isDone ? "✓" : step.stepNumber}
    </span>
  );
}
