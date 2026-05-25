"use client";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { DossierStepItem } from "@/lib/lmnp/services/validation-profile";

type ValidationStatusCardsProps = {
  steps: DossierStepItem[];
  cardStyle: React.CSSProperties;
};

export function ValidationStatusCards({ steps, cardStyle }: ValidationStatusCardsProps) {
  return (
    <section
      className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ ...cardStyle, textAlign: "center" }}
    >
      <p
        style={{
          ...typography.caption.desktop,
          color: colors.text.accent,
          letterSpacing: typography.letterSpacing.label,
        }}
      >
        État du dossier
      </p>
      <ul className="mx-auto mt-5 grid max-w-2xl gap-2 sm:grid-cols-2">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className="animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
            style={{
              animationDelay: `${index * 80}ms`,
              borderRadius: radius.md,
              border: `1px solid ${colors.border.subtle}`,
              backgroundColor: colors.surface.primary,
              padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
              textAlign: "left",
            }}
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    step.status === "complete" ? colors.success.DEFAULT : colors.orange[300],
                }}
              />
              <span style={{ ...typography.body.desktop, color: colors.text.primary, fontSize: typography.fontSize.sm }}>
                {step.completeLabel}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
