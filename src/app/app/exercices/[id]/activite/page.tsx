"use client";

import { LedgerTabView } from "@/components/lmnp/tabs/LedgerTabView";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";
import { useLmnp } from "@/lib/lmnp/store";

export default function ActivitePage() {
  const { workspace, dispatch } = useLmnp();

  return (
    <div>
      <PageHeader
        title="Activité"
        description="Votre situation LMNP et le régime fiscal choisi."
      />
      <div className="mb-6 glass rounded-xl p-5">
        <p className="text-sm font-medium text-zinc-300">Régime fiscal</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["reel", "micro-bic"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => dispatch({ type: "CONFIRM_REGIME", regime: r })}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                workspace.fiscalYear.regime === r
                  ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40"
                  : "bg-white/5 text-zinc-400 ring-1 ring-white/10"
              }`}
            >
              {r === "reel" ? "Régime réel" : "Micro-BIC"}
            </button>
          ))}
        </div>
        {workspace.fiscalYear.regimeConfirmedAt && (
          <p className="mt-2 text-xs text-emerald-400/80">Régime confirmé par vous</p>
        )}
      </div>
      <LedgerTabView
        tab="activite"
        title="Activité"
        description=""
      />
    </div>
  );
}
