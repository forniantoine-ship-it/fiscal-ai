"use client";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

const GUIDANCE_STEPS = [
  {
    title: "Créez votre activité en ligne",
    body: "Rendez-vous sur le guichet unique des entreprises (formalites.entreprises.gouv.fr) pour déclarer votre location meublée.",
  },
  {
    title: "Déclarez en LMNP réel simplifié",
    body: "Fiscal AI accompagne uniquement le régime LMNP réel simplifié pour la location meublée non professionnelle.",
  },
  {
    title: "Récupérez votre extrait INPI",
    body: "Une fois l’immatriculation validée, téléchargez votre extrait INPI ou Kbis — vous pourrez le déposer ici.",
  },
] as const;

type ActiviteNoInpiGuideProps = {
  onContinueManually: () => void;
};

export function ActiviteNoInpiGuide({ onContinueManually }: ActiviteNoInpiGuideProps) {
  return (
    <div
      className="mx-auto max-w-xl animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{
        borderRadius: radius.xl,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.primary,
        boxShadow: shadows.card.default,
        padding: spacing.card.md,
      }}
    >
      <p
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize.xl,
          color: colors.text.primary,
        }}
      >
        Pas encore de document INPI ?
      </p>
      <p className="mt-3" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
        Voici comment obtenir votre immatriculation LMNP, simplement.
      </p>

      <ol className="mt-8 space-y-6">
        {GUIDANCE_STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span
              aria-hidden
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center"
              style={{
                borderRadius: radius.full,
                backgroundColor: colors.surface.selected,
                color: colors.text.accent,
                ...typography.caption.desktop,
                fontWeight: typography.fontWeight.medium,
              }}
            >
              {index + 1}
            </span>
            <div>
              <p style={{ ...typography.cardTitle.desktop, color: colors.text.primary }}>{step.title}</p>
              <p className="mt-1.5" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={onContinueManually}
        className="mt-8"
        style={{
          ...typography.body.desktop,
          color: colors.text.accent,
          textDecoration: "underline",
          textUnderlineOffset: "3px",
        }}
      >
        Saisir mes informations manuellement
      </button>
    </div>
  );
}
