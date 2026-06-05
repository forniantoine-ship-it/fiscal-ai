"use client";

import { useState } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  resolveChargeCategoryCardVisual,
  type ChargeCategoryVisualKind,
} from "@/lib/lmnp/services/charges/charge-category-presentation";
import {
  formatCurrency,
  type ChargesCategoryData,
  type ChargesExpenseLine,
  type ExpenseCategory,
} from "@/lib/lmnp/services/charges-profile";

type ChargesCategoryCardsProps = {
  categories: ChargesCategoryData[];
  cardStyle: React.CSSProperties;
  showIncompleteWarning?: boolean;
  onConfirm: () => void;
  showConfirm?: boolean;
};

export function ChargesCategoryCards({
  categories,
  cardStyle,
  showIncompleteWarning = false,
  onConfirm,
  showConfirm = true,
}: ChargesCategoryCardsProps) {
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

      {categories.map((cat, index) => {
        const expanded = expandedIds.has(cat.id);
        const visual = resolveChargeCategoryCardVisual(cat);

        return (
          <section
            key={cat.id}
            className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
            style={{
              ...cardStyle,
              textAlign: "left",
              animationDelay: `${index * 120}ms`,
              backgroundColor: visual.surfaceTint,
              borderLeft: `3px solid ${visual.accentColor}`,
              borderColor: visual.accentBorderColor,
            }}
          >
            <button
              type="button"
              className="flex w-full items-start justify-between gap-4 text-left"
              onClick={() => toggleExpanded(cat.id)}
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
                  {visual.title}
                </p>
                <p className="mt-2" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
                  {formatCurrency(cat.annualTotal)}
                </p>
                {cat.propertyLabel ? (
                  <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                    {cat.propertyLabel}
                  </p>
                ) : null}
              </div>
              <span
                aria-hidden
                style={{
                  ...typography.caption.desktop,
                  color: visual.accentColor,
                  transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: motions.hover.card,
                }}
              >
                ▾
              </span>
            </button>

            <div className="mt-3 flex flex-wrap gap-2">
              {visual.kindBadge ? (
                <CategoryKindBadge label={visual.kindBadge} kind={visual.kind} />
              ) : null}
              {visual.showRecurringBadge ? (
                <IntelligentBadge label="Charge récurrente détectée" kind={visual.kind} />
              ) : null}
              {cat.lines.some((line) => line.source && line.source !== "upload") ? (
                <IntelligentBadge label="Récupéré automatiquement" kind={visual.kind} />
              ) : null}
            </div>

            {!expanded ? (
              <div className="mt-6 flex justify-center">
                <Button variant="secondary" onClick={() => toggleExpanded(cat.id)}>
                  Voir le détail
                </Button>
              </div>
            ) : (
              <ExpenseDetailList lines={cat.lines} expenseCategory={cat.category} visualKind={visual.kind} />
            )}
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

function CategoryKindBadge({
  label,
  kind,
}: {
  label: string;
  kind: ChargeCategoryVisualKind;
}) {
  const isPropertyTax = kind === "property_tax";
  return (
    <span
      style={{
        ...typography.caption.desktop,
        color: isPropertyTax ? "#4A5568" : colors.text.accent,
        padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
        borderRadius: radius.full,
        border: `1px solid ${isPropertyTax ? "#C5D0DB" : colors.border.subtle}`,
        backgroundColor: isPropertyTax ? "#EEF1F4" : colors.surface.primary,
      }}
    >
      {label}
    </span>
  );
}

function IntelligentBadge({
  label,
  kind,
}: {
  label: string;
  kind: ChargeCategoryVisualKind;
}) {
  const isInsurance = kind === "insurance";
  return (
    <span
      style={{
        ...typography.caption.desktop,
        color: isInsurance ? colors.text.accent : colors.text.muted,
        padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
        borderRadius: radius.full,
        border: `1px solid ${isInsurance ? "#F0C4A0" : colors.border.subtle}`,
        backgroundColor: isInsurance ? "#FFF8F3" : colors.surface.primary,
      }}
    >
      {label}
    </span>
  );
}

function ExpenseDetailList({
  lines,
  expenseCategory,
  visualKind,
}: {
  lines: ChargesExpenseLine[];
  expenseCategory: ExpenseCategory;
  visualKind: ChargeCategoryVisualKind;
}) {
  return (
    <div className="mt-6 space-y-3">
      {lines.map((entry, index) => (
        <div
          key={entry.id}
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
            {entry.label}
          </p>
          <p className="mt-2" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            {formatCurrency(entry.amount)}
            {entry.date ? ` · ${entry.date}` : ""}
          </p>
          {entry.vatAmount ? (
            <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              TVA : {formatCurrency(entry.vatAmount)}
            </p>
          ) : null}
          {entry.propertyLabel ? (
            <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              Bien : {entry.propertyLabel}
            </p>
          ) : null}
          <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            {entry.recoverable ? "Charge déductible" : "Non récupérable"}
          </p>
          {expenseCategory === "insurance" && entry.recurring ? (
            <p className="mt-2" style={{ ...typography.caption.desktop, color: colors.text.accent }}>
              Charge récurrente détectée
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
