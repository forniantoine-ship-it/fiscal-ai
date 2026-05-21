"use client";

import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";
import { FISCAL_YEAR_STATUS_LABELS } from "./labels";

export function AppHeader() {
  const { workspace } = useLmnp();
  const { fiscalYear, pendingValidationCount, canClose } = workspace;

  const statusLabel = canClose
    ? FISCAL_YEAR_STATUS_LABELS.ready_to_close
    : FISCAL_YEAR_STATUS_LABELS[fiscalYear.status];

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#06060b]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="shrink-0 text-sm font-semibold text-zinc-500 hover:text-zinc-300">
            Fiscal AI
          </Link>
          <span className="hidden text-zinc-700 sm:inline">/</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-100">LMNP {fiscalYear.year}</p>
            <p className="truncate text-xs text-zinc-500">{statusLabel}</p>
          </div>
        </div>

        {pendingValidationCount > 0 && (
          <Link
            href={`/app/exercices/${fiscalYear.id}/recettes`}
            className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-400 ring-1 ring-amber-500/25 hover:bg-amber-500/25"
          >
            {pendingValidationCount} à vérifier
          </Link>
        )}
      </div>
    </header>
  );
}
