"use client";

import { useLmnp } from "@/lib/lmnp/store";
import { DOCUMENT_JOURNEY_STEPS } from "@/lib/lmnp/constants/document-journey";
import {
  isDocumentJourneyComplete,
  resolveCurrentDocumentStep,
  documentJourneyStepHref,
  getDocumentJourneyProgress,
} from "@/lib/lmnp/engine/document-journey-progress";
import {
  PrimaryButton,
  QuietBadge,
  QuietInsight,
} from "@/components/lmnp/design-system";
import { DeclarationCompletedActions } from "./DeclarationCompletedActions";

export function DeclarationHome() {
  const { workspace } = useLmnp();
  const { declaration, fiscalYear } = workspace;

  const completed = Boolean(fiscalYear.transmittedAt);
  const pending = workspace.pendingValidationCount;
  const base = `/app/exercices/${fiscalYear.id}`;

  const docJourneyDone = isDocumentJourneyComplete({
    fiscalYear: workspace.fiscalYear,
    properties: workspace.properties,
    documents: workspace.documents,
    extractions: workspace.extractions,
    validationItems: workspace.validationItems,
    ledgerEntries: workspace.ledgerEntries,
    declarationDraft: workspace.declarationDraft,
  });

  const docProgress = getDocumentJourneyProgress({
    fiscalYear: workspace.fiscalYear,
    properties: workspace.properties,
    documents: workspace.documents,
    extractions: workspace.extractions,
    validationItems: workspace.validationItems,
    ledgerEntries: workspace.ledgerEntries,
    declarationDraft: workspace.declarationDraft,
  });

  const currentDocStep = resolveCurrentDocumentStep({
    fiscalYear: workspace.fiscalYear,
    properties: workspace.properties,
    documents: workspace.documents,
    extractions: workspace.extractions,
    validationItems: workspace.validationItems,
    ledgerEntries: workspace.ledgerEntries,
    declarationDraft: workspace.declarationDraft,
  });

  let title = "Votre déclaration LMNP";
  let subtitle = "Le système vous guide pièce par pièce.";
  let ctaLabel = "Commencer";
  let ctaHref = documentJourneyStepHref(fiscalYear.id, currentDocStep.id);

  if (completed) {
    title = "Votre déclaration est transmise";
    subtitle = "Merci — votre liasse a bien été envoyée.";
  } else if (pending > 0) {
    title = `${pending} montant${pending > 1 ? "s" : ""} à confirmer`;
    subtitle = "L’IA a pré-rempli votre dossier — une validation suffit.";
    ctaLabel = "Confirmer les montants";
    ctaHref = `${base}/validation`;
  } else if (!docJourneyDone) {
    title = currentDocStep.screenTitle;
    subtitle = currentDocStep.explanation;
    ctaLabel = currentDocStep.ctaLabel;
    ctaHref = documentJourneyStepHref(fiscalYear.id, currentDocStep.id);
  } else {
    title = declaration.nextAction.headline;
    subtitle = "Poursuivez les dernières étapes de votre dossier.";
    ctaLabel = declaration.nextAction.label;
    ctaHref = declaration.nextAction.href;
  }

  const insights = docJourneyDone ? declaration.insights : [];

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
          documentsHref={documentJourneyStepHref(fiscalYear.id, "inpi")}
        />
      )}

      {!completed && (
        <>
          {!docJourneyDone && (
            <p className="mx-auto mt-8 max-w-sm text-center text-[12px] text-stone-400">
              Parcours documentaire · {docProgress.completed} sur {DOCUMENT_JOURNEY_STEPS.length}{" "}
              pièces
            </p>
          )}

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
        </>
      )}
    </div>
  );
}
