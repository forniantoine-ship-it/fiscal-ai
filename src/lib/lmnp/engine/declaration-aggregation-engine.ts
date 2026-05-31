/**
 * LMNP Business Engine — Layer 6: Declaration Aggregation Engine
 *
 * Aggregates BusinessAssets and fiscal decisions from all properties
 * into a single FiscalDeclaration — the final accounting output for
 * the LMNP annual declaration.
 *
 * Architecture supports:
 *   1 declaration → N properties → M assets each
 *
 * While preserving:
 *   - per-property visibility (user can inspect each property separately)
 *   - per-asset traceability (user can always trace back to source invoices)
 *   - global totals (for the actual declaration form)
 */

import type {
  AccountingCategory,
  AmortizationSchedule,
  BusinessAsset,
  FiscalDeclaration,
  FiscalDecision,
  PropertyFiscalSummary,
} from "./business-engine.types";
import type { Property } from "../types";
import { buildAmortizationSchedule, getAnnualAmortizationForYear } from "./business-asset-engine";
import { applyFiscalDecision } from "./fiscal-decision-engine";

// ---------------------------------------------------------------------------
// Per-property summary builder
// ---------------------------------------------------------------------------

/**
 * Builds a PropertyFiscalSummary for a single property.
 * Filters assets and decisions to only those belonging to the property.
 */
export function buildPropertyFiscalSummary(
  property: Property,
  allAssets: BusinessAsset[],
  allDecisions: FiscalDecision[],
): PropertyFiscalSummary {
  const propertyAssets = allAssets.filter(
    (a) => a.propertyId === property.id || (!a.propertyId && allAssets.length === 1),
  );
  const propertyDecisions = allDecisions.filter((d) =>
    propertyAssets.some((a) => a.id === d.assetId),
  );

  const annualAmortization = propertyDecisions.reduce(
    (sum, d) => sum + d.annualAmortization,
    0,
  );
  const totalCharges = propertyAssets
    .filter((a) => a.fiscalTreatment === "charge")
    .reduce((sum, a) => sum + a.amount, 0);
  const totalImmobilisations = propertyAssets
    .filter((a) => a.fiscalTreatment === "immobilisation")
    .reduce((sum, a) => sum + a.amount, 0);

  return {
    propertyId: property.id,
    propertyLabel: property.label,
    assets: propertyAssets,
    decisions: propertyDecisions,
    annualAmortization,
    totalCharges,
    totalImmobilisations,
  };
}

// ---------------------------------------------------------------------------
// Charge items (non-immobilization deductions)
// ---------------------------------------------------------------------------

export interface ChargeItem {
  id: string;
  propertyId?: string;
  label: string;
  amount: number;
  category: AccountingCategory;
  annualAmount: number;
  sourceAssetId: string;
}

function assetsToChargeItems(assets: BusinessAsset[]): ChargeItem[] {
  return assets
    .filter((a) => a.fiscalTreatment === "charge")
    .map((a) => ({
      id: `charge-${a.id}`,
      propertyId: a.propertyId,
      label: a.label,
      amount: a.amount,
      category: a.category,
      annualAmount: a.amount,
      sourceAssetId: a.id,
    }));
}

// ---------------------------------------------------------------------------
// Main builder — buildFiscalDeclaration
// ---------------------------------------------------------------------------

interface BuildFiscalDeclarationOptions {
  dossierId: string;
  fiscalYear: number;
  regime?: "reel" | "micro-bic";
  properties: Property[];
  confirmedAssets: BusinessAsset[];
  /**
   * Optional total revenue for the fiscal year.
   * Used to compute net result = revenue - charges - amortization.
   */
  totalRevenue?: number;
}

/**
 * Builds the complete FiscalDeclaration from all confirmed assets across
 * all properties.
 *
 * This is the authoritative accounting output — call this once all assets
 * are confirmed and validated by the user.
 */
export function buildFiscalDeclaration(
  options: BuildFiscalDeclarationOptions,
): FiscalDeclaration {
  const {
    dossierId,
    fiscalYear,
    regime = "reel",
    properties,
    confirmedAssets,
    totalRevenue = 0,
  } = options;

  const now = new Date().toISOString();

  // Apply fiscal decisions to all assets
  const fiscalDecisions: FiscalDecision[] = confirmedAssets.map(applyFiscalDecision);

  // Build amortization schedules for immobilised assets
  const amortizationSchedules: AmortizationSchedule[] = confirmedAssets
    .filter((a) => a.fiscalTreatment === "immobilisation")
    .map(buildAmortizationSchedule);

  // Per-property breakdowns
  const byProperty: PropertyFiscalSummary[] = properties.map((property) =>
    buildPropertyFiscalSummary(property, confirmedAssets, fiscalDecisions),
  );

  // Global totals
  const totalAnnualAmortization = fiscalDecisions.reduce(
    (sum, d) => sum + getAnnualAmortizationForYear(
      confirmedAssets.find((a) => a.id === d.assetId)!,
      fiscalYear,
    ),
    0,
  );

  const totalCharges = confirmedAssets
    .filter((a) => a.fiscalTreatment === "charge")
    .reduce((sum, a) => sum + a.amount, 0);

  const netResult = totalRevenue - totalCharges - totalAnnualAmortization;

  return {
    id: `decl-${crypto.randomUUID()}`,
    dossierId,
    fiscalYear,
    regime,
    propertyIds: properties.map((p) => p.id),
    businessAssets: confirmedAssets,
    fiscalDecisions,
    amortizationSchedules,
    byProperty,
    totals: {
      totalRevenue,
      totalCharges,
      totalAnnualAmortization,
      netResult,
    },
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Aggregation helpers — per-category, per-property views
// ---------------------------------------------------------------------------

export interface CategoryAggregation {
  category: AccountingCategory;
  labelFr: string;
  assetCount: number;
  totalAmount: number;
  annualAmortization: number;
  assets: BusinessAsset[];
}

const CATEGORY_LABELS_FR_LOCAL: Record<AccountingCategory, string> = {
  immeuble: "Immeuble",
  travaux: "Travaux",
  mobilier: "Mobilier",
  electromenager: "Électroménager",
  cuisine: "Cuisine",
  assurance: "Assurance",
  taxe_fonciere: "Taxe foncière",
  autre: "Autre",
};

/**
 * Groups a declaration's assets and decisions by category.
 * Used by the declaration summary view.
 */
export function aggregateByCategory(declaration: FiscalDeclaration): CategoryAggregation[] {
  const map = new Map<AccountingCategory, CategoryAggregation>();

  for (const asset of declaration.businessAssets) {
    const existing = map.get(asset.category);
    const decision = declaration.fiscalDecisions.find((d) => d.assetId === asset.id);

    if (existing) {
      existing.assetCount++;
      existing.totalAmount += asset.amount;
      existing.annualAmortization += decision?.annualAmortization ?? 0;
      existing.assets.push(asset);
    } else {
      map.set(asset.category, {
        category: asset.category,
        labelFr: CATEGORY_LABELS_FR_LOCAL[asset.category],
        assetCount: 1,
        totalAmount: asset.amount,
        annualAmortization: decision?.annualAmortization ?? 0,
        assets: [asset],
      });
    }
  }

  // Sort: immobilisations first, then by total amount
  return [...map.values()].sort((a, b) => b.annualAmortization - a.annualAmortization);
}

/**
 * Returns a concise French-language summary of the declaration.
 * Used in the dashboard hero card and email summaries.
 */
export function buildDeclarationSummaryText(declaration: FiscalDeclaration): string {
  const { totals, propertyIds, businessAssets } = declaration;
  const propertyCount = propertyIds.length;
  const assetCount = businessAssets.length;

  const fmtEur = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

  const parts: string[] = [];

  parts.push(
    `Déclaration LMNP ${declaration.fiscalYear} — ` +
    `${propertyCount} bien${propertyCount > 1 ? "s" : ""}, ` +
    `${assetCount} actif${assetCount > 1 ? "s" : ""}.`,
  );

  if (totals.totalAnnualAmortization > 0) {
    parts.push(
      `Amortissements annuels : ${fmtEur.format(totals.totalAnnualAmortization)}.`,
    );
  }
  if (totals.totalCharges > 0) {
    parts.push(`Charges déductibles : ${fmtEur.format(totals.totalCharges)}.`);
  }
  if (totals.totalRevenue > 0) {
    parts.push(`Résultat estimé : ${fmtEur.format(totals.netResult)}.`);
  }

  return parts.join(" ");
}

/**
 * Returns a completeness check for the declaration.
 * Shows what's missing before the user can generate the final declaration.
 */
export function checkDeclarationReadiness(declaration: FiscalDeclaration): {
  isReady: boolean;
  missingItems: string[];
  warnings: string[];
} {
  const missingItems: string[] = [];
  const warnings: string[] = [];

  const unvalidatedAssets = declaration.businessAssets.filter((a) => !a.userValidated);
  if (unvalidatedAssets.length > 0) {
    missingItems.push(
      `${unvalidatedAssets.length} actif${unvalidatedAssets.length > 1 ? "s" : ""} en attente de validation`,
    );
  }

  if (declaration.totals.totalRevenue === 0) {
    warnings.push("Les revenus locatifs n'ont pas encore été renseignés.");
  }

  if (declaration.businessAssets.length === 0) {
    missingItems.push("Aucun actif confirmé — vérifiez vos documents d'amortissement.");
  }

  const uncategorized = declaration.businessAssets.filter((a) => a.category === "autre");
  if (uncategorized.length > 0) {
    warnings.push(
      `${uncategorized.length} actif${uncategorized.length > 1 ? "s" : ""} classé${uncategorized.length > 1 ? "s" : ""} en "Autre" — vérification recommandée.`,
    );
  }

  return {
    isReady: missingItems.length === 0,
    missingItems,
    warnings,
  };
}
