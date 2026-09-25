"use client";

import type { ReactNode } from "react";

import { useLab, useScenario } from "./context";
import type { ScenarioId } from "./model";
import { SCENARIOS } from "./scenarios";
import { type Screen, navigate, routeHash } from "./store";
import { Icon, serif } from "./ui";

export function LabBar({ scenario }: { scenario: ScenarioId | null }) {
  const { dispatch, notify } = useLab();
  return (
    <div className="bg-[var(--o-ink)] text-[12px] text-[#E8E2D9]">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 md:px-8">
        <p className="flex min-w-0 items-center gap-2">
          <span className="rounded-full bg-[var(--o-accent)] px-2 py-px text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white">Lab</span>
          <span className="truncate">
            Prototype UX isolé · données fictives
            {scenario && <span className="hidden sm:inline"> · Scénario {scenario.toUpperCase()} — {SCENARIOS[scenario].label}</span>}
          </span>
        </p>
        <div className="flex items-center gap-4">
          <a href="#/" className="underline-offset-4 hover:underline">
            Scénarios
          </a>
          {scenario && (
            <button
              type="button"
              className="underline-offset-4 hover:underline"
              onClick={() => {
                dispatch({ type: "reset", s: scenario });
                navigate(routeHash({ scenario, screen: "start" }));
                notify("Scénario réinitialisé.");
              }}
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const NAV: { screen: Screen; label: string }[] = [
  { screen: "dossier", label: "Dossier" },
  { screen: "resultat", label: "Résultat" },
  { screen: "documents", label: "Documents" },
];

export function AppHeader({ s }: { s: ScenarioId }) {
  const { def, state, progress, route, go } = useScenario(s);
  const ready = state.phase === "ready";
  const active = route.screen === "points" ? "dossier" : route.screen === "liasse" ? "resultat" : route.screen;
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--o-line-soft)] bg-[rgba(250,248,245,0.86)] backdrop-blur-md">
      <div className="mx-auto flex h-[60px] max-w-[1180px] items-center justify-between gap-3 px-4 md:h-[68px] md:px-8">
        <a href="#/" className="flex shrink-0 items-center gap-2.5" aria-label="Fiscal AI — retour aux scénarios">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[image:var(--o-cta)] text-[15px] font-semibold text-white">F</span>
          <span className={`${serif} hidden text-[20px] text-[var(--o-ink)] sm:inline`}>Fiscal AI</span>
        </a>
        {ready && (
          <nav aria-label="Navigation du dossier" className="flex items-center gap-0.5 rounded-full bg-[var(--o-sand)] p-1">
            {NAV.map((item) => (
              <button
                key={item.screen}
                type="button"
                onClick={() => go(item.screen)}
                aria-current={active === item.screen ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition md:px-4 md:text-[14px] ${
                  active === item.screen ? "bg-[var(--o-surface)] text-[var(--o-ink)] shadow-[0_1px_3px_rgba(28,25,23,0.08)]" : "text-[var(--o-ink-3)] hover:text-[var(--o-ink)]"
                }`}
              >
                {item.label}
                {item.screen === "dossier" && progress.blockingOpen.length > 0 && (
                  <span className="ml-1.5 inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--o-accent)] px-1 text-[11px] font-semibold text-white" aria-label={`${progress.blockingOpen.length} points à traiter`}>
                    {progress.blockingOpen.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        )}
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden rounded-full border border-[var(--o-line)] px-3 py-1 text-[13px] text-[var(--o-ink-2)] md:inline">Exercice {def.year}</span>
          <span className="hidden h-9 w-9 place-items-center rounded-full bg-[var(--o-accent-soft-2)] sm:grid text-[12px] font-semibold text-[var(--o-accent-strong)]" aria-label={`Compte de ${def.firstName}`}>
            {def.initials}
          </span>
        </div>
      </div>
    </header>
  );
}

export function MobileBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--o-line-soft)] bg-[rgba(250,248,245,0.94)] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md md:hidden">
      {children}
    </div>
  );
}

export function PageTitle({ eyebrow, title, lead }: { eyebrow: string; title: ReactNode; lead?: ReactNode }) {
  return (
    <div className="max-w-[720px]">
      <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--o-accent-text)]">{eyebrow}</p>
      <h1 className={`${serif} mt-2 text-[32px] leading-[1.08] text-[var(--o-ink)] md:text-[44px]`}>{title}</h1>
      {lead && <p className="mt-3 text-[16px] leading-7 text-[var(--o-ink-2)] md:text-[17px]">{lead}</p>}
    </div>
  );
}

export function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 text-[14px] font-medium text-[var(--o-ink-2)] hover:text-[var(--o-ink)]">
      <Icon name="back" />
      {label}
    </button>
  );
}
