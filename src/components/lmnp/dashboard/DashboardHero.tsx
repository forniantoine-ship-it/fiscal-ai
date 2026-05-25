import type { ReactNode } from "react";

import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

type DashboardHeroProps = {
  eyebrow: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
};

export function DashboardHero({ eyebrow, title, description, children }: DashboardHeroProps) {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        borderRadius: radius.xl,
        border: `1px solid ${colors.border.selected}`,
        boxShadow: shadows.card.hover,
        padding: spacing.card.lg,
        backgroundImage: [
          `radial-gradient(ellipse 70% 55% at 100% 0%, ${colors.orange[100]} 0%, transparent 62%)`,
          `radial-gradient(ellipse 55% 45% at 0% 100%, ${colors.background.landingGlowSoft} 0%, transparent 58%)`,
          gradients.card.elevated,
        ].join(", "),
      }}
    >
      <div className="relative">{eyebrow}</div>
      <h1
        className="relative mt-4 text-3xl sm:text-4xl lg:text-[2.5rem]"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          lineHeight: typography.lineHeight.title,
          color: colors.text.primary,
          maxWidth: "28rem",
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
        {description}
      </p>
      {children ? <div className="relative mt-6">{children}</div> : null}
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
