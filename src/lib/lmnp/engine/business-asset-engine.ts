/**
 * LMNP Business Engine — Layer 3: Business Asset Engine
 *
 * Converts confirmed WorkGroups into BusinessAssets — the real accounting
 * source of truth for the LMNP declaration.
 *
 * A BusinessAsset represents an economic reality:
 *   "Cuisine équipée SCHMIDT" (3 invoices, 12 430 €, 10 ans)
 * Not:
 *   "Facture SCHMIDT du 12 mars" (individual document)
 */

import type {
  AccountingCategory,
  AmortizationSchedule,
  AmortizationScheduleRow,
  BusinessAsset,
  FiscalTreatmentType,
  WorkGroup,
} from "./business-engine.types";

// ---------------------------------------------------------------------------
// Fiscal treatment rules — V1 model
// ---------------------------------------------------------------------------

/** Categories that are always deducted as operating charges (never immobilized). */
const ALWAYS_CHARGE_CATEGORIES = new Set<AccountingCategory>([
  "assurance",
  "taxe_fonciere",
]);

/**
 * Minimum amount (TTC) to be considered as an immobilizable asset.
 * Below this threshold, the engine proposes "charge immédiate" even for
 * categories that would normally be immobilized.
 */
const IMMOBILISATION_AMOUNT_THRESHOLD = 500;

/** Default amortization durations by category (V1 — simple model). */
export const CATEGORY_AMORTIZATION_YEARS: Record<AccountingCategory, number> = {
  immeuble: 30,
  travaux: 12,
  mobilier: 7,
  electromenager: 6,
  cuisine: 10,
  assurance: 0,
  taxe_fonciere: 0,
  autre: 10,
};

/** Friendly French category labels for UI display. */
export const CATEGORY_LABELS_FR: Record<AccountingCategory, string> = {
  immeuble: "Immeuble",
  travaux: "Travaux",
  mobilier: "Mobilier",
  electromenager: "Électroménager",
  cuisine: "Cuisine",
  assurance: "Assurance",
  taxe_fonciere: "Taxe foncière",
  autre: "Autre",
};

// ---------------------------------------------------------------------------
// Fiscal treatment decision
// ---------------------------------------------------------------------------

/**
 * Decides the fiscal treatment for an asset based on:
 * 1. Category (some are always charges)
 * 2. Total amount (below threshold → charge)
 * 3. Economic nature (improvements vs maintenance)
 */
export function decideFiscalTreatment(
  category: AccountingCategory,
  totalAmount: number,
): FiscalTreatmentType {
  if (ALWAYS_CHARGE_CATEGORIES.has(category)) return "charge";
  if (totalAmount < IMMOBILISATION_AMOUNT_THRESHOLD) return "charge";
  return "immobilisation";
}

/**
 * Resolves the amortization duration for a given category.
 * Returns 0 for charge-only categories.
 */
export function resolveAmortizationYears(
  category: AccountingCategory,
  treatment: FiscalTreatmentType,
  overrideDurationYears?: number,
): number {
  if (treatment === "charge") return 0;
  if (overrideDurationYears && overrideDurationYears > 0) return overrideDurationYears;
  return CATEGORY_AMORTIZATION_YEARS[category] ?? 10;
}

// ---------------------------------------------------------------------------
// Amortization start date resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the amortization start date from the invoices in a group.
 * Uses the latest invoice date (last invoice = project completion).
 * Falls back to today if no dates are available.
 */
function resolveAmortizationStartDate(group: WorkGroup): string {
  const dates = group.invoices
    .map((inv) => inv.invoiceDate)
    .filter(Boolean)
    .map((d) => Date.parse(d!))
    .filter((t) => !isNaN(t));

  if (dates.length === 0) {
    return new Date().toISOString().split("T")[0];
  }

  // Latest date = project completion
  const latest = Math.max(...dates);
  return new Date(latest).toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Asset label inference
// ---------------------------------------------------------------------------

/**
 * Generates a human-readable asset label from the WorkGroup.
 * Combines the detected project name with the supplier when available.
 */
function inferAssetLabel(group: WorkGroup): string {
  return group.detectedProjectLabel;
}

// ---------------------------------------------------------------------------
// WorkGroup → BusinessAsset conversion
// ---------------------------------------------------------------------------

/**
 * Converts a confirmed WorkGroup into a BusinessAsset.
 *
 * The group MUST be in "confirmed" status — call confirmWorkGroup() first.
 * Throws if called on a proposed/rejected group.
 */
export function workGroupToBusinessAsset(
  group: WorkGroup,
  overrides?: {
    label?: string;
    durationYears?: number;
    amortizationStartDate?: string;
  },
): BusinessAsset {
  if (group.status !== "confirmed") {
    throw new Error(
      `WorkGroup ${group.id} is not confirmed (status: ${group.status}). Confirm the group before converting to BusinessAsset.`,
    );
  }

  const now = new Date().toISOString();
  const treatment = decideFiscalTreatment(group.dominantCategory, group.totalAmount);
  const durationYears = resolveAmortizationYears(
    group.dominantCategory,
    treatment,
    overrides?.durationYears ?? group.proposedDurationYears,
  );
  const amortizationStartDate =
    overrides?.amortizationStartDate ?? resolveAmortizationStartDate(group);
  const label = overrides?.label ?? inferAssetLabel(group);
  const explanation = buildAssetExplanation(
    group.dominantCategory,
    group.totalAmount,
    treatment,
    durationYears,
    group.invoices.length,
  );

  return {
    id: `asset-${crypto.randomUUID()}`,
    label,
    propertyId: group.propertyId,
    sourceWorkGroupIds: [group.id],
    sourceDocumentIds: group.invoices.map((inv) => inv.documentId),
    category: group.dominantCategory,
    amount: group.totalAmount,
    amortizationYears: durationYears,
    amortizationStartDate,
    fiscalTreatment: treatment,
    explanation,
    userValidated: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Merge multiple confirmed WorkGroups into a single BusinessAsset.
 * Used when the user decides to combine separately confirmed groups
 * (e.g. two kitchen phases from different suppliers).
 */
export function mergeWorkGroupsToBusinessAsset(
  groups: WorkGroup[],
  label: string,
  overrides?: {
    durationYears?: number;
    amortizationStartDate?: string;
    category?: AccountingCategory;
  },
): BusinessAsset {
  if (groups.some((g) => g.status !== "confirmed")) {
    throw new Error("All WorkGroups must be confirmed before merging.");
  }
  if (groups.length === 0) {
    throw new Error("Cannot merge zero groups.");
  }

  const now = new Date().toISOString();
  const totalAmount = groups.reduce((sum, g) => sum + g.totalAmount, 0);

  // Resolve dominant category across all groups by total amount
  const categoryTotals: Partial<Record<AccountingCategory, number>> = {};
  for (const g of groups) {
    categoryTotals[g.dominantCategory] = (categoryTotals[g.dominantCategory] ?? 0) + g.totalAmount;
  }
  const dominantCategory =
    overrides?.category ??
    (Object.entries(categoryTotals).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0][0] as AccountingCategory);

  const treatment = decideFiscalTreatment(dominantCategory, totalAmount);
  const durationYears = resolveAmortizationYears(dominantCategory, treatment, overrides?.durationYears);

  const allFacts = groups.flatMap((g) => g.invoices);
  const latestDate =
    overrides?.amortizationStartDate ??
    allFacts
      .map((f) => f.invoiceDate)
      .filter(Boolean)
      .sort()
      .reverse()[0] ??
    now.split("T")[0];

  const explanation = buildAssetExplanation(
    dominantCategory,
    totalAmount,
    treatment,
    durationYears,
    allFacts.length,
  );

  return {
    id: `asset-${crypto.randomUUID()}`,
    label,
    propertyId: groups[0].propertyId,
    sourceWorkGroupIds: groups.map((g) => g.id),
    sourceDocumentIds: allFacts.map((f) => f.documentId),
    category: dominantCategory,
    amount: totalAmount,
    amortizationYears: durationYears,
    amortizationStartDate: latestDate,
    fiscalTreatment: treatment,
    explanation,
    userValidated: false,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Explanation builder (plain French)
// ---------------------------------------------------------------------------

function buildAssetExplanation(
  category: AccountingCategory,
  amount: number,
  treatment: FiscalTreatmentType,
  durationYears: number,
  invoiceCount: number,
): string {
  const formattedAmount = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);

  const categoryFr = CATEGORY_LABELS_FR[category];

  if (treatment === "charge") {
    if (category === "assurance") {
      return `Assurance : charge déductible de l'exercice (${formattedAmount}).`;
    }
    if (category === "taxe_fonciere") {
      return `Taxe foncière : charge déductible de l'exercice (${formattedAmount}).`;
    }
    return `Dépense classée en charge immédiate (${formattedAmount}). Le montant est inférieur au seuil d'immobilisation ou correspond à une dépense d'entretien courant.`;
  }

  const invoiceFr = invoiceCount > 1 ? `${invoiceCount} factures regroupées` : "1 facture";
  return `Immobilisation ${categoryFr} — ${invoiceFr} — ${formattedAmount} amortis sur ${durationYears} ans. Ce bien durable améliore durablement la valeur du logement meublé.`;
}

// ---------------------------------------------------------------------------
// Layer 5 — Amortization schedule generation
// ---------------------------------------------------------------------------

/**
 * Generates the full amortization schedule for a BusinessAsset.
 * Returns one row per fiscal year from start date to end of amortization.
 */
export function buildAmortizationSchedule(asset: BusinessAsset): AmortizationSchedule {
  if (asset.fiscalTreatment === "charge" || asset.amortizationYears === 0) {
    return {
      assetId: asset.id,
      assetLabel: asset.label,
      category: asset.category,
      startDate: asset.amortizationStartDate,
      totalAmount: asset.amount,
      durationYears: 0,
      annualAmortization: 0,
      rows: [],
    };
  }

  const annualAmortization = Math.round(asset.amount / asset.amortizationYears);
  const startYear = new Date(asset.amortizationStartDate).getFullYear();
  const rows: AmortizationScheduleRow[] = [];
  let vnc = asset.amount;

  for (let i = 0; i < asset.amortizationYears; i++) {
    const year = startYear + i;
    const amort = i === asset.amortizationYears - 1
      ? vnc // last year: absorb rounding
      : annualAmortization;

    rows.push({
      year,
      openingVNC: vnc,
      annualAmortization: amort,
      closingVNC: Math.max(0, vnc - amort),
      isPracticed: false,
    });

    vnc = Math.max(0, vnc - amort);
    if (vnc === 0) break;
  }

  return {
    assetId: asset.id,
    assetLabel: asset.label,
    category: asset.category,
    startDate: asset.amortizationStartDate,
    totalAmount: asset.amount,
    durationYears: asset.amortizationYears,
    annualAmortization,
    rows,
  };
}

/**
 * Returns the annual amortization for a specific fiscal year.
 * Returns 0 if the asset is a charge or not yet started.
 */
export function getAnnualAmortizationForYear(
  asset: BusinessAsset,
  fiscalYear: number,
): number {
  if (asset.fiscalTreatment === "charge" || asset.amortizationYears === 0) return 0;
  const startYear = new Date(asset.amortizationStartDate).getFullYear();
  const endYear = startYear + asset.amortizationYears - 1;
  if (fiscalYear < startYear || fiscalYear > endYear) return 0;
  return Math.round(asset.amount / asset.amortizationYears);
}

// ---------------------------------------------------------------------------
// BusinessEngineResult builder
// ---------------------------------------------------------------------------

import type { BusinessEngineResult, ExtractedAccountingFact } from "./business-engine.types";
import { applyFiscalDecision } from "./fiscal-decision-engine";

/**
 * Builds the full BusinessEngineResult for a given property / fiscal year.
 * Combine WorkGroup proposals and confirmed assets into one structured output.
 */
export function buildBusinessEngineResult(
  facts: ExtractedAccountingFact[],
  workGroups: WorkGroup[],
  confirmedAssets: BusinessAsset[],
  propertyId?: string,
): BusinessEngineResult {
  const fiscalDecisions = confirmedAssets.map(applyFiscalDecision);
  const schedules = confirmedAssets
    .filter((a) => a.fiscalTreatment === "immobilisation")
    .map(buildAmortizationSchedule);

  const pendingGroupProposals = workGroups.filter((g) => g.status === "proposed").length;
  const pendingUserValidation = confirmedAssets.filter((a) => !a.userValidated).length;

  const totalImmobilisations = confirmedAssets
    .filter((a) => a.fiscalTreatment === "immobilisation")
    .reduce((sum, a) => sum + a.amount, 0);

  const totalCharges = confirmedAssets
    .filter((a) => a.fiscalTreatment === "charge")
    .reduce((sum, a) => sum + a.amount, 0);

  const totalAnnualAmortization = fiscalDecisions.reduce(
    (sum, d) => sum + d.annualAmortization,
    0,
  );

  return {
    propertyId,
    facts,
    workGroupProposals: workGroups,
    confirmedAssets,
    fiscalDecisions,
    schedules,
    summary: {
      totalImmobilisations,
      totalCharges,
      totalAnnualAmortization,
      pendingGroupProposals,
      pendingUserValidation,
    },
  };
}
