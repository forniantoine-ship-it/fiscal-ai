"use client";

import { StepPageShell } from "@/components/lmnp/journey/StepPageShell";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";
import { ValidationInbox } from "@/components/lmnp/validation/ValidationInbox";
import { useLmnp } from "@/lib/lmnp/store";

export default function ValidationPage() {
  const { workspace, dispatch } = useLmnp();
  const { canClose, fiscalYear, pendingValidationCount } = workspace;
  const generated = Boolean(fiscalYear.declarationGeneratedAt);

  return (
    <StepPageShell hideNextCta={!canClose && pendingValidationCount > 0}>
      <div className="mx-auto max-w-3xl space-y-8">
        <PageHeader
          title={
            generated
              ? "Déclaration générée"
              : pendingValidationCount > 0
                ? "Vérifiez les montants détectés par l’IA"
                : "Générer ma déclaration"
          }
          description={
            generated
              ? "Votre liasse est prête. Passez au paiement pour télétransmettre."
              : pendingValidationCount > 0
                ? "L’IA a tout pré-rempli — confirmez ou corrigez chaque montant en un clic."
                : "Récapitulatif des montants validés, prêts pour votre déclaration LMNP."
          }
        />

        {!generated && <ValidationInbox />}

        {canClose && !generated && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-6 text-center">
            <p className="text-sm text-zinc-400">
              Tout est validé — l’IA a terminé le pré-remplissage de votre dossier.
            </p>
            <button
              type="button"
              onClick={() => dispatch({ type: "JOURNEY_MARK_DECLARATION_GENERATED" })}
              className="mt-4 inline-flex rounded-full bg-zinc-100 px-6 py-3 text-sm font-semibold text-zinc-950 hover:bg-white"
            >
              Générer ma déclaration →
            </button>
          </div>
        )}

        {generated && (
          <p className="text-center text-sm text-emerald-400/90">
            ✓ Liasse générée — continuez vers le paiement depuis le tableau de bord.
          </p>
        )}
      </div>
    </StepPageShell>
  );
}
