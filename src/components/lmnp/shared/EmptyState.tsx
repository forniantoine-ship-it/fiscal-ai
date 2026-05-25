import type { ReactNode } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  primaryAction?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
  variant?: "default" | "success";
}

export function EmptyState({
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  variant = "default",
}: EmptyStateProps) {
  const isSuccess = variant === "success";

  return (
    <Card
      className="text-center"
      style={{
        padding: spacing.scale[10],
        border: `1px solid ${isSuccess ? colors.success.border : colors.border.subtle}`,
        backgroundColor: isSuccess ? colors.success.surface : colors.surface.secondary,
      }}
    >
      {icon ? (
        <div className="mb-4 flex justify-center" style={{ color: colors.text.muted }}>
          {icon}
        </div>
      ) : null}
      <p
        style={{
          ...typography.cardTitle.desktop,
          color: isSuccess ? colors.success.DEFAULT : colors.text.primary,
        }}
      >
        {title}
      </p>
      <p
        className="mx-auto mt-2 max-w-md"
        style={{ ...typography.body.desktop, color: colors.text.secondary, lineHeight: typography.lineHeight.relaxed }}
      >
        {description}
      </p>
      {primaryAction || secondaryAction ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {primaryAction ? <Button href={primaryAction.href}>{primaryAction.label}</Button> : null}
          {secondaryAction ? (
            <Button href={secondaryAction.href} variant="secondary">
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function DocIcon() {
  return (
    <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

export function DocumentsEmptyIcon() {
  return <DocIcon />;
}

export function TabEmptyIcon() {
  return (
    <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.2}
        d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    </svg>
  );
}
