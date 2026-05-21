"use client";

import { StepPageShell } from "@/components/lmnp/journey/StepPageShell";
import { useLmnp } from "@/lib/lmnp/store";

export default function TeletransmissionPage() {
  const { workspace, dispatch } = useLmnp();
  const transmitted = Boolean(workspace.fiscalYear.transmittedAt);

  return (
    <StepPageShell hideNextCta>
      <div className="mx-auto max-w-md py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Transmettre</h1>

        <section className="mt-10 rounded-2xl border border-stone-200 px-6 py-8">
          {!transmitted ? (
            <button
              type="button"
              onClick={() => dispatch({ type: "JOURNEY_MARK_TRANSMITTED" })}
              className="flex w-full justify-center rounded-xl bg-accent py-4 text-sm font-medium text-accent-foreground shadow-sm shadow-stone-900/5 hover:opacity-90"
            >
              Envoyer
            </button>
          ) : (
            <p className="text-center text-sm text-accent">✓ Transmis</p>
          )}
        </section>
      </div>
    </StepPageShell>
  );
}
