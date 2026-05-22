"use client";

import { useLmnp } from "@/lib/lmnp/store";
import { DeclarationCompletedActions } from "@/components/lmnp/declaration/DeclarationCompletedActions";
import { PrimaryButton } from "@/components/lmnp/design-system";
import Link from "next/link";

export default function TeletransmissionPage() {
  const { workspace, dispatch } = useLmnp();
  const transmitted = Boolean(workspace.fiscalYear.transmittedAt);
  const base = `/app/exercices/${workspace.fiscalYear.id}`;

  return (
    <div className="mx-auto max-w-md animate-fade-in px-4 py-12 sm:py-16">
      <Link href={base} className="text-[12px] text-stone-400 hover:text-stone-600">
        ← Tableau de bord
      </Link>

      <h1 className="mt-10 text-2xl font-normal tracking-tight text-stone-800">
        Télétransmission
      </h1>

      <section className="mt-10">
        {!transmitted ? (
          <PrimaryButton
            onClick={() => dispatch({ type: "JOURNEY_MARK_TRANSMITTED" })}
            className="w-full"
          >
            Envoyer ma déclaration
          </PrimaryButton>
        ) : (
          <>
            <p className="text-center text-[15px] text-stone-600">
              Votre déclaration a bien été transmise.
            </p>
            <DeclarationCompletedActions
              dashboardHref={base}
              documentsHref={`${base}/documents`}
            />
          </>
        )}
      </section>
    </div>
  );
}
