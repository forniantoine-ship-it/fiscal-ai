"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { DeclarationHowItWorks } from "@/components/lmnp/declaration/DeclarationHowItWorks";
import { DashboardHero, YearBadge } from "@/components/lmnp/dashboard/DashboardHero";
import { DashboardPrimaryCard } from "@/components/lmnp/dashboard/DashboardPrimaryCard";
import {
  DashboardAiRecommendationPanel,
  DashboardAutosavePanel,
  DashboardFiscalInsightsPanel,
  DashboardRecentActivityPanel,
  DashboardRecentDocumentsPanel,
} from "@/components/lmnp/dashboard/DashboardSidePanels";
import { formatNormalizedValue } from "@/lib/lmnp/validation/display";
import {
  isDocumentJourneyComplete,
  isDocumentJourneyStarted,
  resolveCurrentDocumentStep,
  resolveCurrentDocumentStepHref,
} from "@/lib/lmnp/engine/document-journey-progress";
import { LMNP_ROUTES, toFlatLmnpRoute } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";

function DashboardSideColumn() {
  const { workspace } = useLmnp();
  const nextHref = toFlatLmnpRoute(workspace.nextAction.href);

  return (
    <aside className="space-y-5">
      <DashboardAutosavePanel />
      <DashboardAiRecommendationPanel
        assistant={workspace.assistant}
        href={nextHref}
        cta={workspace.nextAction.cta}
      />
      <DashboardFiscalInsightsPanel insights={workspace.declaration.insights} />
      <DashboardRecentDocumentsPanel documents={workspace.declaration.recentDocuments} />
      <DashboardRecentActivityPanel />
    </aside>
  );
}

function DashboardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="space-y-6 lg:col-span-8">{children}</div>
        <div className="lg:col-span-4">
          <DashboardSideColumn />
        </div>
      </div>
    </div>
  );
}

export function DashboardHome() {
  const router = useRouter();
  const { workspace, dispatch } = useLmnp();
  const { declaration, fiscalYear, assistant, nextAction } = workspace;

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

  const nextHref = toFlatLmnpRoute(nextAction.href);

  if (completed) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <DashboardHero
          eyebrow={<YearBadge year={fiscalYear.year} />}
          title="Votre déclaration est transmise"
          description="Merci — votre liasse a bien été envoyée. Vous pouvez consulter vos documents et l'historique de votre dossier."
        >
          <Button href={LMNP_ROUTES.documents} variant="secondary">
            Consulter mes documents
          </Button>
        </DashboardHero>
        <DashboardSideColumn />
      </div>
    );
  }

  if (!started) {
    return (
      <div className="mx-auto max-w-5xl space-y-8">
        <DashboardHero
          eyebrow={<YearBadge year={fiscalYear.year} />}
          title="Préparez votre déclaration LMNP simplement"
          description="Déposez vos documents. L'IA extrait les informations, prépare votre déclaration et vous guide jusqu'à la transmission."
        >
          <Button onClick={startJourney}>Commencer</Button>
        </DashboardHero>
        <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-8">
            <Card variant="muted" interactive>
              <DeclarationHowItWorks />
            </Card>
          </div>
          <div className="lg:col-span-4">
            <DashboardSideColumn />
          </div>
        </div>
      </div>
    );
  }

  if (pending > 0) {
    const pendingItems = workspace.validationItems.filter((v) => v.status === "pending");
    const previewItems = pendingItems.slice(0, 4);

    return (
      <DashboardGrid>
        <DashboardHero
          eyebrow={<YearBadge year={fiscalYear.year} />}
          title="Votre dossier est prêt"
          description={`Il reste ${pending} confirmation${pending > 1 ? "s" : ""} avant la génération de la liasse.`}
        />
        <DashboardPrimaryCard
          eyebrow="Action prioritaire"
          title={declaration.nextAction.headline}
          description="Validez les montants détectés par l'IA pour alimenter automatiquement vos onglets revenus, charges et amortissements."
          actionHref={LMNP_ROUTES.declarations}
          actionLabel={declaration.nextAction.label}
        />
        <Card className="!p-0 overflow-hidden" variant="muted" interactive>
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
      </DashboardGrid>
    );
  }

  const currentDocStep = resolveCurrentDocumentStep(ws);
  const resumeHref = resolveCurrentDocumentStepHref(fiscalYear.id, ws);
  const primaryTitle = docJourneyDone ? nextAction.title : currentDocStep.screenTitle;
  const primaryDescription = docJourneyDone
    ? nextAction.description
    : currentDocStep.explanation;
  const primaryLabel = docJourneyDone ? nextAction.cta : "Poursuivre";
  const primaryHref = docJourneyDone ? nextHref : resumeHref;

  return (
    <DashboardGrid>
      <DashboardHero
        eyebrow={<YearBadge year={fiscalYear.year} />}
        title="Votre déclaration LMNP"
        description={assistant.headline}
      />
      <DashboardPrimaryCard
        title={primaryTitle}
        description={primaryDescription}
        actionHref={primaryHref}
        actionLabel={primaryLabel}
        footer={
          <p className="mt-4" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            Besoin d&apos;un autre angle ?{" "}
            <a href={nextHref} style={{ color: colors.text.accent }}>
              {nextAction.cta}
            </a>
          </p>
        }
      />
    </DashboardGrid>
  );
}
