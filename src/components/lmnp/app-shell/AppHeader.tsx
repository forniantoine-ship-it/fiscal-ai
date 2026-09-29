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
    <header className="sticky top-0 z-40 border-b border-outline/70 bg-panel/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link
          href={base}
          className={`text-[12px] transition-colors ${
            isDashboard
              ? "text-ink-muted hover:text-ink-soft"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          {fiscalYear.year}
        </Link>

        {pendingValidationCount > 0 && (
          <Link
            href={`${base}/validation`}
            className="text-xs text-ink-muted hover:text-ink-soft"
          >
            {pendingValidationCount} à vérifier
          </Link>
        )}
      </div>
    </header>
  );
}
