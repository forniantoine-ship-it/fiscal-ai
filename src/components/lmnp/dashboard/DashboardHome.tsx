"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { ProgressBar } from "@/design-system/components/ProgressBar";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { DeclarationHowItWorks } from "@/components/lmnp/declaration/DeclarationHowItWorks";
import { formatNormalizedValue } from "@/lib/lmnp/validation/display";
import {
  isDocumentJourneyComplete,
  isDocumentJourneyStarted,
  resolveCurrentDocumentStep,
  resolveCurrentDocumentStepHref,
} from "@/lib/lmnp/engine/document-journey-progress";
import { LMNP_ROUTES, toFlatLmnpRoute } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";

function YearBadge({ year }: { year: number }) {
  return (
    <span
      style={{
        ...typography.caption.desktop,
        color: colors.text.tertiary,
        letterSpacing: typography.letterSpacing.label,
        padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
        borderRadius: radius.full,
        backgroundColor: colors.surface.secondary,
      }}
    >
      Déclaration LMNP {year}
    </span>
  );
}

export function DashboardHome() {
  const router = useRouter();
  const { workspace, dispatch } = useLmnp();
  const { declaration, fiscalYear } = workspace;

  const completed = Boolean(fiscalYear.transmittedAt);
  const pending = workspace.pendingValidationCount;
  const started = isDocumentJourneyStarted({
    fiscalYear: workspace.fiscalYear,
    properties: workspace.properties,
    documents: workspace.documents,
    extractions: workspace.extractions,
    validationItems: workspace.validationItems,
    ledgerEntries: workspace.ledgerEntries,
    declarationDraft: workspace.declarationDraft,
  });
  const docJourneyDone = isDocumentJourneyComplete({
    fiscalYear: workspace.fiscalYear,
    properties: workspace.properties,
    documents: workspace.documents,
    extractions: workspace.extractions,
    validationItems: workspace.validationItems,
    ledgerEntries: workspace.ledgerEntries,
    declarationDraft: workspace.declarationDraft,
  });

  const ws = {
    fiscalYear: workspace.fiscalYear,
    properties: workspace.properties,
    documents: workspace.documents,
    extractions: workspace.extractions,
    validationItems: workspace.validationItems,
    ledgerEntries: workspace.ledgerEntries,
    declarationDraft: workspace.declarationDraft,
  };

  const startJourney = () => {
    dispatch({ type: "START_DOCUMENT_JOURNEY" });
    router.push(LMNP_ROUTES.documents);
  };

  const nextHref = toFlatLmnpRoute(declaration.nextAction.href);

  if (completed) {
    return (
      <div className="mx-auto max-w-xl">
        <header className="text-center">
          <YearBadge year={fiscalYear.year} />
          <h1
            className="mt-6 text-3xl"
            style={{
              fontFamily: typography.fontFamily.display,
              fontWeight: typography.fontWeight.regular,
              color: colors.text.primary,
            }}
          >
            Votre déclaration est transmise
          </h1>
          <p className="mt-4" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Merci — votre liasse a bien été envoyée.
          </p>
        </header>
        <div className="mt-10 flex justify-center">
          <Button href={LMNP_ROUTES.documents} variant="secondary">
            Consulter mes documents
          </Button>
        </div>
      </div>
    );
  }

  if (pending > 0) {
    const pendingItems = workspace.validationItems.filter((v) => v.status === "pending");
    const previewItems = pendingItems.slice(0, 4);

    return (
      <div className="mx-auto max-w-3xl">
        <header>
          <YearBadge year={fiscalYear.year} />
          <h1
            className="mt-4 text-3xl sm:text-4xl"
            style={{
              fontFamily: typography.fontFamily.display,
              fontWeight: typography.fontWeight.regular,
              color: colors.text.primary,
            }}
          >
            Votre dossier est prêt
          </h1>
          <p className="mt-3 max-w-lg" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Il reste {pending} confirmation{pending > 1 ? "s" : ""} avant la génération de la liasse.
          </p>
          <div className="mt-6">
            <ProgressBar value={declaration.percentComplete} label="Avancement global" />
          </div>
        </header>

        <Card className="mt-8 !p-0 overflow-hidden" variant="muted">
          <div className="border-b px-6 py-4" style={{ borderColor: colors.border.subtle }}>
            <h2 style={{ ...typography.cardTitle.desktop, color: colors.text.primary }}>
              Montants à confirmer
            </h2>
          </div>
          <ul>
            {previewItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-4 px-6 py-4"
                style={{ borderBottom: `1px solid ${colors.border.subtle}` }}
              >
                <div className="min-w-0">
                  <p style={{ ...typography.body.desktop, color: colors.text.primary }}>{item.label}</p>
                  {item.documentFileName ? (
                    <p className="truncate" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                      {item.documentFileName}
                    </p>
                  ) : null}
                </div>
                <p style={{ ...typography.body.desktop, color: colors.text.primary }}>
                  {formatNormalizedValue(item.proposedValue)}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <div className="mt-8 flex justify-end">
          <Button href={LMNP_ROUTES.declarations}>{declaration.nextAction.label}</Button>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <YearBadge year={fiscalYear.year} />
        <h1
          className="mt-6 text-3xl sm:text-4xl"
          style={{
            fontFamily: typography.fontFamily.display,
            fontWeight: typography.fontWeight.regular,
            color: colors.text.primary,
          }}
        >
          Préparez votre déclaration LMNP simplement
        </h1>
        <p className="mx-auto mt-4 max-w-md" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Déposez vos documents. L&apos;IA extrait les informations, prépare votre déclaration et vous
          guide jusqu&apos;à la transmission.
        </p>
        <DeclarationHowItWorks />
        <div className="mt-10">
          <Button onClick={startJourney}>Commencer</Button>
        </div>
      </div>
    );
  }

  const currentDocStep = resolveCurrentDocumentStep(ws);
  const resumeHref = resolveCurrentDocumentStepHref(fiscalYear.id, ws);

  return (
    <div className="mx-auto max-w-xl text-center">
      <YearBadge year={fiscalYear.year} />
      <h1
        className="mt-6 text-3xl"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          color: colors.text.primary,
        }}
      >
        Votre déclaration LMNP
      </h1>
      <p className="mt-4" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
        {docJourneyDone
          ? "Poursuivez les dernières étapes de votre dossier."
          : `Prochaine étape · ${currentDocStep.screenTitle}`}
      </p>
      <div className="mt-8">
        <ProgressBar value={declaration.percentComplete} />
      </div>
      <div className="mt-10 flex flex-col items-center gap-3">
        <Button href={resumeHref}>{docJourneyDone ? workspace.nextAction.cta : "Poursuivre"}</Button>
        <Link href={nextHref} style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          Voir la recommandation IA
        </Link>
      </div>
    </div>
  );
}
