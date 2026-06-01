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
  deduplicationNotes?: string[];
  cardStyle: React.CSSProperties;
};

export function RevenusSummaryCard({
  summary,
  deduplicationNotes = [],
  cardStyle,
}: RevenusSummaryCardProps) {
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
        Revenus reconstitués :
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
      <p
        className="mx-auto mt-3 max-w-md"
        style={{ ...typography.caption.desktop, color: colors.text.muted, lineHeight: typography.lineHeight.ui }}
      >
        Suggestions issues des documents — la grille reste entièrement modifiable.
      </p>
      <ul className="mx-auto mt-5 max-w-md space-y-2">
        <li style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          {summary.rentCount} encaissement{summary.rentCount > 1 ? "s" : ""} identifié
          {summary.rentCount > 1 ? "s" : ""}
        </li>
        {summary.eventCount ? (
          <li style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            {summary.eventCount} flux financier{summary.eventCount > 1 ? "s" : ""} extrait
            {summary.eventCount > 1 ? "s" : ""}
          </li>
        ) : null}
        {summary.lowConfidenceCount ? (
          <li style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            {summary.lowConfidenceCount} événement{summary.lowConfidenceCount > 1 ? "s" : ""} à faible
            confiance (hors grille)
          </li>
        ) : null}
        {summary.totalFees > 0 ? (
          <li style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            {formatCurrency(summary.totalFees)} de frais détectés
          </li>
        ) : null}
        {summary.deduplicatedCount ? (
          <li style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            {summary.deduplicatedCount} doublon{summary.deduplicatedCount > 1 ? "s" : ""} fusionné
            {summary.deduplicatedCount > 1 ? "s" : ""}
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
      {deduplicationNotes.length > 0 ? (
        <p
          className="mx-auto mt-4 max-w-md"
          style={{ ...typography.caption.desktop, color: colors.text.muted, lineHeight: typography.lineHeight.ui }}
        >
          {deduplicationNotes[0]}
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
