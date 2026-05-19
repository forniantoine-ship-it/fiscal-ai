"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLmnp } from "@/lib/lmnp/store";

const MAIN_NAV = [
  { href: "", label: "Tableau de bord", exact: true },
  { href: "/documents", label: "Documents" },
  { href: "/validation", label: "Validation", badge: "pending" as const },
  { href: "/alertes", label: "Alertes", badge: "blocking" as const },
];

const TABS_NAV = [
  { href: "/activite", label: "Activité" },
  { href: "/recettes", label: "Recettes" },
  { href: "/depenses", label: "Dépenses" },
  { href: "/immobilisations", label: "Immobilisations" },
  { href: "/emprunts", label: "Emprunts" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { workspace } = useLmnp();
  const base = `/app/exercices/${workspace.fiscalYear.id}`;
  const pending = workspace.pendingValidationCount;
  const blocking = workspace.blockingAlertCount;

  function isActive(href: string, exact?: boolean) {
    const full = `${base}${href}`;
    if (exact) return pathname === full || pathname === `${base}/`;
    return pathname.startsWith(full);
  }

  return (
    <aside className="w-56 shrink-0 border-r border-white/5 bg-[#0a0a0f]/80 p-4">
      <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Mon dossier
      </p>
      <nav className="space-y-1">
        {MAIN_NAV.map((item) => {
          const active = isActive(item.href, item.exact);
          let badge: number | undefined;
          if (item.badge === "pending") badge = pending;
          if (item.badge === "blocking") badge = blocking;

          return (
            <Link
              key={item.href}
              href={`${base}${item.href}`}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-emerald-500/15 font-medium text-emerald-400"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              }`}
            >
              <span>{item.label}</span>
              {badge !== undefined && badge > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    item.badge === "blocking"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <p className="mb-3 mt-8 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Mon activité
      </p>
      <nav className="space-y-1">
        {TABS_NAV.map((item) => (
          <Link
            key={item.href}
            href={`${base}${item.href}`}
            className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive(item.href)
                ? "bg-white/10 font-medium text-zinc-100"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
