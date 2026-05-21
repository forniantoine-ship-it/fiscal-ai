"use client";

import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";

interface StepPageShellProps {
  children: React.ReactNode;
  /** Hide the floating next-step CTA (e.g. when page has its own primary action). */
  hideNextCta?: boolean;
}

export function StepPageShell({ children, hideNextCta }: StepPageShellProps) {
  const { workspace } = useLmnp();
  const { nextAction, journey, fiscalYear } = workspace;
  const base = `/app/exercices/${fiscalYear.id}`;

  const showNext =
    !hideNextCta &&
    !journey.isComplete &&
    journey.currentStepId !== "documents" &&
    journey.currentStepId !== "analysis";

  return (
    <div className="relative">
      <div className="mb-6">
        <Link
          href={base}
          className="text-xs text-zinc-500 transition-colors hover:text-emerald-400"
        >
          ← Retour au parcours
        </Link>
      </div>
      {children}
      {showNext && (
        <div className="sticky bottom-6 mt-10 flex justify-end">
          <Link
            href={nextAction.href}
            className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-5 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-black/30 transition-colors hover:bg-white"
          >
            Étape suivante : {nextAction.cta}
            <span aria-hidden>→</span>
          </Link>
        </div>
      )}
    </div>
  );
}
