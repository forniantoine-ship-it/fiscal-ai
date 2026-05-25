"use client";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  formatCurrency,
  type RevenusExtractionData,
} from "@/lib/lmnp/services/revenus-profile";

type RevenusSummaryCardProps = {
  summary: RevenusExtractionData["summary"];
  cardStyle: React.CSSProperties;
};

export function RevenusSummaryCard({ summary, cardStyle }: RevenusSummaryCardProps) {
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
        Revenus détectés :
      </p>
      <p
        className="mt-2"
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize["2xl"],
          color: colors.text.primary,
        }}
      >
        {formatCurrency(summary.totalRevenue)}
      </p>
      <ul className="mx-auto mt-5 max-w-md space-y-2">
        <li style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          {summary.rentCount} loyer{summary.rentCount > 1 ? "s" : ""} identifié
          {summary.rentCount > 1 ? "s" : ""}
        </li>
        {summary.totalFees > 0 ? (
          <li style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            {formatCurrency(summary.totalFees)} de frais détectés
          </li>
        ) : null}
      </ul>
      {summary.totalFees > 0 ? (
        <p
          className="mx-auto mt-5 max-w-md"
          style={{ ...typography.caption.desktop, color: colors.text.muted, lineHeight: typography.lineHeight.ui }}
        >
          Les frais détectés seront automatiquement ajoutés à l&apos;étape Charges.
        </p>
      ) : null}
      {summary.hasSecurityDeposit ? (
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
            Dépôt de garantie détecté (non imposable)
          </span>
        </div>
      ) : null}
    </section>
  );
}
