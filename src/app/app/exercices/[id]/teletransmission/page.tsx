"use client";

import { StepPageShell } from "@/components/lmnp/journey/StepPageShell";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";
import { useLmnp } from "@/lib/lmnp/store";

export default function TeletransmissionPage() {
  const { workspace, dispatch } = useLmnp();
  const transmitted = Boolean(workspace.fiscalYear.transmittedAt);

  return (
    <StepPageShell hideNextCta>
      <div className="mx-auto max-w-lg space-y-8">
        <PageHeader
          title="Télétransmettre votre déclaration"
          description="Envoi sécurisé vers les impôts — nous vérifions que tout est en ordre avant l’envoi."
        />

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
          <ul className="space-y-3 text-sm text-zinc-400">
            <li className="flex gap-2">
              <span className="text-emerald-400">✓</span>
              Documents analysés par l’IA
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-400">✓</span>
              Montants validés par vous
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-400">✓</span>
              Liasse générée et dossier réglé
            </li>
          </ul>

          {!transmitted ? (
            <button
              type="button"
              onClick={() => dispatch({ type: "JOURNEY_MARK_TRANSMITTED" })}
              className="mt-8 inline-flex w-full justify-center rounded-full bg-zinc-100 py-3 text-sm font-semibold text-zinc-950 hover:bg-white"
            >
              Télétransmettre maintenant
            </button>
          ) : (
            <p className="mt-8 text-center text-sm font-medium text-emerald-400">
              ✓ Déclaration transmise avec succès
            </p>
          )}
        </section>
      </div>
    </StepPageShell>
  );
}
