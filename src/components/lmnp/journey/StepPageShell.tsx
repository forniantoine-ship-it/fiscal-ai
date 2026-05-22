"use client";

import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";

interface StepPageShellProps {
  children: React.ReactNode;
  hideNextCta?: boolean;
}

export function StepPageShell({ children, hideNextCta }: StepPageShellProps) {
  const { workspace } = useLmnp();
  const { nextAction, journey, fiscalYear } = workspace;
  const base = `/app/exercices/${fiscalYear.id}`;

  const showNext = !hideNextCta && !journey.isComplete;

  return (
    <div>
      <Link
        href={base}
        className="mb-8 inline-block text-xs text-stone-500 transition-colors hover:text-stone-600"
      >
        ← Tableau de bord
      </Link>
      {children}
      {showNext && (
        <div className="mt-12 flex justify-center sm:justify-end">
          <Link
            href={nextAction.href}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-medium text-accent-foreground shadow-sm shadow-stone-900/5 transition-opacity hover:opacity-90"
          >
            {nextAction.cta}
            <span aria-hidden>→</span>
          </Link>
        </div>
      )}
    </div>
  );
}
