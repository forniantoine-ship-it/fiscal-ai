"use client";

/**
 * Compagnon INPI — résumé compact Dashboard (Phase 4.4).
 *
 * Répond uniquement à « où en suis-je ? » — jamais aux 9 étapes du
 * Compagnon (qui restent dans Activité). Réutilise `computeInpiCompanionView`
 * tel quel (même fonction que `InpiCompanionPanel`) : aucun second moteur,
 * aucun second calcul de mode — cf. Phase 4.4.16.
 */

import { useMemo } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { useLmnp } from "@/lib/lmnp/store";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";

import { resolveInpiCompanionDashboardCase } from "./inpi-companion-dashboard-case";
import { computeInpiCompanionView } from "./inpi-companion-view-model";

function SummaryTitle({ children }: { children: string }) {
  return (
    <p style={{ ...typography.cardTitle.desktop, color: colors.text.primary, marginBottom: spacing.scale[1] }}>
      {children}
    </p>
  );
}

function SummaryBody({ children }: { children: string }) {
  return (
    <p style={{ ...typography.body.desktop, color: colors.text.secondary, marginBottom: spacing.scale[3] }}>
      {children}
    </p>
  );
}

export function InpiCompanionDashboardSummary() {
  const { workspace, dossierInpiStatus, isReady } = useLmnp();
  const draft = workspace.declarationDraft;

  const view = useMemo(
    () =>
      computeInpiCompanionView({
        draft,
        properties: workspace.properties,
        dossierInpiStatus: dossierInpiStatus?.status,
        companionState: draft?.inpiCompanionState,
      }),
    [draft, workspace.properties, dossierInpiStatus?.status],
  );

  // 4.4.4 — pas de dossier / pas encore hydraté : état neutre, jamais d'erreur.
  if (!isReady) return null;

  const dashboardCase = resolveInpiCompanionDashboardCase(view.modeDecision);
  const multiPropertyNote = view.isMultiProperty
    ? "Plusieurs biens sont présents dans votre dossier."
    : undefined;

  if (dashboardCase === "resumed") {
    return (
      <Card>
        <SummaryTitle>Votre démarche INPI</SummaryTitle>
        <SummaryBody>Vous avez commencé votre préparation.</SummaryBody>
        {multiPropertyNote ? <SummaryBody>{multiPropertyNote}</SummaryBody> : null}
        <Button href={LMNP_ROUTES.activite}>Reprendre là où je me suis arrêté</Button>
      </Card>
    );
  }

  if (dashboardCase === "diagnostic") {
    return (
      <Card>
        <SummaryTitle>Votre démarche INPI</SummaryTitle>
        <SummaryBody>Nous pouvons vous aider à vérifier où vous en êtes.</SummaryBody>
        <Button href={LMNP_ROUTES.activite}>Vérifier ma situation</Button>
      </Card>
    );
  }

  if (dashboardCase === "creation") {
    return (
      <Card>
        <SummaryTitle>Votre démarche INPI</SummaryTitle>
        <SummaryBody>Votre démarche n&apos;est pas encore finalisée.</SummaryBody>
        {multiPropertyNote ? <SummaryBody>{multiPropertyNote}</SummaryBody> : null}
        <Button href={LMNP_ROUTES.activite}>Commencer ma démarche</Button>
      </Card>
    );
  }

  if (dashboardCase === "poursuite") {
    return (
      <Card>
        <SummaryTitle>Votre démarche INPI</SummaryTitle>
        <SummaryBody>Votre démarche est en cours.</SummaryBody>
        <Button href={LMNP_ROUTES.activite}>Reprendre mon accompagnement</Button>
      </Card>
    );
  }

  if (dashboardCase === "attente") {
    return (
      <Card>
        <SummaryTitle>Votre démarche INPI</SummaryTitle>
        <SummaryBody>Votre démarche a été envoyée.</SummaryBody>
        <SummaryBody>Nous attendons maintenant votre prochaine information.</SummaryBody>
        <Button href={LMNP_ROUTES.activite}>Mettre à jour ma situation</Button>
      </Card>
    );
  }

  if (dashboardCase === "regularisation") {
    return (
      <Card>
        <SummaryTitle>Action demandée par l&apos;INPI</SummaryTitle>
        <SummaryBody>Une correction ou un complément est demandé.</SummaryBody>
        <Button href={LMNP_ROUTES.activite}>Comprendre ce qu&apos;il reste à faire</Button>
      </Card>
    );
  }

  // dashboardCase === "verification" (registered)
  return (
    <Card>
      <SummaryTitle>Activité enregistrée</SummaryTitle>
      <SummaryBody>Votre activité est déjà enregistrée.</SummaryBody>
      {draft?.siret ? (
        <p style={{ ...typography.caption.desktop, color: colors.text.tertiary, marginBottom: spacing.scale[3] }}>
          SIREN / SIRET : {draft.siret}
        </p>
      ) : null}
      <Button variant="ghost" href={LMNP_ROUTES.activite}>
        Voir ma situation
      </Button>
    </Card>
  );
}
