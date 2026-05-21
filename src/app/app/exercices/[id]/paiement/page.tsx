"use client";

import Link from "next/link";
import { StepPageShell } from "@/components/lmnp/journey/StepPageShell";
import { useLmnp } from "@/lib/lmnp/store";

export default function PaiementPage() {
  const { workspace, dispatch } = useLmnp();
  const paid = Boolean(workspace.fiscalYear.paidAt);
  const base = `/app/exercices/${workspace.fiscalYear.id}`;

  return (
    <StepPageShell hideNextCta>
      <div className="mx-auto max-w-md py-8">
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Liasse prête</h1>
        <p className="mt-2 text-sm text-stone-500">Une étape pour transmettre.</p>

        <section className="mt-12 rounded-2xl border border-stone-200 px-6 py-8">
          <p className="text-center text-4xl font-semibold tabular-nums text-stone-900">179 €</p>
          <p className="mt-1 text-center text-xs text-stone-500">{workspace.fiscalYear.year}</p>

          {!paid ? (
            <button
              type="button"
              onClick={() => dispatch({ type: "JOURNEY_MARK_PAID" })}
              className="mt-8 flex w-full justify-center rounded-xl bg-accent py-4 text-sm font-medium text-accent-foreground shadow-sm shadow-stone-900/5 hover:opacity-90"
            >
              Payer
            </button>
          ) : (
            <Link
              href={`${base}/teletransmission`}
              className="mt-8 flex w-full justify-center rounded-xl bg-accent py-4 text-sm font-medium text-accent-foreground shadow-sm shadow-stone-900/5"
            >
              Transmettre →
            </Link>
          )}
        </section>
      </div>
    </StepPageShell>
  );
}
