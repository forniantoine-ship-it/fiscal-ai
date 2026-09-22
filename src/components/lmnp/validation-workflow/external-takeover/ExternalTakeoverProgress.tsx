"use client";

import { colors } from "@/design-system/theme/colors";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { ExternalTakeoverProgressStep } from "./external-takeover-view-model";

export function ExternalTakeoverProgress({
  steps,
}: {
  steps: ExternalTakeoverProgressStep[];
}) {
  return (
    <ol className="space-y-2" aria-label="Progression de la reprise">
      {steps.map((step) => (
        <li
          key={step.id}
          className="flex flex-wrap items-baseline gap-2"
          style={{ ...typography.body.desktop, color: colors.text.secondary }}
        >
          <span style={{ color: step.done ? colors.text.accent : colors.text.primary, fontWeight: typography.fontWeight.medium }}>
            {step.label}
          </span>
          <span style={{ color: colors.text.muted }}>{step.detail}</span>
        </li>
      ))}
    </ol>
  );
}

export function ExternalTakeoverAnalyzingBanner({ message }: { message: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      style={{
        ...typography.body.desktop,
        color: colors.text.secondary,
        paddingTop: spacing.scale[2],
      }}
    >
      {message}
    </p>
  );
}
