"use client";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  formatCurrency,
  formatEstimatedResult,
  type FiscalSummary,
} from "@/lib/lmnp/services/validation-profile";

type ValidationFiscalSummaryProps = {
  summary: FiscalSummary;
  cardStyle: React.CSSProperties;
};

const ROWS: { key: keyof FiscalSummary; label: string; format: (v: number) => string }[] = [
  { key: "rentalIncome", label: "Revenus locatifs", format: formatCurrency },
  { key: "detectedCharges", label: "Charges détectées", format: formatCurrency },
  { key: "calculatedAmortization", label: "Amortissements calculés", format: formatCurrency },
  { key: "estimatedFiscalResult", label: "Résultat fiscal estimé", format: formatEstimatedResult },
];

export function ValidationFiscalSummary({ summary, cardStyle }: ValidationFiscalSummaryProps) {
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
        Synthèse fiscale intelligente
      </p>
      <ul className="mx-auto mt-6 grid max-w-md gap-4">
        {ROWS.map((row, index) => (
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
              {row.format(summary[row.key])}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
