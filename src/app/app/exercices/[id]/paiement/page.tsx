"use client";

import { StepPageShell } from "@/components/lmnp/journey/StepPageShell";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";
import { useLmnp } from "@/lib/lmnp/store";

export default function PaiementPage() {
  const { workspace, dispatch } = useLmnp();
  const paid = Boolean(workspace.fiscalYear.paidAt);

  return (
    <StepPageShell hideNextCta>
      <div className="mx-auto max-w-lg space-y-8">
        <PageHeader
          title="Régler votre dossier"
          description="Débloquez la télétransmission en finalisant votre offre. Paiement sécurisé."
        />

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <p className="text-3xl font-bold tabular-nums text-zinc-100">179 €</p>
          <p className="mt-2 text-sm text-zinc-500">
            Exercice {workspace.fiscalYear.year} · Assistant LMNP complet
          </p>
          <p className="mt-4 text-xs text-zinc-600">
            Paiement sécurisé (démo — intégration Stripe à venir)
          </p>

          {!paid ? (
            <button
              type="button"
              onClick={() => dispatch({ type: "JOURNEY_MARK_PAID" })}
              className="mt-8 inline-flex w-full justify-center rounded-full bg-zinc-100 py-3 text-sm font-semibold text-zinc-950 hover:bg-white"
            >
              Procéder au paiement
            </button>
          ) : (
            <p className="mt-8 text-sm font-medium text-emerald-400">✓ Paiement enregistré</p>
          )}
        </section>
      </div>
    </StepPageShell>
  );
}
