"use client";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  formatCurrency,
  type ChargesExtractionData,
} from "@/lib/lmnp/services/charges-profile";

type ChargesSummaryCardProps = {
  summary: ChargesExtractionData["summary"];
  recoveredFromOtherSteps: number;
  cardStyle: React.CSSProperties;
};

export function ChargesSummaryCard({
  summary,
  recoveredFromOtherSteps,
  cardStyle,
}: ChargesSummaryCardProps) {
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
        Synthèse intelligente
      </p>
      <p
        className="mt-3"
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize.xl,
          color: colors.text.primary,
        }}
      >
        Charges détectées :
      </p>
      <p
        className="mt-2"
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize["2xl"],
          color: colors.text.primary,
        }}
      >
        {formatCurrency(summary.totalCharges)}
      </p>
      <ul className="mx-auto mt-5 max-w-md space-y-2">
        <li style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          {summary.categoryCount} catégorie{summary.categoryCount > 1 ? "s" : ""} identifiée
          {summary.categoryCount > 1 ? "s" : ""}
        </li>
        <li style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          {formatCurrency(summary.recoverableTotal)} déductibles
        </li>
      </ul>
      {recoveredFromOtherSteps > 0 ? (
        <p
          className="mx-auto mt-5 max-w-md"
          style={{
            ...typography.caption.desktop,
            color: colors.text.muted,
            lineHeight: typography.lineHeight.ui,
          }}
        >
          Certaines charges ont été automatiquement récupérées depuis les autres étapes.
        </p>
      ) : null}
      {summary.nonRecoverableTotal > 0 ? (
        <div className="mt-5 flex justify-center">
          <span
            style={{
              ...typography.caption.desktop,
              color: colors.text.secondary,
              padding: `${spacing.scale[1]} ${spacing.scale[3]}`,
              borderRadius: radius.full,
              border: `1px solid ${colors.border.subtle}`,
              backgroundColor: colors.surface.primary,
            }}
          >
            {formatCurrency(summary.nonRecoverableTotal)} non récupérables
          </span>
        </div>
      ) : null}
    </section>
  );
}
