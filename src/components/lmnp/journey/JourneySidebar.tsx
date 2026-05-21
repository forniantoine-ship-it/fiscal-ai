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
    <aside className="w-60 shrink-0 border-r border-white/5 bg-[#0a0a0f]/80 p-4">
      <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
        Votre parcours
      </p>
      <p className="mb-4 px-2 text-xs text-zinc-500">
        {journey.percentComplete} % · étape {journey.currentStepIndex}/{journey.totalSteps}
      </p>

      <nav className="space-y-0.5">
        {journey.steps.map((step) => {
          const stepRoute = step.href.replace(base, "").replace(/^\//, "").split("/")[0] ?? "";
          const active =
            routeSuffix === stepRoute ||
            (step.id === journey.currentStepId && routeSuffix === "");

          if (step.status === "locked") {
            return (
              <div
                key={step.id}
                className="flex cursor-not-allowed items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-600"
                title="Complétez les étapes précédentes."
              >
                <span className="text-[10px]">🔒</span>
                <span className="truncate">{step.title}</span>
              </div>
            );
          }

          return (
            <Link
              key={step.id}
              href={step.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                active || step.id === journey.currentStepId
                  ? "bg-emerald-500/15 font-medium text-emerald-400"
                  : step.status === "completed"
                    ? "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              }`}
            >
              <span className="w-4 shrink-0 text-center text-[10px]">
                {step.status === "completed" ? "✓" : step.stepNumber}
              </span>
              <span className="truncate">{step.title}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 border-t border-white/5 pt-4">
        <Link
          href={base}
          className={`block rounded-lg px-3 py-2 text-sm ${
            routeSuffix === ""
              ? "font-medium text-emerald-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Tableau de bord
        </Link>
      </div>
    </aside>
  );
}
