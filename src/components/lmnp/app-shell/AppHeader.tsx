"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLmnp } from "@/lib/lmnp/store";

export function AppHeader() {
  const pathname = usePathname();
  const { workspace } = useLmnp();
  const { fiscalYear, pendingValidationCount } = workspace;

  const base = `/app/exercices/${fiscalYear.id}`;
  const isDashboard = pathname === base || pathname === `${base}/`;

  return (
    <header
      className={
        isDashboard
          ? "absolute inset-x-0 top-0 z-40 bg-transparent"
          : "sticky top-0 z-40 border-b border-white/[0.03] bg-[#06060b]/80 backdrop-blur-md"
      }
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link
          href={base}
          className={`text-[12px] transition-colors ${
            isDashboard
              ? "text-zinc-800/50 hover:text-zinc-700/60"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {fiscalYear.year}
        </Link>

        {!isDashboard && pendingValidationCount > 0 && (
          <Link
            href={`${base}/validation`}
            className="text-xs text-zinc-500 hover:text-zinc-400"
          >
            {pendingValidationCount} à vérifier
          </Link>
        )}
      </div>
    </header>
  );
}
