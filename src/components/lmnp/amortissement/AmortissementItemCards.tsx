"use client";

import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  allocationLabel,
  formatCurrency,
  type ExtractedInvoice,
} from "@/lib/lmnp/services/amortissement-profile";

type AmortissementItemCardsProps = {
  invoices: ExtractedInvoice[];
  cardStyle: React.CSSProperties;
  visible?: boolean;
};

export function AmortissementItemCards({
  invoices,
  cardStyle,
  visible = true,
}: AmortissementItemCardsProps) {
  if (!visible || invoices.length === 0) return null;

  return (
    <div className="w-full space-y-3">
      <p
        className="text-center"
        style={{ ...typography.caption.desktop, color: colors.text.muted }}
      >
        Le logiciel propose automatiquement la meilleure affectation comptable.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {invoices.map((invoice, index) => (
          <article
            key={invoice.id}
            className="animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
            style={{
              ...cardStyle,
              animationDelay: `${index * 120}ms`,
              textAlign: "left",
            }}
          >
            <p
              style={{
                fontFamily: typography.fontFamily.display,
                fontSize: typography.fontSize.lg,
                color: colors.text.primary,
              }}
            >
              {invoice.label}
            </p>
            {invoice.supplier ? (
              <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                {invoice.supplier}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <MetaPill label={allocationLabel(invoice.allocation)} accent />
              {invoice.durationYears > 0 ? (
                <MetaPill label={`${invoice.durationYears} ans`} />
              ) : null}
              <MetaPill label={formatCurrency(invoice.amount)} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function MetaPill({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <span
      style={{
        ...typography.caption.desktop,
        color: accent ? colors.text.accent : colors.text.secondary,
        padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
        borderRadius: radius.full,
        border: `1px solid ${accent ? colors.orange[200] : colors.border.subtle}`,
        backgroundColor: accent ? colors.orange[50] : colors.surface.primary,
      }}
    >
      {label}
    </span>
  );
}
