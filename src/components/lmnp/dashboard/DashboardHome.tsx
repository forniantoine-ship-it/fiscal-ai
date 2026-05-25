"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { DeclarationHowItWorks } from "@/components/lmnp/declaration/DeclarationHowItWorks";
import { DashboardAiInsights } from "@/components/lmnp/dashboard/DashboardAiInsights";
import { DashboardDocumentsSection } from "@/components/lmnp/dashboard/DashboardDocumentsSection";
import { DashboardHero } from "@/components/lmnp/dashboard/DashboardHero";
import { DashboardPrimaryCard } from "@/components/lmnp/dashboard/DashboardPrimaryCard";
import { DashboardWorkflow } from "@/components/lmnp/dashboard/DashboardWorkflow";
import { formatNormalizedValue } from "@/lib/lmnp/validation/display";
import {
  isDocumentJourneyComplete,
  isDocumentJourneyStarted,
  resolveCurrentDocumentStep,
  resolveCurrentDocumentStepHref,
} from "@/lib/lmnp/engine/document-journey-progress";
import { LMNP_ROUTES, toFlatLmnpRoute } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import type { AutosaveStatus } from "@/design-system/layouts/DashboardLayout";
import type { NormalizedValue } from "@/lib/lmnp/types";

function autosaveLabel(status: AutosaveStatus): { label: string | null; active: boolean } {
  if (status === "saved") return { label: "Dossier enregistré", active: false };
  if (status === "saving") return { label: "Enregistrement…", active: true };
  if (status === "error") return { label: "Erreur de sauvegarde", active: false };
  return { label: null, active: false };
}

function ValidationPreview({
  items,
}: {
  items: { id: string; label: string; documentFileName?: string; proposedValue: NormalizedValue }[];
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <h2
        className="mb-2"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          fontSize: typography.fontSize["2xl"],
          color: colors.text.primary,
        }}
      >
        Montants à confirmer
      </h2>
      <p className="mb-5 max-w-2xl" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
        L&apos;IA a extrait ces montants — confirmez ou corrigez en un geste.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              padding: spacing.card.md,
              borderRadius: radius.lg,
              border: `1px solid ${colors.border.selected}`,
              backgroundImage: gradients.card.interactive,
              boxShadow: shadows.card.default,
            }}
          >
            <p style={{ ...typography.body.desktop, color: colors.text.primary }}>{item.label}</p>
            {item.documentFileName ? (
              <p className="mt-1 truncate" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                {item.documentFileName}
              </p>
            ) : null}
            <p className="mt-3" style={{ ...typography.cardTitle.desktop, color: colors.text.accent }}>
              {formatNormalizedValue(item.proposedValue)}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <Button href={LMNP_ROUTES.declarations}>Ouvrir les corrections</Button>
      </div>
    </section>
  );
}

export function DashboardHome() {
  const router = useRouter();
  const { workspace, dispatch, autosaveStatus } = useLmnp();
  const { declaration, fiscalYear, assistant, nextAction, journey } = workspace;
  const save = autosaveLabel(autosaveStatus);

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
  const currentDocStep = resolveCurrentDocumentStep(ws);
  const resumeHref = resolveCurrentDocumentStepHref(fiscalYear.id, ws);

  const heroTitle = completed
    ? "Votre déclaration est transmise"
    : !started
      ? "Préparez votre déclaration LMNP"
      : pending > 0
        ? "Confirmez les montants détectés"
        : "Votre déclaration LMNP";

  const heroNextStep = completed
    ? "Merci — votre liasse a bien été envoyée. Retrouvez vos documents et l'historique de votre dossier."
    : !started
      ? "Déposez vos documents. L'IA extrait les informations et vous guide jusqu'à la télétransmission."
      : pending > 0
        ? `Il reste ${pending} confirmation${pending > 1 ? "s" : ""} avant de finaliser votre liasse.`
        : assistant.headline;

  const progressValue = completed ? 100 : journey.percentComplete || declaration.percentComplete;

  let primaryTitle = currentDocStep.screenTitle;
  let primaryDescription = currentDocStep.explanation;
  let primaryLabel = "Importer le document";
  let primaryHref = resumeHref;
  let primaryEyebrow = "Votre prochain document";
  let onPrimaryAction: (() => void) | undefined;

  if (completed) {
    primaryTitle = "Consultez votre dossier";
    primaryDescription = "Vos pièces et montants validés restent accessibles à tout moment.";
    primaryLabel = "Voir mes documents";
    primaryHref = LMNP_ROUTES.documents;
    primaryEyebrow = "Dossier transmis";
  } else if (!started) {
    primaryTitle = "Commencez par vos pièces justificatives";
    primaryDescription =
      "L'IA lit chaque document, repère les montants utiles et prépare votre déclaration sans saisie manuelle.";
    primaryLabel = "Commencer";
    onPrimaryAction = startJourney;
    primaryHref = undefined;
    primaryEyebrow = "Première étape";
  } else if (pending > 0) {
    primaryTitle = declaration.nextAction.headline;
    primaryDescription =
      "Validez les montants détectés par l'IA pour alimenter automatiquement vos revenus, charges et amortissements.";
    primaryLabel = declaration.nextAction.label;
    primaryHref = LMNP_ROUTES.declarations;
    primaryEyebrow = "Corrections en attente";
  } else if (docJourneyDone) {
    primaryTitle = nextAction.title;
    primaryDescription = nextAction.description;
    primaryLabel = nextAction.cta;
    primaryHref = nextHref;
    primaryEyebrow = "Étape suivante";
  } else {
    primaryLabel = "Poursuivre l'import";
    primaryHref = resumeHref;
  }

  const pendingPreview = workspace.validationItems.filter((item) => item.status === "pending").slice(0, 4);

  return (
    <div className="mx-auto max-w-5xl space-y-10 pb-16">
      <DashboardHero
        year={fiscalYear.year}
        title={heroTitle}
        nextStep={heroNextStep}
        progress={progressValue}
        progressLabel={completed ? "Dossier finalisé" : "Avancement global"}
        saveLabel={save.label}
        saveActive={save.active}
      >
        {completed ? (
          <Button href={LMNP_ROUTES.documents} variant="secondary">
            Consulter mes documents
          </Button>
        ) : !started ? (
          <Button onClick={startJourney}>Commencer</Button>
        ) : pending > 0 ? (
          <Button href={LMNP_ROUTES.declarations}>{declaration.nextAction.label}</Button>
        ) : docJourneyDone ? (
          <Button href={nextHref}>{nextAction.cta}</Button>
        ) : (
          <>
            <Button href={resumeHref}>Poursuivre</Button>
            <Button href={LMNP_ROUTES.documents} variant="secondary">
              Importer un document
            </Button>
          </>
        )}
      </DashboardHero>

      <DashboardWorkflow journey={journey} />

      <DashboardPrimaryCard
        eyebrow={primaryEyebrow}
        title={primaryTitle}
        description={primaryDescription}
        actionHref={primaryHref}
        actionLabel={primaryLabel}
        onAction={onPrimaryAction}
        secondaryActionHref={!completed && started ? LMNP_ROUTES.documents : undefined}
        secondaryActionLabel={!completed && started ? "Voir les documents" : undefined}
        footer={
          !completed && started && !pending ? (
            <p className="mt-6" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              Besoin d&apos;un autre angle ?{" "}
              <a href={nextHref} style={{ color: colors.text.accent }}>
                {nextAction.cta}
              </a>
            </p>
          ) : null
        }
      />

      {!started ? (
        <Card
          variant="muted"
          interactive
          style={{
            backgroundImage: [
              `radial-gradient(ellipse 70% 55% at 100% 0%, ${colors.orange[100]} 0%, transparent 62%)`,
              gradients.card.interactive,
            ].join(", "),
            boxShadow: shadows.card.default,
          }}
        >
          <DeclarationHowItWorks />
        </Card>
      ) : null}

      {pending > 0 ? <ValidationPreview items={pendingPreview} /> : null}

      {started || workspace.documents.length > 0 ? <DashboardDocumentsSection /> : null}

      <DashboardAiInsights />
    </div>
  );
}
