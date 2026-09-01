"use client";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { formatCurrency } from "@/lib/lmnp/services/amortissement-profile";
import type { AmortissementFromChargesItem } from "@/lib/lmnp/types";

type AmortissementFromChargesSectionProps = {
  items: AmortissementFromChargesItem[];
  onEdit: (itemId: string) => void;
  cardStyle: React.CSSProperties;
};

export function AmortissementFromChargesSection({
  items,
  onEdit,
  cardStyle,
}: AmortissementFromChargesSectionProps) {
  if (!items.length) return null;

  const sageAccent = "#5c7a6b";

  return (
    <section
      className="w-full space-y-4 animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ ...cardStyle, textAlign: "left" }}
    >
      <header className="text-center">
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.accent,
            letterSpacing: typography.letterSpacing.label,
          }}
        >
          Continuité du dossier
        </p>
        <p
          className="mt-2"
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize.xl,
            color: colors.text.primary,
          }}
        >
          Éléments suggérés depuis Charges
        </p>
        <p className="mt-2" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Ces éléments ont été identifiés lors de l&apos;analyse de vos charges déductibles.
        </p>
      </header>

      <div className="space-y-3">
        {items.map((item, index) => (
          <article
            key={item.id}
            className="animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
            style={{
              borderRadius: radius.lg,
              border: `1px solid ${colors.border.subtle}`,
              boxShadow: shadows.card.default,
              padding: spacing.card.sm,
              backgroundImage: [
                `radial-gradient(ellipse 80% 50% at 100% 0%, ${colors.orange[100]}44 0%, transparent 60%)`,
                gradients.card.elevated,
              ].join(", "),
              animationDelay: `${index * 100}ms`,
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p
                  style={{
                    fontFamily: typography.fontFamily.display,
                    fontSize: typography.fontSize.lg,
                    color: colors.text.primary,
                  }}
                >
                  {item.label}
                </p>
                <p className="mt-2" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
                  {formatCurrency(item.amount)} · {item.durationYears} ans
                </p>
                <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                  {item.category}
                  {item.propertyLabel ? ` · ${item.propertyLabel}` : ""}
                </p>
              </div>
              <span
                style={{
                  ...typography.caption.desktop,
                  color: sageAccent,
                  padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
                  borderRadius: radius.full,
                  border: `1px solid ${sageAccent}44`,
                  backgroundColor: colors.surface.primary,
                  whiteSpace: "nowrap",
                }}
              >
                Ajouté depuis Charges
              </span>
            </div>
            <div className="mt-5 flex justify-center">
              <Button variant="secondary" onClick={() => onEdit(item.id)}>
                Modifier
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
