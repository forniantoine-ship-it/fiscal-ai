"use client";

import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";

export function DashboardAssistant() {
  const { workspace } = useLmnp();
  const { nextAction, fiscalYear } = workspace;

  return (
    <section className="mx-auto max-w-xl py-4 text-center">
      <p className="text-xs font-medium tracking-wide text-zinc-500">
        Tableau de bord · {fiscalYear.year}
      </p>
      <p className="mt-6 text-sm text-zinc-500">Que dois-je faire maintenant ?</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
        {nextAction.title}
      </h1>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-zinc-400">
        {nextAction.description}
      </p>
      <Link
        href={nextAction.href}
        className="mt-8 inline-flex rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
      >
        {nextAction.cta}
      </Link>
    </section>
  );
}
