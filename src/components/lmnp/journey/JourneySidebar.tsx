"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLmnp } from "@/lib/lmnp/store";
import type { JourneyStepView } from "@/lib/lmnp/types";

export function JourneySidebar() {
  const pathname = usePathname();
  const { workspace } = useLmnp();
  const { journey, fiscalYear } = workspace;
  const base = `/app/exercices/${fiscalYear.id}`;
  const routeSuffix = pathname.replace(base, "").replace(/^\//, "").split("/")[0] ?? "";
  const isDashboard = routeSuffix === "";

  return (
    <aside className="hidden w-44 shrink-0 border-r border-stone-200/70 px-5 py-8 lg:block">
      <Link
        href={base}
        className={`mb-8 block text-[11px] tracking-wide transition-colors ${
          isDashboard ? "text-stone-500" : "text-stone-400 hover:text-stone-500"
        }`}
      >
        Tableau de bord
      </Link>

      <div className="mb-6">
        <div className="flex items-baseline justify-between text-[10px] text-stone-400">
          <span>Progression</span>
          <span className="tabular-nums">{journey.percentComplete}%</span>
        </div>
        <div className="mt-2 h-px overflow-hidden bg-stone-100">
          <div
            className="h-full bg-stone-300 transition-[width] duration-700 ease-out"
            style={{ width: `${journey.percentComplete}%` }}
          />
        </div>
      </div>

      <nav className="space-y-px" aria-label="Étapes du parcours">
        {journey.steps.map((step) => (
          <SidebarStep key={step.id} step={step} base={base} routeSuffix={routeSuffix} />
        ))}
      </nav>
    </aside>
  );
}

function SidebarStep({
  step,
  base,
  routeSuffix,
}: {
  step: JourneyStepView;
  base: string;
  routeSuffix: string;
}) {
  const stepRoute = step.href.replace(base, "").replace(/^\//, "").split("/")[0] ?? "";
  const active = step.status === "active" || routeSuffix === stepRoute;

  if (step.status === "locked") {
    return (
      <div className="flex items-center gap-2.5 py-2 pl-0.5 text-[11px] text-stone-400">
        <StepMarker step={step} active={false} />
        <span className="truncate">{step.title}</span>
      </div>
    );
  }

  return (
    <Link
      href={step.href}
      className={`group flex items-center gap-2.5 rounded-md py-2 pl-0.5 pr-1 text-[11px] transition-colors ${
        active
          ? "text-stone-600"
          : step.status === "completed"
            ? "text-stone-400 hover:text-stone-500"
            : "text-stone-500 hover:text-stone-500"
      }`}
    >
      <StepMarker step={step} active={active} />
      <span className="truncate">{step.title}</span>
    </Link>
  );
}

function StepMarker({ step, active }: { step: JourneyStepView; active: boolean }) {
  if (step.status === "completed") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-stone-500">
        ✓
      </span>
    );
  }

  if (active) {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        <span className="h-1 w-1 rounded-full bg-stone-400" />
      </span>
    );
  }

  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[10px] tabular-nums text-stone-400">
      {step.stepNumber}
    </span>
  );
}
