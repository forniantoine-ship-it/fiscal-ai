"use client";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { RevenueMonthlyGridRow, RevenuePropertySession } from "@/lib/lmnp/types";

type RevenusAnnualGridProps = {
  property: RevenuePropertySession;
  onRowsChange: (rows: RevenueMonthlyGridRow[]) => void;
};

const INCOME_INPUT_STYLE = {
  border: `1px solid ${colors.success.muted}`,
  backgroundColor: colors.success.surface,
  color: colors.success.DEFAULT,
} as const;

const CHARGE_INPUT_STYLE = {
  border: `1px solid ${colors.error.muted}`,
  backgroundColor: colors.error.surface,
  color: colors.error.DEFAULT,
} as const;

export function RevenusAnnualGrid({ property, onRowsChange }: RevenusAnnualGridProps) {
  function patchRow(monthKey: string, patch: Partial<RevenueMonthlyGridRow>) {
    onRowsChange(
      property.rows.map((row) => (row.monthKey === monthKey ? { ...row, ...patch } : row)),
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-y-2">
        <thead>
          <tr>
            {["Mois", "Loyers", "Autres revenus", "Charges"].map((label, index) => (
              <th
                key={label}
                className="px-3 py-2 text-left"
                style={{
                  ...typography.caption.desktop,
                  color:
                    index === 0
                      ? colors.text.muted
                      : index === 3
                        ? colors.error.DEFAULT
                        : colors.success.DEFAULT,
                  fontWeight: typography.fontWeight.medium,
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {property.rows.map((row) => (
            <tr key={row.monthKey}>
              <td
                className="px-3 py-2 align-middle"
                style={{
                  fontFamily: typography.fontFamily.display,
                  fontSize: typography.fontSize.sm,
                  color: colors.text.primary,
                }}
              >
                {row.month}
              </td>
              <td className="px-3 py-2 align-middle">
                <GridAmountInput
                  value={row.loyers}
                  onChange={(value) => patchRow(row.monthKey, { loyers: value })}
                  style={INCOME_INPUT_STYLE}
                />
              </td>
              <td className="px-3 py-2 align-middle">
                <GridAmountInput
                  value={row.autresRevenus}
                  onChange={(value) => patchRow(row.monthKey, { autresRevenus: value })}
                  style={INCOME_INPUT_STYLE}
                />
              </td>
              <td className="px-3 py-2 align-middle">
                <GridAmountInput
                  value={row.charges}
                  onChange={(value) => patchRow(row.monthKey, { charges: value })}
                  style={CHARGE_INPUT_STYLE}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GridAmountInput({
  value,
  onChange,
  style,
}: {
  value: number;
  onChange: (value: number) => void;
  style: React.CSSProperties;
}) {
  return (
    <input
      type="number"
      min={0}
      step={1}
      value={value || ""}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
      className="w-full min-w-[88px]"
      style={{
        ...typography.body.desktop,
        borderRadius: radius.sm,
        padding: `${spacing.scale[2]} ${spacing.scale[2]}`,
        ...style,
      }}
    />
  );
}
