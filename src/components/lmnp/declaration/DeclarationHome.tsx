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
  LightCard,
  PrimaryButton,
  QuietBadge,
  QuietInsight,
} from "@/components/lmnp/design-system";
import { formatNormalizedValue } from "@/lib/lmnp/validation/display";
import { DeclarationHowItWorks } from "./DeclarationHowItWorks";
import { DeclarationCompletedActions } from "./DeclarationCompletedActions";

const serif = { fontFamily: "var(--font-display), Georgia, serif" } as const;

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
    const pendingItems = workspace.validationItems.filter((v) => v.status === "pending");
    const handledCount = workspace.validationItems.filter(
      (v) => v.status === "approved" || v.status === "corrected",
    ).length;
    const analyzedDocs = workspace.documents.filter((d) => d.status === "analyzed").length;
    const previewItems = pendingItems.slice(0, 4);
    const remainingPreview = pendingItems.length - previewItems.length;
    const progressPercent = declaration.percentComplete;

    return (
      <div className="mx-auto max-w-3xl animate-fade-in px-4 py-12 sm:px-6 sm:py-16">
        <header className="border-b border-stone-200/50 pb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <QuietBadge tone="neutral">LMNP {fiscalYear.year}</QuietBadge>
              <h1
                className="mt-4 text-[1.65rem] font-normal leading-tight text-stone-800 sm:text-[2rem]"
                style={serif}
              >
                Votre dossier est prêt
              </h1>
              <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-stone-500">
                La partie comptable est déjà traitée — il ne reste que{" "}
                <span className="font-medium text-stone-700">
                  {pending} confirmation{pending > 1 ? "s" : ""}
                </span>{" "}
                avant la génération de la liasse.
              </p>
            </div>
            <div className="rounded-2xl bg-[#f0ebe4]/80 px-4 py-3 ring-1 ring-stone-200/40">
              <p className="text-[11px] uppercase tracking-wide text-stone-400">Avancement</p>
              <p className="mt-1 text-2xl font-medium tabular-nums text-stone-800">
                {progressPercent}%
              </p>
            </div>
          </div>
          <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-stone-200/60">
            <div
              className="h-full rounded-full bg-[#c9b8a8] transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "Documents analysés",
              value: String(analyzedDocs),
              hint: "Pièces lues et classées",
            },
            {
              label: "Montants préparés",
              value: String(handledCount + pending),
              hint: "Extraits et structurés",
            },
            {
              label: "À confirmer",
              value: String(pending),
              hint: "Validation rapide",
            },
          ].map((stat) => (
            <LightCard key={stat.label} className="!px-5 !py-4">
              <p className="text-[11px] uppercase tracking-wide text-stone-400">{stat.label}</p>
              <p className="mt-2 text-[1.75rem] font-medium tabular-nums leading-none text-stone-800">
                {stat.value}
              </p>
              <p className="mt-2 text-[12px] text-stone-500">{stat.hint}</p>
            </LightCard>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_minmax(0,15rem)]">
          <LightCard className="!p-0 overflow-hidden">
            <div className="border-b border-stone-100/80 bg-[#faf8f5] px-6 py-4">
              <h2 className="text-[15px] font-medium text-stone-800">Montants à confirmer</h2>
              <p className="mt-1 text-[13px] text-stone-500">
                Pré-remplis à partir de vos documents — vérifiez et validez.
              </p>
            </div>
            <ul className="divide-y divide-stone-100/80">
              {previewItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-stone-50/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-stone-700">{item.label}</p>
                    {item.documentFileName ? (
                      <p className="mt-0.5 truncate text-[12px] text-stone-400">
                        {item.documentFileName}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[14px] tabular-nums font-medium text-stone-800">
                      {formatNormalizedValue(item.proposedValue)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-stone-400">{item.confidence}% confiance</p>
                  </div>
                </li>
              ))}
            </ul>
            {remainingPreview > 0 ? (
              <p className="border-t border-stone-100/80 px-6 py-3 text-[12px] text-stone-500">
                + {remainingPreview} autre{remainingPreview > 1 ? "s" : ""} montant
                {remainingPreview > 1 ? "s" : ""} sur la page de validation
              </p>
            ) : null}
          </LightCard>

          <div className="flex flex-col gap-4">
            <LightCard className="!py-5">
              <p className="text-[12px] font-medium text-stone-700">Déjà pris en charge</p>
              <ul className="mt-4 space-y-3">
                {[
                  "Extraction des montants",
                  "Classement comptable",
                  "Structure de la liasse",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-[13px] text-stone-600">
                    <span
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-stone-400"
                      aria-hidden
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </LightCard>
            {declaration.insights.length > 0 ? (
              <ul className="space-y-2">
                {declaration.insights.map((text) => (
                  <li key={text}>
                    <QuietInsight text={text} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <LightCard className="mt-8 !bg-[#f7f4ef]/60 !px-6 !py-6 sm:!px-8 sm:!py-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[15px] font-medium text-stone-800">
                Confirmez vos montants pour finaliser
              </p>
              <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-stone-500">
                Quelques secondes par ligne — ensuite, la déclaration pourra être générée et
                transmise.
              </p>
            </div>
            <PrimaryButton href={`${base}/validation`} className="shrink-0 sm:!px-8">
              Confirmer les montants
            </PrimaryButton>
          </div>
        </LightCard>
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
