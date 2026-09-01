"use client";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

export type ConfiguredSummaryRow = {
  label: string;
  value: string;
};

type ConfiguredDossierCardProps = {
  title: string;
  rows: ConfiguredSummaryRow[];
  footnote?: string;
  onEdit: () => void;
};

function SummaryRow({ label, value }: ConfiguredSummaryRow) {
  return (
    <div
      className="grid gap-1 sm:grid-cols-[minmax(0,11rem)_1fr] sm:items-baseline sm:gap-6"
      style={{ paddingBlock: spacing.scale[3] }}
    >
      <p style={{ ...typography.caption.desktop, color: colors.success.muted }}>{label}</p>
      <p
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize.lg,
          fontWeight: typography.fontWeight.regular,
          color: colors.text.primary,
          lineHeight: typography.lineHeight.relaxed,
        }}
      >
        {value}
      </p>
    </div>
  );
}

export function ConfiguredDossierCard({ title, rows, footnote, onEdit }: ConfiguredDossierCardProps) {
  return (
    <section
      className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{
        borderRadius: radius.xl,
        border: `1px solid ${colors.success.border}`,
        backgroundImage: gradients.workflow.success,
        boxShadow: shadows.card.default,
        padding: spacing.card.lg,
      }}
    >
      <header className="text-center">
        <h2
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize["2xl"],
            fontWeight: typography.fontWeight.regular,
            color: colors.success.DEFAULT,
            lineHeight: typography.lineHeight.title,
          }}
        >
          {title}
        </h2>
      </header>

      <div
        className="mx-auto mt-8 max-w-xl"
        style={{
          borderRadius: radius.lg,
          border: `1px solid ${colors.success.border}`,
          backgroundColor: colors.surface.primary,
          padding: `${spacing.scale[2]} ${spacing.scale[5]}`,
        }}
      >
        {rows.map((row, index) => (
          <div
            key={row.label}
            style={{
              borderBottom:
                index < rows.length - 1 ? `1px solid ${colors.border.subtle}` : undefined,
            }}
          >
            <SummaryRow label={row.label} value={row.value} />
          </div>
        ))}
      </div>

      {footnote ? (
        <p
          className="mt-5 text-center"
          style={{ ...typography.caption.desktop, color: colors.text.muted }}
        >
          {footnote}
        </p>
      ) : null}

      <div className="mt-8 flex justify-center">
        <Button variant="secondary" onClick={onEdit}>
          Modifier
        </Button>
      </div>
    </section>
  );
}
