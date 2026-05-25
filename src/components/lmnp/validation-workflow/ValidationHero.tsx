"use client";

import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

const HERO_BADGE = "Dossier prêt";
const HERO_TITLE = "Votre déclaration est prête à être générée";
const HERO_EXPLANATION =
  "Votre dossier a été automatiquement analysé et structuré par l'IA.\nVérifiez les derniers éléments avant génération officielle de votre déclaration LMNP.";

export function ValidationHero() {
  return (
    <section
      className="relative mx-auto max-w-3xl overflow-hidden text-center"
      style={{
        borderRadius: radius.lg,
        border: `1px solid ${colors.border.subtle}`,
        boxShadow: shadows.card.default,
        padding: `${spacing.card.sm} ${spacing.card.md}`,
        backgroundImage: [
          `radial-gradient(ellipse 88% 52% at 50% -8%, ${colors.orange[100]} 0%, transparent 62%)`,
          gradients.card.elevated,
        ].join(", "),
      }}
    >
      <span
        style={{
          ...typography.caption.desktop,
          color: colors.text.accent,
          letterSpacing: typography.letterSpacing.label,
          padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
          borderRadius: radius.full,
          border: `1px solid ${colors.border.subtle}`,
          backgroundColor: colors.surface.selected,
        }}
      >
        {HERO_BADGE}
      </span>

      <h1
        className="relative mx-auto mt-4 max-w-xl text-[1.375rem] sm:text-[1.625rem]"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          lineHeight: typography.lineHeight.heading,
          letterSpacing: typography.letterSpacing.heading,
          color: colors.text.primary,
        }}
      >
        {HERO_TITLE}
      </h1>
      <p
        className="relative mx-auto mt-2.5 max-w-lg whitespace-pre-line"
        style={{
          ...typography.body.desktop,
          fontSize: typography.fontSize.sm,
          color: colors.text.secondary,
          lineHeight: typography.lineHeight.ui,
        }}
      >
        {HERO_EXPLANATION}
      </p>
    </section>
  );
}
