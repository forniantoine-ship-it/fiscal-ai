"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLmnp } from "@/lib/lmnp/store";

export function JourneySidebar() {
  const pathname = usePathname();
  const { workspace } = useLmnp();
  const { journey, fiscalYear } = workspace;
  const base = `/app/exercices/${fiscalYear.id}`;
  const routeSuffix = pathname.replace(base, "").replace(/^\//, "").split("/")[0] ?? "";

  return (
    <aside className="hidden w-52 shrink-0 border-r border-white/[0.04] bg-[#08080c]/90 p-5 lg:block">
      <Link
        href={base}
        className={`mb-6 block text-sm font-medium ${
          routeSuffix === "" ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        Tableau de bord
      </Link>

      <div className="mb-4 h-1 overflow-hidden rounded-full bg-white/[0.04]">
        <div
          className="h-full rounded-full bg-emerald-500/80 transition-all duration-700"
          style={{ width: `${journey.percentComplete}%` }}
        />
      </div>

      <nav className="space-y-0.5">
        {journey.steps.map((step) => {
          if (step.status === "locked") {
            return (
              <div
                key={step.id}
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-zinc-700"
              >
                <span className="w-3 text-center opacity-40">·</span>
                <span className="truncate">{step.title}</span>
              </div>
            );
          }

          const stepRoute = step.href.replace(base, "").replace(/^\//, "").split("/")[0] ?? "";
          const active = routeSuffix === stepRoute || step.id === journey.currentStepId;

          return (
            <Link
              key={step.id}
              href={step.href}
              className={`flex items-center gap-2 rounded-lg px-2 py-2 text-xs transition-colors ${
                active
                  ? "bg-white/[0.04] font-medium text-zinc-200"
                  : step.status === "completed"
                    ? "text-zinc-600 hover:text-zinc-400"
                    : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span className="w-3 shrink-0 text-center">
                {step.status === "completed" ? (
                  <span className="text-emerald-500">✓</span>
                ) : active ? (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                ) : (
                  step.stepNumber
                )}
              </span>
              <span className="truncate">{step.title}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
