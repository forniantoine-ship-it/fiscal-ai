"use client";

import { useMemo, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  allocationLabel,
  formatCurrency,
  type AmortissementComponent,
} from "@/lib/lmnp/services/amortissement-profile";

const CATEGORY_OPTIONS = [
  "Terrain",
  "Structure",
  "Technique",
  "Finitions",
  "Mobilier",
  "Travaux",
  "Cuisine",
  "Électroménager",
];

type AmortissementVentilationTableProps = {
  components: AmortissementComponent[];
  onChange: (components: AmortissementComponent[]) => void;
  onConfirm: () => void;
  cardStyle: React.CSSProperties;
  showConfirm?: boolean;
};

export function AmortissementVentilationTable({
  components,
  onChange,
  onConfirm,
  cardStyle,
  showConfirm = true,
}: AmortissementVentilationTableProps) {
  const [expanded, setExpanded] = useState(false);

  const visibleRows = useMemo(
    () => components.filter((row) => row.allocation !== "charge-immediate"),
    [components],
  );

  function patchRow(id: string, patch: Partial<AmortissementComponent>) {
    onChange(
      components.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.amount !== undefined || patch.durationYears !== undefined || patch.allocation) {
          next.annualAmortization =
            next.allocation === "immobilisation" && next.durationYears > 0
              ? Math.round(next.amount / next.durationYears)
              : 0;
        }
        if (next.allocation === "non-amortizable") {
          next.durationYears = 0;
          next.annualAmortization = 0;
        }
        return next;
      }),
    );
  }

  function removeRow(id: string) {
    onChange(components.filter((row) => row.id !== id));
  }

  function addRow() {
    onChange([
      ...components,
      {
        id: crypto.randomUUID(),
        label: "Nouveau composant",
        category: "Travaux",
        ventilationPercent: 0,
        amount: 0,
        durationYears: 10,
        annualAmortization: 0,
        allocation: "immobilisation",
        source: "dossier",
      },
    ]);
  }

  return (
    <section
      className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ ...cardStyle, textAlign: "left" }}
    >
      <div className="text-center">
        <p
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize.xl,
            color: colors.text.primary,
          }}
        >
          Ventilation préparée
        </p>
        <p className="mt-2" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Ajustez si nécessaire — le logiciel conserve la continuité comptable en arrière-plan.
        </p>
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              {["Composants", "Ventilation €", "Durée", "Amortissement annuel"].map((header) => (
                <th
                  key={header}
                  className="pb-3 text-left"
                  style={{
                    ...typography.caption.desktop,
                    color: colors.text.muted,
                    fontWeight: typography.fontWeight.regular,
                    borderBottom: `1px solid ${colors.border.subtle}`,
                  }}
                >
                  {header}
                </th>
              ))}
              <th className="pb-3" style={{ borderBottom: `1px solid ${colors.border.subtle}` }} />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <Cell>
                  <InlineInput
                    value={row.label}
                    onChange={(value) => patchRow(row.id, { label: value })}
                  />
                  <InlineSelect
                    value={row.category}
                    options={CATEGORY_OPTIONS}
                    onChange={(value) => patchRow(row.id, { category: value })}
                  />
                </Cell>
                <Cell>
                  <InlineInput
                    value={String(row.amount)}
                    type="number"
                    onChange={(value) => patchRow(row.id, { amount: Number(value) || 0 })}
                  />
                </Cell>
                <Cell>
                  {row.allocation === "non-amortizable" ? (
                    <span style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                      —
                    </span>
                  ) : (
                    <InlineInput
                      value={String(row.durationYears)}
                      type="number"
                      onChange={(value) =>
                        patchRow(row.id, { durationYears: Number(value) || 0 })
                      }
                    />
                  )}
                </Cell>
                <Cell>
                  <span style={{ ...typography.body.desktop, color: colors.text.primary }}>
                    {row.allocation === "non-amortizable"
                      ? "Non amortissable"
                      : formatCurrency(row.annualAmortization)}
                  </span>
                </Cell>
                <Cell align="right">
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    style={{ ...typography.caption.desktop, color: colors.text.muted }}
                  >
                    Supprimer
                  </button>
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          style={{
            ...typography.caption.desktop,
            color: colors.text.muted,
            textDecoration: "underline",
            textUnderlineOffset: "3px",
          }}
        >
          {expanded ? "Masquer les détails comptables" : "Afficher les détails comptables"}
        </button>
        <Button variant="secondary" onClick={addRow}>
          Ajouter un composant
        </Button>
      </div>

      {expanded ? (
        <div
          className="mt-4 space-y-2 animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
          style={{
            borderRadius: radius.md,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.inset,
            padding: spacing.scale[4],
          }}
        >
          {visibleRows.map((row) => (
            <p key={`${row.id}-advanced`} style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              {row.label} · {allocationLabel(row.allocation)}
              {row.vnc !== undefined ? ` · VNC ${formatCurrency(row.vnc)}` : ""}
              {row.remainingYears !== undefined ? ` · ${row.remainingYears} ans restants` : ""}
            </p>
          ))}
        </div>
      ) : null}

      {showConfirm ? (
        <div className="mt-8 flex justify-center">
          <Button onClick={onConfirm}>Confirmer</Button>
        </div>
      ) : null}
    </section>
  );
}

function Cell({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className="py-3 align-top"
      style={{
        borderBottom: `1px solid ${colors.border.subtle}`,
        textAlign: align,
      }}
    >
      {children}
    </td>
  );
}

function InlineInput({
  value,
  onChange,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="w-full outline-none"
      style={{
        ...typography.body.desktop,
        fontSize: typography.fontSize.sm,
        color: colors.text.primary,
        backgroundColor: focused ? colors.surface.primary : "transparent",
        border: `1px solid ${focused ? colors.border.focus : "transparent"}`,
        borderRadius: radius.sm,
        padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
        transition: motions.hover.card,
      }}
    />
  );
}

function InlineSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="mt-1 w-full outline-none"
      style={{
        ...typography.caption.desktop,
        color: colors.text.muted,
        backgroundColor: "transparent",
        border: "none",
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
