"use client";

import type { AmortizationSupervisionStatus } from "@/lib/lmnp/services/amortization-supervision";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

function palette(level: AmortizationSupervisionStatus["level"]) {
  if (level === "green") {
    return {
      border: colors.success.border,
      background: colors.success.surface,
      accent: colors.success.DEFAULT,
    };
  }
  if (level === "orange") {
    return {
      border: colors.warning.border,
      background: colors.warning.surface,
      accent: colors.warning.DEFAULT,
    };
  }
  return {
    border: colors.error.border,
    background: colors.error.surface,
    accent: colors.error.DEFAULT,
  };
}

export function AmortizationSupervisionCard({
  supervision,
}: {
  supervision?: AmortizationSupervisionStatus;
}) {
  if (!supervision) return null;

  const tone = palette(supervision.level);

  return (
    <section
      className="mb-6 animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{
        borderRadius: radius.lg,
        border: `1px solid ${tone.border}`,
        backgroundColor: tone.background,
        padding: spacing.scale[4],
      }}
    >
      <h4
        style={{
          ...typography.body.desktop,
          color: tone.accent,
          fontWeight: typography.fontWeight.medium,
        }}
      >
        {supervision.title}
      </h4>
      <p className="mt-2" style={{ ...typography.caption.desktop, color: colors.text.primary }}>
        {supervision.message}
      </p>
      {supervision.warnings?.length ? (
        <ul className="mt-3 space-y-1.5">
          {supervision.warnings.map((warning) => (
            <li
              key={warning}
              style={{ ...typography.caption.desktop, color: colors.text.muted }}
            >
              • {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
