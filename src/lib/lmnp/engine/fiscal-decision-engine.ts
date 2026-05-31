/**
 * LMNP Business Engine — Layer 4: Fiscal Decision Engine
 *
 * Produces plain-French fiscal explanations for BusinessAssets.
 *
 * Core principle:
 *   The user must always understand WHY the software made a decision.
 *   "I understand what the software is doing" — NOT "mysterious accounting."
 *
 * This engine NEVER exposes raw accounting jargon.
 * All text is written for a non-accountant LMNP owner.
 */

import type {
  AccountingCategory,
  BusinessAsset,
  FiscalDecision,
  FiscalTreatmentType,
} from "./business-engine.types";
import {
  CATEGORY_AMORTIZATION_YEARS,
  CATEGORY_LABELS_FR,
  decideFiscalTreatment,
  resolveAmortizationYears,
} from "./business-asset-engine";

// ---------------------------------------------------------------------------
// Reason generators — bullet points explaining fiscal decisions
// ---------------------------------------------------------------------------

/** Keywords that indicate structural / high-value improvements. */
const STRUCTURAL_KEYWORDS = [
  "isolation", "structure", "gros œuvre", "façade", "toiture", "charpente",
  "fondation", "mur porteur",
];

/** Keywords that indicate furniture / equipment category. */
const FURNITURE_KEYWORDS = [
  "meuble", "mobilier", "canapé", "lit", "armoire", "table", "chaise",
  "bibliothèque", "cuisine", "hotte", "four", "réfrigérateur",
];

/** Keywords that suggest a durable improvement (not just maintenance). */
const DURABLE_IMPROVEMENT_KEYWORDS = [
  "rénovation", "renovation", "réfection", "refection", "remplacement",
  "installation", "pose", "aménagement", "agencement",
];

function extractKeywordSignals(label: string): {
  isStructural: boolean;
  isFurniture: boolean;
  isDurableImprovement: boolean;
} {
  const text = label.toLowerCase();
  return {
    isStructural: STRUCTURAL_KEYWORDS.some((kw) => text.includes(kw)),
    isFurniture: FURNITURE_KEYWORDS.some((kw) => text.includes(kw)),
    isDurableImprovement: DURABLE_IMPROVEMENT_KEYWORDS.some((kw) => text.includes(kw)),
  };
}

function buildImmobilisationReasons(
  category: AccountingCategory,
  amount: number,
  label: string,
  durationYears: number,
): string[] {
  const { isStructural, isFurniture, isDurableImprovement } = extractKeywordSignals(label);
  const reasons: string[] = [];

  // Amount-based reason
  const formattedAmount = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
  reasons.push(`Montant significatif : ${formattedAmount} → dépense durable`);

  // Category-based reasons
  switch (category) {
    case "cuisine":
      reasons.push("Équipement de cuisine : durée de vie longue (10 ans)");
      reasons.push("Améliore durablement la valeur du bien meublé");
      break;
    case "mobilier":
      reasons.push("Mobilier : bien corporel à usage durable");
      if (isFurniture) reasons.push("Ameublement identifié dans les mots-clés de la facture");
      break;
    case "electromenager":
      reasons.push("Électroménager : équipement à durée de vie définie");
      reasons.push("Immobilisé sur 5 à 7 ans selon les règles fiscales LMNP");
      break;
    case "travaux":
      if (isStructural) {
        reasons.push("Travaux structurels : améliorent la valeur à long terme");
        reasons.push("Nature structurelle → durée d'amortissement étendue");
      } else if (isDurableImprovement) {
        reasons.push("Travaux d'amélioration durable du logement");
        reasons.push("Non assimilables à de la simple maintenance");
      } else {
        reasons.push("Travaux d'amélioration du bien");
      }
      break;
    case "immeuble":
      reasons.push("Composante immobilière du bien (hors terrain)");
      reasons.push("Amortissement sur la durée de vie économique de l'immeuble");
      break;
  }

  // Duration reason
  reasons.push(`Durée d'amortissement proposée : ${durationYears} ans`);

  return reasons;
}

function buildChargeReasons(
  category: AccountingCategory,
  amount: number,
): string[] {
  const reasons: string[] = [];

  switch (category) {
    case "assurance":
      reasons.push("Assurance : prime annuelle récurrente → charge de l'exercice");
      reasons.push("Non immobilisable par nature (charge d'exploitation)");
      break;
    case "taxe_fonciere":
      reasons.push("Taxe foncière : impôt annuel → charge de l'exercice");
      reasons.push("Déductible intégralement du résultat LMNP");
      break;
    default:
      if (amount < 500) {
        reasons.push(`Montant inférieur à 500 € → charge immédiate par simplification`);
        reasons.push("En-dessous du seuil d'immobilisation pratiqué en LMNP");
      } else {
        reasons.push("Dépense d'entretien ou de maintenance courante");
        reasons.push("Ne crée pas de valeur ajoutée durable au bien");
      }
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// Main fiscal explanation builder
// ---------------------------------------------------------------------------

/**
 * Builds a complete plain-French explanation for a fiscal treatment decision.
 * Always written from the user's perspective: "We classified this because..."
 */
export function buildFiscalExplanation(
  category: AccountingCategory,
  amount: number,
  label: string,
  treatment: FiscalTreatmentType,
  durationYears: number,
): string {
  const categoryFr = CATEGORY_LABELS_FR[category];
  const formattedAmount = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);

  if (treatment === "charge") {
    if (category === "assurance") {
      return `Cette dépense d'assurance (${formattedAmount}) est déduite directement de vos revenus locatifs. Les assurances sont des charges récurrentes qui ne s'immobilisent pas.`;
    }
    if (category === "taxe_fonciere") {
      return `La taxe foncière (${formattedAmount}) est déductible intégralement de vos revenus LMNP. C'est une charge fiscale annuelle, pas une immobilisation.`;
    }
    if (amount < 500) {
      return `Cette dépense de ${categoryFr.toLowerCase()} (${formattedAmount}) est passée en charge immédiate. Son montant est inférieur au seuil d'immobilisation (500 €) : elle est donc déduite directement cette année.`;
    }
    return `Cette dépense (${formattedAmount}) est classée en charge déductible. Elle correspond à de l'entretien courant ou à une petite réparation, sans amélioration durable du bien.`;
  }

  // Immobilisation
  const annualAmort = durationYears > 0 ? Math.round(amount / durationYears) : 0;
  const formattedAnnual = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(annualAmort);

  return `Ce bien de ${categoryFr.toLowerCase()} (${formattedAmount}) est immobilisé et amorti sur ${durationYears} ans. Cela représente ${formattedAnnual} de déduction par an sur votre résultat LMNP. Cette approche reflète la durée de vie économique réelle du bien.`;
}

// ---------------------------------------------------------------------------
// applyFiscalDecision — main entry point
// ---------------------------------------------------------------------------

/**
 * Applies the fiscal decision engine to a BusinessAsset and returns
 * a FiscalDecision with full plain-French explanation and bullet-point reasons.
 */
export function applyFiscalDecision(asset: BusinessAsset): FiscalDecision {
  const treatment = decideFiscalTreatment(asset.category, asset.amount);
  const durationYears = resolveAmortizationYears(asset.category, treatment, asset.amortizationYears);
  const annualAmortization =
    treatment === "immobilisation" && durationYears > 0
      ? Math.round(asset.amount / durationYears)
      : 0;

  const explanation = buildFiscalExplanation(
    asset.category,
    asset.amount,
    asset.label,
    treatment,
    durationYears,
  );

  const reasons =
    treatment === "immobilisation"
      ? buildImmobilisationReasons(asset.category, asset.amount, asset.label, durationYears)
      : buildChargeReasons(asset.category, asset.amount);

  return {
    assetId: asset.id,
    treatment,
    category: asset.category,
    durationYears,
    explanation,
    reasons,
    annualAmortization,
  };
}

// ---------------------------------------------------------------------------
// Multi-asset fiscal summary
// ---------------------------------------------------------------------------

export interface FiscalSummary {
  totalImmobilisations: number;
  totalCharges: number;
  totalAnnualAmortization: number;
  byCategory: {
    category: AccountingCategory;
    labelFr: string;
    treatment: FiscalTreatmentType;
    totalAmount: number;
    annualAmortization: number;
    durationYears: number;
    assetCount: number;
  }[];
}

/**
 * Aggregates fiscal decisions across multiple assets into a summary.
 * Used by the declaration summary view and the fiscal validation step.
 */
export function buildFiscalSummary(decisions: FiscalDecision[], assets: BusinessAsset[]): FiscalSummary {
  const assetsById = new Map(assets.map((a) => [a.id, a]));

  const totalImmobilisations = decisions
    .filter((d) => d.treatment === "immobilisation")
    .reduce((sum, d) => sum + (assetsById.get(d.assetId)?.amount ?? 0), 0);

  const totalCharges = decisions
    .filter((d) => d.treatment === "charge")
    .reduce((sum, d) => sum + (assetsById.get(d.assetId)?.amount ?? 0), 0);

  const totalAnnualAmortization = decisions.reduce((sum, d) => sum + d.annualAmortization, 0);

  const categoryMap = new Map<AccountingCategory, typeof byCategory[number]>();
  const byCategory: FiscalSummary["byCategory"] = [];

  for (const decision of decisions) {
    const asset = assetsById.get(decision.assetId);
    if (!asset) continue;

    const existing = categoryMap.get(decision.category);
    if (existing) {
      existing.totalAmount += asset.amount;
      existing.annualAmortization += decision.annualAmortization;
      existing.assetCount++;
    } else {
      const entry = {
        category: decision.category,
        labelFr: CATEGORY_LABELS_FR[decision.category],
        treatment: decision.treatment,
        totalAmount: asset.amount,
        annualAmortization: decision.annualAmortization,
        durationYears: decision.durationYears,
        assetCount: 1,
      };
      categoryMap.set(decision.category, entry);
      byCategory.push(entry);
    }
  }

  // Sort: immobilisations first, then by total amount descending
  byCategory.sort((a, b) => {
    if (a.treatment !== b.treatment) {
      return a.treatment === "immobilisation" ? -1 : 1;
    }
    return b.totalAmount - a.totalAmount;
  });

  return {
    totalImmobilisations,
    totalCharges,
    totalAnnualAmortization,
    byCategory,
  };
}

// ---------------------------------------------------------------------------
// User-facing guidance text
// ---------------------------------------------------------------------------

/**
 * Returns a short reassuring sentence for the user explaining the overall
 * amortization result. Shown at the top of the Amortissements step.
 */
export function buildAmortizationGuidanceText(summary: FiscalSummary): string {
  const { totalAnnualAmortization, byCategory } = summary;

  if (byCategory.length === 0) {
    return "Aucune immobilisation détectée pour le moment. Téléversez vos factures de travaux et de mobilier pour que l'IA analyse votre dossier.";
  }

  const formattedAnnual = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(totalAnnualAmortization);

  const immobCount = byCategory.filter((c) => c.treatment === "immobilisation").length;

  if (immobCount === 0) {
    return "Toutes vos dépenses sont classées en charges déductibles cette année. Aucune immobilisation n'a été détectée.";
  }

  return `Vos immobilisations génèrent ${formattedAnnual} de déduction annuelle sur votre résultat LMNP. Ce montant sera déduit chaque année pendant la durée d'amortissement de chaque bien.`;
}

/**
 * Returns the amortization duration label in French for a category.
 * Used in tooltips and educational text.
 */
export function getCategoryDurationLabel(category: AccountingCategory): string {
  const years = CATEGORY_AMORTIZATION_YEARS[category];
  if (!years || years === 0) return "Non amortissable";

  const labels: Partial<Record<AccountingCategory, string>> = {
    immeuble: "25 à 40 ans",
    travaux: "10 à 15 ans",
    mobilier: "5 à 10 ans",
    electromenager: "5 à 7 ans",
    cuisine: "10 ans",
  };

  return labels[category] ?? `${years} ans`;
}
