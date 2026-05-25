"use client";

import { useState } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  formatCurrency,
  type RevenusExtractionData,
  type RevenusPropertyData,
} from "@/lib/lmnp/services/revenus-profile";

type RevenusPropertyCardsProps = {
  properties: RevenusPropertyData[];
  cardStyle: React.CSSProperties;
  showIncompleteWarning?: boolean;
  onConfirm: () => void;
  showConfirm?: boolean;
};

export function RevenusPropertyCards({
  properties,
  cardStyle,
  showIncompleteWarning = false,
  onConfirm,
  showConfirm = true,
}: RevenusPropertyCardsProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="w-full space-y-4">
      {showIncompleteWarning ? (
        <p
          className="mx-auto max-w-lg text-center animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
          style={{ ...typography.body.desktop, color: colors.text.secondary }}
        >
          Certaines informations restent à compléter.
        </p>
      ) : null}

      {properties.map((property, index) => {
        const expanded = expandedIds.has(property.id);
        const detectedMonths = property.months.map((entry) => entry.month);

        return (
          <section
            key={property.id}
            className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
            style={{
              ...cardStyle,
              textAlign: "left",
              animationDelay: `${index * 120}ms`,
            }}
          >
            <button
              type="button"
              className="flex w-full items-start justify-between gap-4 text-left"
              onClick={() => toggleExpanded(property.id)}
              aria-expanded={expanded}
            >
              <div className="min-w-0 flex-1">
                <p
                  style={{
                    fontFamily: typography.fontFamily.display,
                    fontSize: typography.fontSize.lg,
                    color: colors.text.primary,
                  }}
                >
                  {property.label}
                </p>
                <p className="mt-2" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
                  {formatCurrency(property.annualRevenue)} · {property.rentCount} loyer
                  {property.rentCount > 1 ? "s" : ""}
                </p>
                <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                  {detectedMonths.length} mois détectés
                  {property.detectedFees > 0
                    ? ` · ${formatCurrency(property.detectedFees)} de frais`
                    : ""}
                </p>
              </div>
              <span
                aria-hidden
                style={{
                  ...typography.caption.desktop,
                  color: colors.text.accent,
                  transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: motions.hover.card,
                }}
              >
                ▾
              </span>
            </button>

            {!expanded ? (
              <div className="mt-6 flex justify-center">
                <Button variant="secondary" onClick={() => toggleExpanded(property.id)}>
                  Voir les détails mensuels
                </Button>
              </div>
            ) : (
              <MonthlyTimeline property={property} />
            )}

            {property.hasSecurityDeposit ? (
              <div className="mt-4 flex justify-center">
                <span
                  style={{
                    ...typography.caption.desktop,
                    color: colors.text.muted,
                    padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
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
      })}

      {showConfirm ? (
        <div className="flex justify-center pt-2">
          <Button onClick={onConfirm}>Confirmer</Button>
        </div>
      ) : null}
    </div>
  );
}

function MonthlyTimeline({ property }: { property: RevenusPropertyData }) {
  return (
    <div className="mt-6 space-y-3">
      {property.months.map((entry, index) => (
        <div
          key={`${property.id}-${entry.month}`}
          className="animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
          style={{
            borderRadius: radius.md,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.primary,
            padding: `${spacing.scale[4]} ${spacing.scale[5]}`,
            animationDelay: `${index * 60}ms`,
          }}
        >
          <p
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize.base,
              color: colors.text.primary,
            }}
          >
            {entry.month}
          </p>
          <p className="mt-2" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            {formatCurrency(entry.collectedAmount)} encaissés
          </p>
          {entry.detectedFees ? (
            <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              frais détectés : {formatCurrency(entry.detectedFees)}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
