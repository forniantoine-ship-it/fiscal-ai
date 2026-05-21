"use client";

import { StepPageShell } from "@/components/lmnp/journey/StepPageShell";
import { ValidationInbox } from "@/components/lmnp/validation/ValidationInbox";
import { useLmnp } from "@/lib/lmnp/store";

export default function ValidationPage() {
  const { workspace, dispatch } = useLmnp();
  const { canClose, fiscalYear, pendingValidationCount, assistant } = workspace;
  const generated = Boolean(fiscalYear.declarationGeneratedAt);

  return (
    <StepPageShell hideNextCta={pendingValidationCount > 0}>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
          {assistant.headline}
        </h1>

        {assistant.insights.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {assistant.insights.map((i) => (
              <li
                key={i.id}
                className="rounded-full bg-white/[0.04] px-2.5 py-0.5 text-xs text-zinc-500"
              >
                {i.text}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-10">
          {!generated && pendingValidationCount > 0 && <ValidationInbox />}

          {canClose && !generated && pendingValidationCount === 0 && (
            <button
              type="button"
              onClick={() => dispatch({ type: "JOURNEY_MARK_DECLARATION_GENERATED" })}
              className="w-full rounded-2xl bg-zinc-50 py-4 text-sm font-semibold text-zinc-950 hover:bg-white"
            >
              Générer
            </button>
          )}

          {generated && (
            <p className="text-center text-sm text-emerald-400/80">✓ Liasse générée</p>
          )}
        </div>
      </div>
    </StepPageShell>
  );
}
