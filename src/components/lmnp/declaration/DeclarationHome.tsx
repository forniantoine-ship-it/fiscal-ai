"use client";

import { useRouter } from "next/navigation";
import { useLmnp } from "@/lib/lmnp/store";
import {
  isDocumentJourneyComplete,
  isDocumentJourneyStarted,
  resolveCurrentDocumentStep,
  resolveCurrentDocumentStepHref,
} from "@/lib/lmnp/engine/document-journey-progress";
import {
  PrimaryButton,
  QuietBadge,
  QuietInsight,
} from "@/components/lmnp/design-system";
import { DeclarationHowItWorks } from "./DeclarationHowItWorks";
import { DeclarationCompletedActions } from "./DeclarationCompletedActions";

const WS = (workspace: ReturnType<typeof useLmnp>["workspace"]) => ({
  fiscalYear: workspace.fiscalYear,
  properties: workspace.properties,
  documents: workspace.documents,
  extractions: workspace.extractions,
  validationItems: workspace.validationItems,
  ledgerEntries: workspace.ledgerEntries,
  declarationDraft: workspace.declarationDraft,
});

export function DeclarationHome() {
  const router = useRouter();
  const { workspace, dispatch } = useLmnp();
  const { declaration, fiscalYear } = workspace;
  const ws = WS(workspace);

  const completed = Boolean(fiscalYear.transmittedAt);
  const pending = workspace.pendingValidationCount;
  const base = `/app/exercices/${fiscalYear.id}`;
  const started = isDocumentJourneyStarted(ws);
  const docJourneyDone = isDocumentJourneyComplete(ws);

  const startJourney = () => {
    dispatch({ type: "START_DOCUMENT_JOURNEY" });
    router.push(`/app/exercices/${fiscalYear.id}/piece/inpi`);
  };

  if (completed) {
    return (
      <div className="mx-auto max-w-xl animate-fade-in px-4 py-16 sm:py-24">
        <header className="text-center">
          <QuietBadge tone="neutral">LMNP {fiscalYear.year}</QuietBadge>
          <h1
            className="mt-8 text-[1.75rem] font-normal leading-[1.25] text-stone-800 sm:text-[2rem]"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            Votre déclaration est transmise
          </h1>
          <p className="mx-auto mt-5 max-w-md text-[15px] text-stone-500">
            Merci — votre liasse a bien été envoyée.
          </p>
        </header>
        <DeclarationCompletedActions
          dashboardHref={base}
          documentsHref={`${base}/piece/inpi`}
        />
      </div>
    );
  }

  if (pending > 0) {
    return (
      <div className="mx-auto max-w-xl animate-fade-in px-4 py-16 sm:py-24">
        <header className="text-center">
          <QuietBadge tone="neutral">LMNP {fiscalYear.year}</QuietBadge>
          <h1 className="mt-8 text-2xl font-normal text-stone-800">
            {pending} montant{pending > 1 ? "s" : ""} à confirmer
          </h1>
          <p className="mt-4 text-[15px] text-stone-500">
            L’IA a pré-rempli votre dossier — une validation suffit.
          </p>
        </header>
        <div className="mt-12 flex justify-center">
          <PrimaryButton href={`${base}/validation`}>Confirmer les montants</PrimaryButton>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="mx-auto max-w-xl animate-fade-in px-4 py-16 sm:py-24">
        <header className="text-center">
          <QuietBadge tone="neutral">LMNP {fiscalYear.year}</QuietBadge>
          <h1
            className="mt-8 text-[1.65rem] font-normal leading-[1.3] text-stone-800 sm:text-[2rem]"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            Votre déclaration LMNP,
            <br />
            presque entièrement automatisée.
          </h1>
          <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-stone-500">
            Déposez simplement les documents demandés. L’IA extrait les informations, prépare
            votre déclaration et vous guide jusqu’à la transmission.
          </p>
        </header>

        <DeclarationHowItWorks />

        <div className="mt-14 flex justify-center">
          <PrimaryButton onClick={startJourney}>Commencer</PrimaryButton>
        </div>
      </div>
    );
  }

  const currentDocStep = resolveCurrentDocumentStep(ws);
  const resumeHref = resolveCurrentDocumentStepHref(fiscalYear.id, ws);

  return (
    <div className="mx-auto max-w-xl animate-fade-in px-4 py-16 sm:py-24">
      <header className="text-center">
        <QuietBadge tone="neutral">LMNP {fiscalYear.year}</QuietBadge>
        <h1 className="mt-8 text-2xl font-normal text-stone-800">Votre déclaration LMNP</h1>
        <p className="mt-4 text-[15px] text-stone-500">
          {docJourneyDone
            ? "Poursuivez les dernières étapes de votre dossier."
            : `Prochaine étape · ${currentDocStep.screenTitle}`}
        </p>
      </header>

      <div className="mt-12 flex justify-center">
        <PrimaryButton href={resumeHref}>
          {docJourneyDone ? declaration.nextAction.label : "Poursuivre"}
        </PrimaryButton>
      </div>

      {declaration.insights.length > 0 && (
        <ul className="mt-10 flex flex-col items-center gap-1.5">
          {declaration.insights.map((text) => (
            <li key={text}>
              <QuietInsight text={text} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
