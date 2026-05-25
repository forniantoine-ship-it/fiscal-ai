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
  title: string;
  nextStep: string;
  progress: number;
  progressLabel?: string;
  saveLabel?: string | null;
  saveActive?: boolean;
  children?: ReactNode;
};

export function DashboardHero({
  year,
  title,
  nextStep,
  progress,
  progressLabel = "Avancement du dossier",
  saveLabel,
  saveActive = false,
  children,
}: DashboardHeroProps) {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        borderRadius: radius.xl,
        border: `1px solid ${colors.border.selected}`,
        boxShadow: shadows.hero.floating,
        padding: spacing.card.lg,
        backgroundImage: [
          `radial-gradient(ellipse 78% 58% at 100% 0%, ${colors.orange[200]} 0%, ${colors.orange[100]} 28%, transparent 64%)`,
          `radial-gradient(ellipse 62% 50% at 0% 100%, ${colors.background.landingGlowSoft} 0%, transparent 58%)`,
          `radial-gradient(ellipse 50% 40% at 50% 0%, ${colors.orange[50]} 0%, transparent 72%)`,
          gradients.card.elevated,
        ].join(", "),
      }}
    >
      <div className="relative flex flex-wrap items-center justify-between gap-3">
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

      <p
        className="relative mt-5"
        style={{
          ...typography.caption.desktop,
          color: colors.text.accent,
          letterSpacing: typography.letterSpacing.label,
        }}
      >
        Prochaine étape
      </p>
      <h1
        className="relative mt-2 text-3xl sm:text-4xl lg:text-[2.75rem]"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          lineHeight: typography.lineHeight.title,
          color: colors.text.primary,
          maxWidth: "34rem",
        }}
      >
        {title}
      </h1>
      <p
        className="relative mt-3 max-w-2xl"
        style={{
          ...typography.body.desktop,
          color: colors.text.secondary,
          lineHeight: typography.lineHeight.relaxed,
        }}
      >
        {nextStep}
      </p>

      <div className="relative mt-8 max-w-xl">
        <ProgressBar value={progress} label={progressLabel} />
      </div>

      {children ? <div className="relative mt-8 flex flex-wrap items-center gap-3">{children}</div> : null}
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
