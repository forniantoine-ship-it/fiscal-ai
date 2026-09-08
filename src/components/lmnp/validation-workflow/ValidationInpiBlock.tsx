"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import type { InpiValidationState } from "@/lib/lmnp/services/inpi/resolve-inpi-validation-state";
import type { InpiStatus } from "@/lib/lmnp/types/dossier";

/**
 * P1 — socle du bloc "Votre démarche INPI" sur la page Validation.
 *
 * Volontairement minimal : ce composant ne construit PAS le guide INPI
 * détaillé (écrans étape par étape, extraction RNE/Kbis) — ce guide vit dans
 * le Compagnon INPI (`/assistants/activite`, Phase 4.3+). Ce bloc reste une
 * orientation courte : il déclare éventuellement le statut ("preparing",
 * persisté Dossier-level) puis oriente vers le Compagnon — jamais un faux
 * formulaire, jamais une simulation de soumission INPI.
 *
 * P1 (correctif) — audit du 2026 : aucun texte de ce fichier ne doit
 * prétendre connaître l'état réel/détaillé de la formalité côté INPI (pas de
 * suivi personnalisé, pas de connaissance de "ce qu'il reste à faire").
 * `regularization_required` et `submitted` ont chacun un texte distinct de
 * l'état générique "en cours" — sans jamais prétendre connaître la nature
 * exacte d'une régularisation demandée ni le délai/résultat d'un dépôt.
 *
 * Phase 4.4 (correction finale) — ce composant n'ouvre plus jamais
 * directement `https://formalites.entreprises.gouv.fr` : tous les CTA
 * orientent vers le Compagnon INPI (`LMNP_ROUTES.activite`), qui reste
 * l'unique endroit où CFA ouvre réellement le site officiel. Validation =
 * orientation, Activité = accompagnement, INPI = exécution officielle.
 */

/** P1 — table de wording exportée (même patron que CHECKOUT_COPY dans ValidationCheckoutOverlay.tsx), testable sans rendu React. */
export const INPI_BLOCK_COPY = {
  REGISTERED: {
    title: "Votre activité est déjà enregistrée",
  },
  IN_PROGRESS: {
    title: "Votre démarche INPI est en cours",
    // P1 (correctif) — l'ancien libellé du bouton était trop engageant (il
    // laissait croire à un suivi personnalisé de l'état réel de la
    // formalité) : ce texte générique reste inchangé, seul le libellé du
    // bouton qui le révèle a changé (cf. rendu JSX ci-dessous).
    acknowledgedBody:
      "Le suivi détaillé de votre démarche sera bientôt disponible ici. En attendant, vous pouvez la reprendre directement sur le site officiel.",
  },
  REGULARIZATION_REQUIRED: {
    title: "Une action est nécessaire sur votre démarche INPI",
    body: "L'INPI vous demande de compléter ou de corriger votre dossier.",
  },
  SUBMITTED: {
    title: "Votre démarche a été envoyée",
    body: "Votre formalité est maintenant en cours de traitement par l'INPI.",
  },
  PAID_WAITING_INPI: {
    title: "Votre dossier est payé",
    body1: "Votre dossier fiscal est bien enregistré chez Fiscal AI — vous ne serez pas facturé à nouveau.",
    body2: "Il manque encore les informations INPI (SIREN/SIRET) nécessaires pour générer votre déclaration officielle.",
  },
  NOT_STARTED: {
    title: "Votre démarche INPI",
    body: "Votre dossier fiscal est prêt. Nous pouvons maintenant vous accompagner dans votre démarche de déclaration d'activité auprès de l'INPI.",
  },
  UNKNOWN: {
    title: "Votre activité de location meublée est-elle déjà déclarée ?",
  },
} as const;

type ValidationInpiBlockProps = {
  cardStyle: React.CSSProperties;
  state: InpiValidationState;
  siren?: string;
  /** true pendant l'écriture asynchrone du statut (évite les doubles clics). */
  busy?: boolean;
  /** Écrit le statut INPI (Dossier-level, cf. saveDossierInpiStatus). */
  onDeclareStatus: (status: InpiStatus) => void;
};

function Title({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: typography.fontFamily.display,
        fontSize: typography.fontSize.lg,
        color: colors.text.primary,
      }}
    >
      {children}
    </p>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-auto mt-2 max-w-md" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
      {children}
    </p>
  );
}

function SecondaryAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3"
      style={{ ...typography.caption.desktop, color: colors.text.muted, textDecoration: "underline" }}
    >
      {children}
    </button>
  );
}

export function ValidationInpiBlock({ cardStyle, state, siren, busy = false, onDeclareStatus }: ValidationInpiBlockProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  // P1 — acquittement local uniquement (jamais persisté) : le guide détaillé
  // n'existe pas encore dans ce socle, cf. commentaire de fichier ci-dessus.
  const [acknowledged, setAcknowledged] = useState(false);

  if (dismissed) return null;

  // Phase 4.4 — oriente vers le Compagnon INPI (Activité), jamais vers le
  // site officiel directement. Le Compagnon reprend naturellement l'étape
  // sauvegardée via `DeclarationDraft.inpiCompanionState` — rien à ajouter
  // ici pour ça.
  const handlePrepare = () => {
    if (busy) return;
    if (state === "NOT_STARTED" || state === "PAID_WAITING_INPI") {
      onDeclareStatus("preparing");
    }
    router.push(LMNP_ROUTES.activite);
  };

  if (state === "REGISTERED") {
    return (
      <section className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both] text-center" style={cardStyle}>
        <Title>{INPI_BLOCK_COPY.REGISTERED.title}</Title>
        <Body>
          Votre activité de location meublée est déjà enregistrée auprès de l&apos;INPI
          {siren ? ` (SIREN ${siren})` : ""}. Rien à faire de plus ici.
        </Body>
      </section>
    );
  }

  if (state === "REGULARIZATION_REQUIRED") {
    return (
      <section className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both] text-center" style={cardStyle}>
        <Title>{INPI_BLOCK_COPY.REGULARIZATION_REQUIRED.title}</Title>
        <Body>{INPI_BLOCK_COPY.REGULARIZATION_REQUIRED.body}</Body>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Button href={LMNP_ROUTES.activite} disabled={busy}>
            Reprendre ma démarche
          </Button>
        </div>
      </section>
    );
  }

  if (state === "SUBMITTED") {
    return (
      <section className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both] text-center" style={cardStyle}>
        <Title>{INPI_BLOCK_COPY.SUBMITTED.title}</Title>
        <Body>{INPI_BLOCK_COPY.SUBMITTED.body}</Body>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Button href={LMNP_ROUTES.activite} disabled={busy}>
            Reprendre ma démarche
          </Button>
        </div>
      </section>
    );
  }

  if (state === "IN_PROGRESS") {
    return (
      <section className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both] text-center" style={cardStyle}>
        <Title>{INPI_BLOCK_COPY.IN_PROGRESS.title}</Title>
        {acknowledged ? <Body>{INPI_BLOCK_COPY.IN_PROGRESS.acknowledgedBody}</Body> : null}
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Button href={LMNP_ROUTES.activite} disabled={busy}>
            Reprendre ma démarche
          </Button>
        </div>
        <SecondaryAction onClick={() => setAcknowledged(true)}>En savoir plus sur la suite</SecondaryAction>
      </section>
    );
  }

  if (state === "PAID_WAITING_INPI") {
    return (
      <section className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both] text-center" style={cardStyle}>
        <Title>{INPI_BLOCK_COPY.PAID_WAITING_INPI.title}</Title>
        <Body>{INPI_BLOCK_COPY.PAID_WAITING_INPI.body1}</Body>
        <Body>{INPI_BLOCK_COPY.PAID_WAITING_INPI.body2}</Body>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Button onClick={handlePrepare} disabled={busy}>
            Préparer ma démarche INPI
          </Button>
        </div>
        <SecondaryAction onClick={() => setDismissed(true)}>Je le ferai plus tard</SecondaryAction>
      </section>
    );
  }

  if (state === "NOT_STARTED") {
    return (
      <section className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both] text-center" style={cardStyle}>
        <Title>{INPI_BLOCK_COPY.NOT_STARTED.title}</Title>
        <Body>{INPI_BLOCK_COPY.NOT_STARTED.body}</Body>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Button onClick={handlePrepare} disabled={busy}>
            Préparer ma démarche INPI
          </Button>
        </div>
        <SecondaryAction onClick={() => setDismissed(true)}>Je le ferai plus tard</SecondaryAction>
      </section>
    );
  }

  // state === "UNKNOWN" — aucun statut historique exploitable : question
  // légère, jamais une affirmation ("vous n'avez jamais fait l'INPI").
  return (
    <section className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both] text-center" style={cardStyle}>
      <Title>{INPI_BLOCK_COPY.UNKNOWN.title}</Title>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Button onClick={() => onDeclareStatus("registered")} disabled={busy}>
          Oui, j&apos;ai un SIREN/SIRET
        </Button>
        <Button variant="secondary" onClick={() => onDeclareStatus("in_progress")} disabled={busy}>
          J&apos;ai commencé la démarche
        </Button>
        <Button variant="secondary" onClick={() => onDeclareStatus("not_started")} disabled={busy}>
          Non, pas encore
        </Button>
        <Button variant="ghost" onClick={() => setDismissed(true)} disabled={busy}>
          Je ne sais pas
        </Button>
      </div>
    </section>
  );
}
