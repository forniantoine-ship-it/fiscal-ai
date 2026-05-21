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
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          {assistant.headline}
        </h1>

        {assistant.insights.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {assistant.insights.map((i) => (
              <li
                key={i.id}
                className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500"
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
              className="w-full rounded-xl bg-accent py-4 text-sm font-medium text-accent-foreground shadow-sm shadow-stone-900/5 hover:opacity-90"
            >
              Générer
            </button>
          )}

          {generated && (
            <p className="text-center text-sm text-accent">✓ Liasse générée</p>
          )}
        </div>
      </div>
    </StepPageShell>
  );
}
