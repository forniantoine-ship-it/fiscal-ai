import type { ReactNode } from "react";

import { ProgressBar } from "@/design-system/components/ProgressBar";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

type DashboardHeroProps = {
  year: number;
  progress: number;
  progressLabel?: string;
  saveLabel?: string | null;
  saveActive?: boolean;
  children?: ReactNode;
};

const HERO_TITLE = "Votre déclaration LMNP";
const HERO_EXPLANATION = [
  "Déposez les documents demandés.",
  "L'IA extrait automatiquement les données importantes.",
  "Vous n'avez plus qu'à corriger ou valider.",
].join("\n");

export function DashboardHero({
  year,
  progress,
  progressLabel = "Avancement du dossier",
  saveLabel,
  saveActive = false,
  children,
}: DashboardHeroProps) {
  return (
    <section
      className="relative mx-auto max-w-3xl overflow-hidden text-center"
      style={{
        borderRadius: radius.xl,
        border: `1px solid ${colors.border.selected}`,
        boxShadow: shadows.hero.floating,
        padding: spacing.card.lg,
        backgroundImage: [
          `radial-gradient(ellipse 88% 62% at 50% 0%, ${colors.orange[200]} 0%, ${colors.orange[100]} 32%, transparent 68%)`,
          `radial-gradient(ellipse 70% 50% at 0% 100%, ${colors.background.landingGlowSoft} 0%, transparent 58%)`,
          `radial-gradient(ellipse 70% 50% at 100% 100%, ${colors.orange[100]} 0%, transparent 58%)`,
          gradients.card.elevated,
        ].join(", "),
      }}
    >
      <div className="relative flex flex-wrap items-center justify-center gap-3">
        <YearBadge year={year} />
        {saveLabel ? (
          <span
            className="inline-flex items-center gap-2"
            style={{
              ...typography.caption.desktop,
              color: colors.text.secondary,
              padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
              borderRadius: radius.full,
              border: `1px solid ${colors.border.subtle}`,
              backgroundColor: colors.surface.primary,
            }}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                backgroundColor: saveActive ? colors.orange[500] : colors.success.DEFAULT,
                animation: saveActive ? motions.analyzing.pulse : undefined,
              }}
            />
            {saveLabel}
          </span>
        ) : null}
      </div>

      <h1
        className="relative mx-auto mt-6 max-w-2xl text-3xl sm:text-4xl lg:text-[2.85rem]"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          lineHeight: typography.lineHeight.title,
          color: colors.text.primary,
        }}
      >
        {HERO_TITLE}
      </h1>
      <p
        className="relative mx-auto mt-4 max-w-xl whitespace-pre-line"
        style={{
          ...typography.body.desktop,
          color: colors.text.secondary,
          lineHeight: typography.lineHeight.relaxed,
        }}
      >
        {HERO_EXPLANATION}
      </p>

      <div className="relative mx-auto mt-8 max-w-md text-left">
        <ProgressBar value={progress} label={progressLabel} />
      </div>

      {children ? (
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">{children}</div>
      ) : null}
    </section>
  );
}

export function YearBadge({ year }: { year: number }) {
  return (
    <span
      style={{
        ...typography.caption.desktop,
        color: colors.text.accent,
        letterSpacing: typography.letterSpacing.label,
        padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
        borderRadius: radius.full,
        border: `1px solid ${colors.border.selected}`,
        backgroundColor: colors.surface.selected,
      }}
    >
      Exercice LMNP {year}
    </span>
  );
}
