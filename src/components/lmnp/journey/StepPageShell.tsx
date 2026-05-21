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
        className="mb-8 inline-block text-xs text-zinc-600 transition-colors hover:text-zinc-400"
      >
        ← Parcours
      </Link>
      {children}
      {showNext && (
        <div className="mt-12 flex justify-center sm:justify-end">
          <Link
            href={nextAction.href}
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-50/95 px-6 py-3 text-sm font-semibold text-zinc-950 transition-all hover:bg-white"
          >
            {nextAction.cta}
            <span aria-hidden>→</span>
          </Link>
        </div>
      )}
    </div>
  );
}
