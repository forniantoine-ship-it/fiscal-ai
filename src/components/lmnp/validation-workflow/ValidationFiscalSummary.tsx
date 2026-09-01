"use client";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  buildValidationFiscalDisplay,
  type FiscalSummary,
} from "@/lib/lmnp/services/validation-profile";
import type { FiscalEngineOutput } from "@/lib/lmnp/types";

type ValidationFiscalSummaryProps = {
  summary: FiscalSummary;
  /** FiscalResult (F-006) réellement recalculé par la porte de génération — quand
   *  présent, remplace intégralement `summary` (jamais un mélange des deux). */
  fiscalResult?: FiscalEngineOutput;
  cardStyle: React.CSSProperties;
};

export function ValidationFiscalSummary({ summary, fiscalResult, cardStyle }: ValidationFiscalSummaryProps) {
  const display = buildValidationFiscalDisplay(fiscalResult, summary);

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
        {display.exact ? "Résultat fiscal calculé" : "Synthèse fiscale intelligente"}
      </p>
      <ul className="mx-auto mt-6 grid max-w-md gap-4">
        {display.rows.map((row, index) => (
          <li
            key={row.key}
            className="animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
            style={{
              animationDelay: `${index * 100}ms`,
              borderRadius: radius.md,
              border: `1px solid ${colors.border.subtle}`,
              backgroundColor: colors.surface.primary,
              padding: `${spacing.scale[4]} ${spacing.scale[5]}`,
            }}
          >
            <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>{row.label}</p>
            <p
              className="mt-1 tabular-nums"
              style={{
                fontFamily: typography.fontFamily.display,
                fontSize: typography.fontSize.xl,
                color: colors.text.primary,
              }}
            >
              {row.format(row.value)}
            </p>
          </li>
        ))}
      </ul>
      {display.exact ? (
        <p className="mx-auto mt-4 max-w-md" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          Ce résultat est celui qui sera utilisé pour générer votre déclaration.
        </p>
      ) : null}
    </section>
  );
}
