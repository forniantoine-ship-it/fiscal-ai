"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TAB_COPY } from "@/lib/lmnp/constants/copilot-copy";
import { useLmnp } from "@/lib/lmnp/store";

const NAV_ITEMS = [
  { href: "", label: "Tableau de bord", exact: true },
  { href: "/documents", label: "Mes documents" },
  { href: "/alertes", label: "À clarifier", badge: "blocking" as const },
  { href: "/activite", label: TAB_COPY.activite.sidebar },
  { href: "/recettes", label: TAB_COPY.recettes.sidebar, badge: "pending" as const },
  { href: "/depenses", label: TAB_COPY.depenses.sidebar },
  { href: "/immobilisations", label: TAB_COPY.immobilisations.sidebar },
  { href: "/emprunts", label: TAB_COPY.emprunts.sidebar },
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
      <nav className="space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, item.exact);
          let badge: number | undefined;
          if (item.badge === "blocking") badge = blocking;
          if (item.badge === "pending") badge = pending;

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
    </aside>
  );
}
