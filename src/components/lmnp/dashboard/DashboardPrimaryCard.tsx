import type { ReactNode } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { WorkspaceProgress } from "@/components/lmnp/shared/WorkspaceProgress";

type DashboardPrimaryCardProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel: string;
  onAction?: () => void;
  showProgress?: boolean;
  footer?: ReactNode;
};

export function DashboardPrimaryCard({
  eyebrow = "Prochaine étape",
  title,
  description,
  actionHref,
  actionLabel,
  onAction,
  showProgress = true,
  footer,
}: DashboardPrimaryCardProps) {
  return (
    <Card
      interactive
      className="!p-0 overflow-hidden"
      style={{
        boxShadow: shadows.card.hover,
        backgroundImage: [
          `radial-gradient(ellipse 65% 50% at 0% 0%, ${colors.background.landingGlowSoft} 0%, transparent 60%)`,
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
          }}
        >
          {eyebrow}
        </p>
        <h2
          className="mt-2 text-2xl sm:text-3xl"
          style={{
            fontFamily: typography.fontFamily.display,
            fontWeight: typography.fontWeight.regular,
            color: colors.text.primary,
          }}
        >
          {title}
        </h2>
        <p
          className="mt-3 max-w-xl"
          style={{
            ...typography.body.desktop,
            color: colors.text.secondary,
            lineHeight: typography.lineHeight.relaxed,
          }}
        >
          {description}
        </p>
        {showProgress ? (
          <div className="mt-6">
            <WorkspaceProgress label="Avancement du dossier" />
          </div>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {onAction ? (
            <Button onClick={onAction}>{actionLabel}</Button>
          ) : (
            <Button href={actionHref}>{actionLabel}</Button>
          )}
        </div>
        {footer}
      </div>
    </Card>
  );
}
