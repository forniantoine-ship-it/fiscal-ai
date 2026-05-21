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
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Liasse prête</h1>
        <p className="mt-2 text-sm text-zinc-600">Une étape pour transmettre.</p>

        <section className="mt-12 rounded-2xl border border-white/[0.05] px-6 py-8">
          <p className="text-center text-4xl font-semibold tabular-nums text-zinc-100">179 €</p>
          <p className="mt-1 text-center text-xs text-zinc-600">{workspace.fiscalYear.year}</p>

          {!paid ? (
            <button
              type="button"
              onClick={() => dispatch({ type: "JOURNEY_MARK_PAID" })}
              className="mt-8 flex w-full justify-center rounded-2xl bg-zinc-50 py-4 text-sm font-semibold text-zinc-950 hover:bg-white"
            >
              Payer
            </button>
          ) : (
            <Link
              href={`${base}/teletransmission`}
              className="mt-8 flex w-full justify-center rounded-2xl bg-zinc-50 py-4 text-sm font-semibold text-zinc-950"
            >
              Transmettre →
            </Link>
          )}
        </section>
      </div>
    </StepPageShell>
  );
}
