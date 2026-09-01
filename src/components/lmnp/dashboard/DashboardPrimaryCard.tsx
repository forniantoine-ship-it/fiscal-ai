import type { ReactNode } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

type DashboardPrimaryCardProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel: string;
  onAction?: () => void;
  secondaryActionHref?: string;
  secondaryActionLabel?: string;
  footer?: ReactNode;
};

export function DashboardPrimaryCard({
  eyebrow = "Votre prochain document",
  title,
  description,
  actionHref,
  actionLabel,
  onAction,
  secondaryActionHref,
  secondaryActionLabel,
  footer,
}: DashboardPrimaryCardProps) {
  return (
    <Card
      interactive
      className="!p-0 overflow-hidden"
      style={{
        boxShadow: shadows.hero.floating,
        backgroundImage: [
          `radial-gradient(ellipse 72% 56% at 0% 0%, ${colors.orange[100]} 0%, transparent 62%)`,
          `radial-gradient(ellipse 55% 45% at 100% 100%, ${colors.background.landingGlowSoft} 0%, transparent 58%)`,
          gradients.card.highlight,
        ].join(", "),
      }}
    >
      <div style={{ padding: spacing.card.lg }}>
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.accent,
            letterSpacing: typography.letterSpacing.label,
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </p>
        <h2
          className="mt-3 text-2xl sm:text-[2rem]"
          style={{
            fontFamily: typography.fontFamily.display,
            fontWeight: typography.fontWeight.regular,
            lineHeight: typography.lineHeight.title,
            color: colors.text.primary,
            maxWidth: "36rem",
          }}
        >
          {title}
        </h2>
        <p
          className="mt-4 max-w-2xl"
          style={{
            ...typography.body.desktop,
            color: colors.text.secondary,
            lineHeight: typography.lineHeight.relaxed,
          }}
        >
          {description}
        </p>

        <div
          className="mt-8 flex flex-wrap items-center gap-3"
          style={{
            padding: spacing.card.md,
            borderRadius: radius.lg,
            border: `1px dashed ${colors.border.selected}`,
            backgroundColor: colors.surface.selected,
          }}
        >
          {onAction ? (
            <Button onClick={onAction}>{actionLabel}</Button>
          ) : (
            <Button href={actionHref}>{actionLabel}</Button>
          )}
          {secondaryActionHref && secondaryActionLabel ? (
            <Button href={secondaryActionHref} variant="secondary">
              {secondaryActionLabel}
            </Button>
          ) : null}
        </div>

        {footer}
      </div>
    </Card>
  );
}
