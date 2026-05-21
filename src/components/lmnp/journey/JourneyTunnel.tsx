"use client";

import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";

export function JourneyTunnel() {
  const { workspace } = useLmnp();
  const { journey, nextAction, assistant } = workspace;

  if (journey.isComplete) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[16rem] flex-col items-center justify-center px-10 text-center">
        <p className="text-lg font-normal leading-relaxed text-zinc-500">
          Déclaration transmise
        </p>
      </div>
    );
  }

  const badge = assistant.insights[0];

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-[16rem] flex-col px-10">
      <div className="flex flex-1 flex-col items-center justify-center pb-8 pt-16 text-center">
        <h1 className="text-lg font-normal leading-[1.45] tracking-tight text-zinc-500">
          {assistant.headline}
        </h1>

        {badge && (
          <p className="mt-8 text-[10px] font-normal text-zinc-800/35">{badge.text}</p>
        )}

        <Link
          href={nextAction.href}
          className="group mt-[5.5rem] inline-flex items-baseline gap-1.5 py-2 text-[15px] font-normal text-zinc-400 transition-colors duration-200 hover:text-zinc-300"
        >
          {nextAction.cta}
          <span
            aria-hidden
            className="text-zinc-700/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-zinc-600/60"
          >
            →
          </span>
        </Link>
      </div>

      <div
        className="mx-auto mb-14 h-px w-12 overflow-hidden bg-white/[0.015]"
        role="progressbar"
        aria-valuenow={journey.percentComplete}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progression"
      >
        <div
          className="h-full bg-white/[0.08] transition-[width] duration-[1.4s] ease-out"
          style={{ width: `${Math.max(journey.percentComplete, 8)}%` }}
        />
      </div>
    </div>
  );
}
