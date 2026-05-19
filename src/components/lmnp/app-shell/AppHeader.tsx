"use client";

import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";
import { CONFIDENCE_LEVEL_LABELS } from "./labels";

export function AppHeader() {
  const { workspace } = useLmnp();
  const { fiscalYear, confidence, pendingValidationCount, alerts } = workspace;
  const blockingCount = alerts.filter((a) => a.severity === "blocking").length;

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#06060b]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="shrink-0 text-sm font-semibold text-zinc-400 hover:text-zinc-200">
            Fiscal AI
          </Link>
          <span className="hidden text-zinc-600 sm:inline">/</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-100">
              Déclaration LMNP {fiscalYear.year}
            </p>
            <p className="truncate text-xs text-zinc-500">
              {CONFIDENCE_LEVEL_LABELS[confidence.level]} · {confidence.score} %
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {blockingCount > 0 && (
            <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-400 ring-1 ring-red-500/30">
              {blockingCount} blocage{blockingCount > 1 ? "s" : ""}
            </span>
          )}
          {pendingValidationCount > 0 && (
            <Link
              href={`/app/exercices/${fiscalYear.id}/validation`}
              className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-400 ring-1 ring-amber-500/30 hover:bg-amber-500/25"
            >
              {pendingValidationCount} à confirmer
            </Link>
          )}
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400 ring-1 ring-emerald-500/30"
            title="Avancement dossier"
          >
            {confidence.score}
          </div>
        </div>
      </div>
    </header>
  );
}
