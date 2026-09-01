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
    <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link
          href={base}
          className={`text-[12px] transition-colors ${
            isDashboard
              ? "text-stone-500 hover:text-stone-600"
              : "text-stone-500 hover:text-stone-700"
          }`}
        >
          {fiscalYear.year}
        </Link>

        {pendingValidationCount > 0 && (
          <Link
            href={`${base}/validation`}
            className="text-xs text-stone-500 hover:text-stone-600"
          >
            {pendingValidationCount} à vérifier
          </Link>
        )}
      </div>
    </header>
  );
}
