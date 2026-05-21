"use client";

import { StepPageShell } from "@/components/lmnp/journey/StepPageShell";
import { useLmnp } from "@/lib/lmnp/store";

export default function TeletransmissionPage() {
  const { workspace, dispatch } = useLmnp();
  const transmitted = Boolean(workspace.fiscalYear.transmittedAt);

  return (
    <StepPageShell hideNextCta>
      <div className="mx-auto max-w-md py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Transmettre</h1>

        <section className="mt-10 rounded-2xl border border-white/[0.05] px-6 py-8">
          {!transmitted ? (
            <button
              type="button"
              onClick={() => dispatch({ type: "JOURNEY_MARK_TRANSMITTED" })}
              className="flex w-full justify-center rounded-2xl bg-zinc-50 py-4 text-sm font-semibold text-zinc-950 hover:bg-white"
            >
              Envoyer
            </button>
          ) : (
            <p className="text-center text-sm text-emerald-400/80">✓ Transmis</p>
          )}
        </section>
      </div>
    </StepPageShell>
  );
}
