"use client";

import { useLmnp } from "@/lib/lmnp/store";
import {
  PrimaryButton,
  QuietBadge,
  QuietInsight,
} from "@/components/lmnp/design-system";
import { DeclarationHowItWorks } from "./DeclarationHowItWorks";
import { DeclarationCompletedActions } from "./DeclarationCompletedActions";

function resolveHomeCopy(
  year: number,
  completed: boolean,
  pending: number,
): { title: string; subtitle: string } {
  if (completed) {
    return {
      title: "Votre déclaration est transmise",
      subtitle: "Merci — votre liasse a bien été envoyée.",
    };
  }
  if (pending > 0) {
    return {
      title: `${pending} montant${pending > 1 ? "s" : ""} à confirmer`,
      subtitle: "L’IA a pré-rempli votre dossier — une dernière validation suffit.",
    };
  }
  return {
    title: "Déposez vos documents.",
    subtitle: "L’IA prépare votre déclaration à partir de vos justificatifs.",
  };
}

function resolveCtaLabel(
  hasDocuments: boolean,
  pending: number,
  currentStepId: string,
): string {
  if (pending > 0) return "Confirmer les montants";
  if (!hasDocuments || currentStepId === "documents") return "Déposer mes documents";
  if (currentStepId === "paiement") return "Payer";
  if (currentStepId === "teletransmission") return "Transmettre";
  return "Poursuivre ma déclaration";
}

export function DeclarationHome() {
  const { workspace } = useLmnp();
  const { declaration, fiscalYear } = workspace;
  const { nextAction, insights, percentComplete, steps } = declaration;

  const completed = Boolean(fiscalYear.transmittedAt);
  const pending = workspace.pendingValidationCount;
  const hasDocuments = workspace.documents.length > 0;
  const { title, subtitle } = resolveHomeCopy(fiscalYear.year, completed, pending);
  const ctaLabel = resolveCtaLabel(hasDocuments, pending, declaration.currentStepId);
  const ctaHref =
    pending > 0
      ? `/app/exercices/${fiscalYear.id}/validation`
      : nextAction.href;

  const currentStep = steps.find((s) => s.status === "current");
  const showWhisperProgress = hasDocuments && !completed && percentComplete > 0;
  const base = `/app/exercices/${fiscalYear.id}`;

  return (
    <div className="mx-auto max-w-xl animate-fade-in px-4 py-16 sm:py-24">
      <header className="text-center">
        <QuietBadge tone="neutral">LMNP {fiscalYear.year}</QuietBadge>
        <h1
          className="mt-8 text-[1.75rem] font-normal leading-[1.25] tracking-tight text-stone-800 sm:text-[2rem]"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          {title}
        </h1>
        <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-stone-500">
          {subtitle}
        </p>
      </header>

      {completed && (
        <DeclarationCompletedActions
          dashboardHref={base}
          documentsHref={`${base}/documents`}
        />
      )}

      {!completed && (
        <>
          <DeclarationHowItWorks />

          <div className="mt-12 flex justify-center">
            <PrimaryButton href={ctaHref}>{ctaLabel}</PrimaryButton>
          </div>

          {insights.length > 0 && (
            <ul className="mt-10 flex flex-col items-center gap-1.5">
              {insights.map((text) => (
                <li key={text}>
                  <QuietInsight text={text} />
                </li>
              ))}
            </ul>
          )}

          {showWhisperProgress && (
            <footer className="mt-20 text-center">
              <div
                className="mx-auto h-px max-w-[8rem] overflow-hidden bg-stone-200/60"
                role="progressbar"
                aria-valuenow={percentComplete}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Avancement"
              >
                <div
                  className="h-full bg-stone-400/50 transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.max(percentComplete, 4)}%` }}
                />
              </div>
              {currentStep && (
                <p className="mt-4 text-[11px] text-stone-400">
                  Suite du parcours · {currentStep.title}
                </p>
              )}
            </footer>
          )}
        </>
      )}
    </div>
  );
}
