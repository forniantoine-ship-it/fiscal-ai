"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLmnp } from "@/lib/lmnp/store";

export function AppHeader() {
  const pathname = usePathname();
  const { workspace } = useLmnp();
  const { fiscalYear, pendingValidationCount, journey } = workspace;

  const base = `/app/exercices/${fiscalYear.id}`;
  const isDashboard = pathname === base || pathname === `${base}/`;

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.03] bg-[#06060b]/80 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          href={base}
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          LMNP {fiscalYear.year}
        </Link>

        {!isDashboard && pendingValidationCount > 0 && (
          <Link
            href={`${base}/validation`}
            className="text-xs text-amber-400/90 hover:text-amber-300"
          >
            {pendingValidationCount} à vérifier
          </Link>
        )}
      </div>
    </header>
  );
}
