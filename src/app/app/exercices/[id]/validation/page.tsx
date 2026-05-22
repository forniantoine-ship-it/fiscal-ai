"use client";

import Link from "next/link";
import { ValidationInbox } from "@/components/lmnp/validation/ValidationInbox";
import { PrimaryButton } from "@/components/lmnp/design-system";
import { useLmnp } from "@/lib/lmnp/store";

export default function ValidationPage() {
  const { workspace, dispatch } = useLmnp();
  const base = `/app/exercices/${workspace.fiscalYear.id}`;
  const pending = workspace.pendingValidationCount;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
      <Link href={base} className="text-[12px] text-stone-400 hover:text-stone-600">
        ← Déclaration
      </Link>
      <header className="mt-10">
        <h1 className="text-2xl font-normal text-stone-800">À confirmer</h1>
        <p className="mt-2 text-[15px] text-stone-500">
          {pending > 0
            ? `${pending} montant${pending > 1 ? "s" : ""} identifié${pending > 1 ? "s" : ""} par l’IA`
            : "Tout est confirmé"}
        </p>
      </header>
      <div className="mt-10">
        <ValidationInbox />
      </div>
      {pending === 0 && !workspace.fiscalYear.declarationGeneratedAt && (
        <div className="mt-12 text-center">
          <PrimaryButton
            onClick={() => dispatch({ type: "JOURNEY_MARK_DECLARATION_GENERATED" })}
          >
            Générer la liasse
          </PrimaryButton>
        </div>
      )}
      {workspace.fiscalYear.declarationGeneratedAt && (
        <p className="mt-8 text-center text-sm text-accent">✓ Liasse générée</p>
      )}
    </div>
  );
}
