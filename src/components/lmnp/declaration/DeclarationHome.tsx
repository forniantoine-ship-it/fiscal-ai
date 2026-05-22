"use client";

import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";
import { DECLARATION_FLOW } from "@/lib/lmnp/constants/declaration-flow";
import {
  MinimalProgress,
  PrimaryButton,
  QuietBadge,
  QuietInsight,
} from "@/components/lmnp/design-system";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "En attente",
  processing: "Analyse…",
  analyzed: "Analysé",
  failed: "À revoir",
};

export function DeclarationHome() {
  const { workspace } = useLmnp();
  const { declaration, fiscalYear } = workspace;
  const { nextAction, insights, recentDocuments, percentComplete, steps } = declaration;

  const completed = fiscalYear.transmittedAt;
  const currentStep = steps.find((s) => s.status === "current");

  return (
    <div className="mx-auto max-w-xl animate-fade-in px-4 py-14 sm:py-20">
      <header className="text-center">
        <QuietBadge tone="neutral">
          Déclaration {fiscalYear.year}
        </QuietBadge>
        <h1
          className="mt-6 text-[1.65rem] font-normal leading-snug tracking-tight text-stone-800 sm:text-3xl"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          {completed ? "Votre déclaration est transmise" : nextAction.headline}
        </h1>
        {!completed && (
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-stone-500">
            Déposez vos documents — le reste avance presque tout seul.
          </p>
        )}
      </header>

      {!completed && (
        <>
          <div className="mt-12">
            <PrimaryButton href={nextAction.href} className="w-full sm:w-auto">
              {nextAction.label}
            </PrimaryButton>
          </div>

          {insights.length > 0 && (
            <ul className="mt-8 flex flex-col items-center gap-2">
              {insights.map((text) => (
                <li key={text}>
                  <QuietInsight text={text} />
                </li>
              ))}
            </ul>
          )}

          {recentDocuments.length > 0 && (
            <section className="mt-14">
              <p className="mb-4 text-center text-[11px] tracking-wide text-stone-400">
                Documents récents
              </p>
              <ul className="space-y-2">
                {recentDocuments.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between rounded-xl bg-card px-4 py-3 shadow-[var(--shadow-soft)]"
                  >
                    <span className="truncate text-sm text-stone-700">{doc.fileName}</span>
                    <span className="shrink-0 text-[11px] text-stone-400">
                      {STATUS_LABEL[doc.status] ?? doc.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-16">
            <MinimalProgress percent={percentComplete} label="Progression" />
            <nav className="mt-8" aria-label="Étapes de la déclaration">
              <ol className="flex flex-wrap justify-center gap-x-4 gap-y-2">
                {DECLARATION_FLOW.map((step) => {
                  const view = steps.find((s) => s.id === step.id);
                  const done = view?.status === "completed";
                  const current = view?.status === "current";
                  return (
                    <li key={step.id}>
                      <Link
                        href={view?.href ?? "#"}
                        className={`text-[11px] transition-colors ${
                          current
                            ? "text-stone-700 underline decoration-stone-300 underline-offset-4"
                            : done
                              ? "text-stone-400"
                              : "text-stone-300 hover:text-stone-500"
                        }`}
                      >
                        {step.title}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </nav>
            {currentStep && (
              <p className="mt-6 text-center text-[12px] text-stone-400">
                Prochaine étape : {currentStep.title}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
