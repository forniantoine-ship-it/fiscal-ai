"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLmnp } from "@/lib/lmnp/store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { workspace } = useLmnp();
  const base = `/app/exercices/${workspace.fiscalYear.id}`;
  const isHome = pathname === base || pathname === `${base}/`;
  const pending = workspace.pendingValidationCount;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link
            href={base}
            className="text-[13px] font-medium text-stone-600 transition-colors hover:text-stone-800"
          >
            Fiscal AI
          </Link>
          <div className="flex items-center gap-6">
            {!isHome && (
              <Link
                href={base}
                className="text-[12px] text-stone-500 transition-colors hover:text-stone-700"
              >
                Déclaration
              </Link>
            )}
            {pending > 0 && (
              <Link
                href={`${base}/validation`}
                className="text-[12px] text-stone-500 hover:text-stone-700"
              >
                {pending} à confirmer
              </Link>
            )}
            <span className="text-[12px] tabular-nums text-stone-400">{workspace.fiscalYear.year}</span>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
