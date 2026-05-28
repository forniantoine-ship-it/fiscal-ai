import type { ExtractionStatus } from "./document-types";
import {
  mapUserUploadCategoryToLmnp,
  type LmnpCategory,
  type ResolvedDocumentClassification,
  type UserUploadCategory,
} from "./document-classification-types";

const LMNP_CATEGORY_LABELS: Record<LmnpCategory, string> = {
  furniture: "mobilier",
  works: "travaux",
  appliance: "électroménager",
  electronics: "électronique",
  kitchen: "cuisine",
  notary_fees: "frais de notaire",
  insurance: "assurance",
  property_tax: "taxe foncière",
  loan: "emprunt",
  rent_income: "revenus locatifs",
  inpi: "INPI",
  continuity: "continuité comptable",
  other: "autre",
  unknown: "non identifié",
};

const USER_UPLOAD_CATEGORY_LABELS: Record<UserUploadCategory, string> = {
  travaux: "travaux",
  mobilier: "mobilier",
  charges: "charges",
  revenus: "revenus",
  emprunt: "emprunt",
  amortissement: "amortissement",
  bail: "bail",
  autre: "autre",
};

export function getLmnpCategoryLabel(category: LmnpCategory | null | undefined): string {
  if (!category) return "non identifié";
  return LMNP_CATEGORY_LABELS[category] ?? category;
}

export function getUserUploadCategoryLabel(category: UserUploadCategory | null | undefined): string {
  if (!category) return "non identifié";
  return USER_UPLOAD_CATEGORY_LABELS[category] ?? category;
}

/** Whether the inline review card should be shown for this extraction result. */
export function shouldShowClassificationReview(
  classification: ResolvedDocumentClassification | undefined,
  extractionStatus: ExtractionStatus,
): boolean {
  if (!classification?.needsReview || extractionStatus !== "completed") {
    return false;
  }

  if (classification.documentType === "unknown") {
    return false;
  }

  if (!classification.detectedCategory || classification.detectedCategory === "unknown") {
    return false;
  }

  if (!classification.userCategory) {
    return false;
  }

  const userLmnp = mapUserUploadCategoryToLmnp(classification.userCategory);
  if (classification.detectedCategory === userLmnp) {
    return false;
  }

  return true;
}

export function buildClassificationConflictMessage(
  classification: ResolvedDocumentClassification,
): string {
  const detectedLabel = getLmnpCategoryLabel(classification.detectedCategory);
  const userLabel = getUserUploadCategoryLabel(classification.userCategory);
  return `Ce document semble correspondre à du ${detectedLabel} plutôt qu'à des ${userLabel}.`;
}
