/**
 * Presentation mapping for charge category cards (UI only).
 * Source of truth for titles and badges is ExpenseCategory, not parser labels.
 */

import type { ChargesCategoryData, ChargesExpenseLine, ExpenseCategory } from "../../types";
import { colors } from "@/design-system/theme/colors";
import { categoryLabel } from "../charges-profile";

export type ChargeCategoryVisualKind =
  | "insurance"
  | "property_tax"
  | "condo"
  | "works"
  | "default";

export type ChargeCategoryCardVisual = {
  kind: ChargeCategoryVisualKind;
  title: string;
  accentColor: string;
  accentBorderColor: string;
  surfaceTint: string;
  kindBadge: string | null;
  showRecurringBadge: boolean;
};

const KIND_BADGE: Partial<Record<ExpenseCategory, string>> = {
  property_tax: "Charge fiscale",
  insurance: "Assurance habitation",
};

export function chargeCategoryVisualKind(category: ExpenseCategory): ChargeCategoryVisualKind {
  switch (category) {
    case "insurance":
      return "insurance";
    case "property_tax":
      return "property_tax";
    case "condo":
      return "condo";
    case "works_deductible":
      return "works";
    default:
      return "default";
  }
}

const CARD_TITLES: Partial<Record<ExpenseCategory, string>> = {
  property_tax: "Taxe foncière",
  insurance: "Assurance habitation",
  condo: "Charges copropriété",
  works_deductible: "Travaux déductibles",
};

/** Card title — always derived from expense category, never stale parser labels. */
export function resolveChargeCategoryTitle(category: ExpenseCategory): string {
  return CARD_TITLES[category] ?? categoryLabel(category);
}

export function resolveChargeCategoryRecurring(cat: ChargesCategoryData): boolean {
  return cat.category === "insurance" && Boolean(cat.recurring);
}

export function resolveChargeCategoryCardVisual(cat: ChargesCategoryData): ChargeCategoryCardVisual {
  const kind = chargeCategoryVisualKind(cat.category);

  if (kind === "property_tax") {
    return {
      kind,
      title: resolveChargeCategoryTitle(cat.category),
      accentColor: colors.text.primary,
      accentBorderColor: colors.border.default,
      surfaceTint: colors.surface.secondary,
      kindBadge: KIND_BADGE.property_tax ?? null,
      showRecurringBadge: false,
    };
  }

  if (kind === "insurance") {
    return {
      kind,
      title: resolveChargeCategoryTitle(cat.category),
      accentColor: colors.text.primary,
      accentBorderColor: colors.border.selected,
      surfaceTint: colors.surface.secondary,
      kindBadge: KIND_BADGE.insurance ?? null,
      showRecurringBadge: resolveChargeCategoryRecurring(cat),
    };
  }

  return {
    kind,
    title: resolveChargeCategoryTitle(cat.category),
    accentColor: colors.text.secondary,
    accentBorderColor: colors.border.default,
    surfaceTint: colors.surface.primary,
    kindBadge: KIND_BADGE[cat.category] ?? null,
    showRecurringBadge: false,
  };
}

/** Re-hydrates persisted extraction rows for display without touching parsers. */
export function hydrateChargeCategoryPresentation(cat: ChargesCategoryData): ChargesCategoryData {
  const visual = resolveChargeCategoryCardVisual(cat);
  const lines = cat.lines.map((line) => hydrateChargeExpenseLinePresentation(line, cat.category));

  return {
    ...cat,
    label: visual.title,
    recurring: visual.showRecurringBadge,
    lines,
  };
}

export function hydrateChargeExpenseLinePresentation(
  line: ChargesExpenseLine,
  category: ExpenseCategory,
): ChargesExpenseLine {
  return {
    ...line,
    recurring: category === "insurance" ? Boolean(line.recurring) : false,
  };
}

export function hydrateChargesCategoriesForPresentation(
  categories: ChargesCategoryData[],
): ChargesCategoryData[] {
  return categories.map(hydrateChargeCategoryPresentation);
}
