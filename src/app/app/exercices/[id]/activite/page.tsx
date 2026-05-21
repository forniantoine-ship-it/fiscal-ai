"use client";

import { TAB_COPY } from "@/lib/lmnp/constants/copilot-copy";
import { StepPageShell } from "@/components/lmnp/journey/StepPageShell";
import { LedgerTabView } from "@/components/lmnp/tabs/LedgerTabView";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";
import { useLmnp } from "@/lib/lmnp/store";

export default function ActivitePage() {
  const { workspace, dispatch } = useLmnp();

  return (
    <StepPageShell>
      <PageHeader title={TAB_COPY.activite.title} description={TAB_COPY.activite.description} />
      <div className="mb-6 rounded-xl border border-stone-200 bg-stone-100/80 p-5">
        <p className="text-sm font-medium text-stone-700">Une seule question</p>
        <p className="mt-1 text-xs text-stone-500">
          L’IA adapte tout le dossier selon votre choix — rien d’autre à configurer ici.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["reel", "micro-bic"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => dispatch({ type: "CONFIRM_REGIME", regime: r })}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                workspace.fiscalYear.regime === r
                  ? "bg-accent-muted text-accent ring-1 ring-accent/30"
                  : "bg-stone-100 text-stone-600 ring-1 ring-stone-200"
              }`}
            >
              {r === "reel" ? "Au réel" : "Micro-BIC"}
            </button>
          ))}
        </div>
        {workspace.fiscalYear.regimeConfirmedAt && (
          <p className="mt-2 text-xs text-accent">✓ Enregistré</p>
        )}
      </div>
      <LedgerTabView tab="activite" title={TAB_COPY.activite.title} description="" />
    </StepPageShell>
  );
}
