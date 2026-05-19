"use client";

import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";

export function NextActionCard() {
  const { workspace } = useLmnp();
  const { nextAction, confidence } = workspace;

  return (
    <section className="glass rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
        À faire maintenant
      </p>
      <h2 className="mt-2 text-xl font-semibold text-zinc-100">{nextAction.title}</h2>
      <p className="mt-2 text-sm text-zinc-400">{nextAction.description}</p>
      {nextAction.estimatedMinutes && (
        <p className="mt-2 text-xs text-zinc-500">
          Environ {nextAction.estimatedMinutes} min · Dossier à {confidence.score} %
        </p>
      )}
      <Link
        href={nextAction.href}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
      >
        Continuer
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </section>
  );
}
