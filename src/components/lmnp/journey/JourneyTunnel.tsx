"use client";

import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";

export function JourneyTunnel() {
  const { workspace } = useLmnp();
  const { journey, nextAction, assistant } = workspace;

  if (journey.isComplete) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-sm flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
          Déclaration transmise
        </h1>
      </div>
    );
  }

  const badges = assistant.insights.slice(0, 2);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-sm flex-col justify-center px-4 py-12">
      <div
        className="h-0.5 w-full overflow-hidden rounded-full bg-white/[0.04]"
        role="progressbar"
        aria-valuenow={journey.percentComplete}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-emerald-500/70 transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(journey.percentComplete, 2)}%` }}
        />
      </div>

      <h1 className="mt-14 text-[1.75rem] font-semibold leading-tight tracking-tight text-zinc-50">
        {assistant.headline}
      </h1>

      {badges.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {badges.map((insight) => (
            <span
              key={insight.id}
              className={`rounded-md px-2 py-0.5 text-[11px] tracking-wide ${
                insight.tone === "ai"
                  ? "text-violet-400/80"
                  : insight.tone === "pending"
                    ? "text-amber-400/80"
                    : "text-zinc-500"
              }`}
            >
              {insight.text}
            </span>
          ))}
        </div>
      )}

      <Link
        href={nextAction.href}
        className="mt-10 flex w-full items-center justify-center rounded-xl bg-zinc-100 py-3.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-white"
      >
        {nextAction.cta}
      </Link>
    </div>
  );
}
