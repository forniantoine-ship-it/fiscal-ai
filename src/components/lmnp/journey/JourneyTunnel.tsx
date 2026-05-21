"use client";

import Link from "next/link";
import { useState } from "react";
import { useLmnp } from "@/lib/lmnp/store";

export function JourneyTunnel() {
  const { workspace } = useLmnp();
  const { journey, nextAction, fiscalYear } = workspace;
  const [showSteps, setShowSteps] = useState(true);

  const activeStep = journey.steps.find((s) => s.id === journey.currentStepId);
  const completedCount = journey.steps.filter((s) => s.status === "completed").length;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-10">
        <p className="text-xs font-medium tracking-wide text-zinc-500">
          Déclaration LMNP {fiscalYear.year}
        </p>
        <h1 className="mt-2 text-lg font-semibold text-zinc-200">
          Progression de votre déclaration
        </h1>
        <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
          <span>
            {journey.isComplete
              ? "Terminé"
              : `${journey.percentComplete} % complété`}
          </span>
          <span>
            Étape {journey.currentStepIndex} sur {journey.totalSteps}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-700"
            style={{
              width: `${journey.isComplete ? 100 : journey.percentComplete}%`,
            }}
          />
        </div>
      </header>

      {journey.isComplete ? (
        <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-8 text-center">
          <p className="text-3xl">✓</p>
          <h2 className="mt-4 text-xl font-semibold text-zinc-100">
            Votre déclaration a été transmise
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            L’IA a traité vos documents et votre dossier est clos. Merci pour votre confiance.
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] to-transparent p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <span className="inline-flex rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                En cours
              </span>
              <h2 className="mt-3 text-xl font-semibold text-zinc-100">
                {nextAction.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {nextAction.description}
              </p>
              {activeStep?.aiHint && (
                <p className="mt-3 text-xs text-emerald-400/80">{activeStep.aiHint}</p>
              )}
            </div>
            <Link
              href={nextAction.href}
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-100 px-6 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-white"
            >
              {nextAction.cta}
              <span className="ml-1.5" aria-hidden>
                →
              </span>
            </Link>
          </div>
        </section>
      )}

      <div className="mt-8">
        <button
          type="button"
          onClick={() => setShowSteps((v) => !v)}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          {showSteps ? "Masquer les étapes" : "Afficher les étapes"}
        </button>

        {showSteps && (
          <ol className="mt-4 space-y-1">
            {journey.steps.map((step) => (
              <li key={step.id}>
                <StepRow step={step} />
              </li>
            ))}
          </ol>
        )}

        {!journey.isComplete && completedCount > 0 && (
          <p className="mt-6 text-center text-xs text-zinc-600">
            {completedCount} étape{completedCount > 1 ? "s" : ""} terminée
            {completedCount > 1 ? "s" : ""} — l’IA prépare la suite pour vous.
          </p>
        )}
      </div>
    </div>
  );
}

function StepRow({
  step,
}: {
  step: {
    id: string;
    title: string;
    status: "completed" | "active" | "locked";
    href: string;
    stepNumber: number;
  };
}) {
  const isLocked = step.status === "locked";
  const isDone = step.status === "completed";
  const isActive = step.status === "active";

  const inner = (
    <>
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          isDone
            ? "bg-emerald-500/20 text-emerald-400"
            : isActive
              ? "bg-emerald-500 text-zinc-950"
              : "bg-white/5 text-zinc-600"
        }`}
      >
        {isDone ? "✓" : isLocked ? "🔒" : step.stepNumber}
      </span>
      <span
        className={`min-w-0 flex-1 text-sm font-medium ${
          isActive ? "text-zinc-100" : isDone ? "text-zinc-400" : "text-zinc-600"
        }`}
      >
        {step.title}
      </span>
      <span className="shrink-0 text-[11px] text-zinc-600">
        {isDone ? "Complété" : isActive ? "En cours" : "Verrouillé"}
      </span>
    </>
  );

  if (isLocked) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl px-3 py-3 opacity-60"
        title="Complétez les étapes précédentes pour accéder à cette étape."
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={step.href}
      className={`flex items-center gap-3 rounded-xl px-3 py-3 transition-colors ${
        isActive ? "bg-emerald-500/[0.06] ring-1 ring-emerald-500/20" : "hover:bg-white/[0.02]"
      }`}
    >
      {inner}
    </Link>
  );
}
