"use client";

import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";

export function JourneyTunnel() {
  const { workspace } = useLmnp();
  const { journey, nextAction, assistant, fiscalYear } = workspace;

  if (journey.isComplete) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <span className="text-2xl text-emerald-400">✓</span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-100">
          Déclaration transmise
        </h1>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-16 sm:py-24">
      <ProgressRail journey={journey} year={fiscalYear.year} />

      <h1 className="mt-16 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-[2rem]">
        {assistant.headline}
      </h1>

      {assistant.insights.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-2">
          {assistant.insights.map((insight) => (
            <li
              key={insight.id}
              className={`rounded-full px-3 py-1 text-xs ${
                insight.tone === "ai"
                  ? "bg-violet-500/10 text-violet-300/90"
                  : insight.tone === "pending"
                    ? "bg-amber-500/10 text-amber-300/90"
                    : "bg-emerald-500/10 text-emerald-400/90"
              }`}
            >
              {insight.tone === "ai" && (
                <span className="mr-1.5 inline-block h-1 w-1 animate-pulse rounded-full bg-violet-400 align-middle" />
              )}
              {insight.text}
            </li>
          ))}
        </ul>
      )}

      <Link
        href={nextAction.href}
        className="mt-10 flex w-full items-center justify-center rounded-2xl bg-zinc-50 py-4 text-sm font-semibold text-zinc-950 transition-all hover:bg-white active:scale-[0.99]"
      >
        {nextAction.cta}
      </Link>

      <StepDots steps={journey.steps} currentId={journey.currentStepId} />
    </div>
  );
}

function ProgressRail({
  journey,
  year,
}: {
  journey: { percentComplete: number; currentStepIndex: number; totalSteps: number };
  year: number;
}) {
  return (
    <div className="flex items-center gap-4 text-[11px] text-zinc-600">
      <span>{year}</span>
      <div className="h-px flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full bg-emerald-500/80 transition-all duration-700 ease-out"
          style={{ width: `${Math.max(journey.percentComplete, 3)}%` }}
        />
      </div>
      <span className="tabular-nums">
        {journey.currentStepIndex}/{journey.totalSteps}
      </span>
    </div>
  );
}

function StepDots({
  steps,
  currentId,
}: {
  steps: { id: string; status: string; title: string }[];
  currentId: string;
}) {
  return (
    <div className="mt-20 flex justify-center gap-1.5">
      {steps.map((step) => (
        <div
          key={step.id}
          title={step.title}
          className={`h-1 rounded-full transition-all duration-500 ${
            step.status === "completed"
              ? "w-6 bg-emerald-500/60"
              : step.id === currentId
                ? "w-8 animate-pulse bg-emerald-400"
                : "w-3 bg-white/[0.06]"
          }`}
        />
      ))}
    </div>
  );
}
