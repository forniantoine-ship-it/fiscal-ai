"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLmnp } from "@/lib/lmnp/store";

const navLink =
  "text-[12px] text-stone-500 transition-colors hover:text-stone-700";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { workspace } = useLmnp();
  const base = `/app/exercices/${workspace.fiscalYear.id}`;
  const isDashboard = pathname === base || pathname === `${base}/`;
  const isDocuments = pathname.startsWith(`${base}/documents`);
  const pending = workspace.pendingValidationCount;

  return (
    <div className="min-h-screen">
      <header className="surface-frost fixed inset-x-0 top-0 z-40">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-6">
          <Link
            href={base}
            className="shrink-0 text-[13px] font-medium text-stone-600 transition-colors hover:text-stone-800"
          >
            Fiscal AI
          </Link>

          <nav
            className="hidden items-center gap-5 sm:flex"
            aria-label="Navigation principale"
          >
            <Link
              href={base}
              className={isDashboard ? "text-[12px] text-stone-700" : navLink}
              aria-current={isDashboard ? "page" : undefined}
            >
              Tableau de bord
            </Link>
            <Link
              href={`${base}/documents`}
              className={isDocuments ? "text-[12px] text-stone-700" : navLink}
              aria-current={isDocuments ? "page" : undefined}
            >
              Documents
            </Link>
            <Link href="/app" className={navLink}>
              Mes déclarations
            </Link>
            {pending > 0 && (
              <Link href={`${base}/validation`} className={navLink}>
                {pending} à confirmer
              </Link>
            )}
          </nav>

          <div className="flex shrink-0 items-center gap-4">
            <Link href="/" className={`${navLink} sm:hidden`}>
              Accueil
            </Link>
            <span className="text-[12px] tabular-nums text-stone-400">
              {workspace.fiscalYear.year}
            </span>
          </div>
        </div>
        <nav
          className="flex items-center justify-center gap-5 border-t border-stone-200/25 px-6 py-2.5 sm:hidden"
          aria-label="Navigation mobile"
        >
          <Link
            href={base}
            className={isDashboard ? "text-[12px] text-stone-700" : navLink}
          >
            Tableau de bord
          </Link>
          <Link
            href={`${base}/documents`}
            className={isDocuments ? "text-[12px] text-stone-700" : navLink}
          >
            Documents
          </Link>
          <Link href="/app" className={navLink}>
            Mes déclarations
          </Link>
        </nav>
      </header>

      <main className="pt-24 sm:pt-14">{children}</main>
    </div>
  );
}
