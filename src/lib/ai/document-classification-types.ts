/**
 * Centralized document classification model — single source of truth.
 * AI recommendations are normalized here before business/fiscal layers consume them.
 */

/** High-level document family (AI classifier output). */
export const DOCUMENT_TYPES = [
  "invoice",
  "loan_offer",
  "notary_act",
  "tax_document",
  "insurance_document",
  "inpi_document",
  "unknown",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Canonical LMNP business categories for detectedCategory and finalCategory. */
export const LMNP_CATEGORIES = [
  "furniture",
  "works",
  "appliance",
  "electronics",
  "kitchen",
  "notary_fees",
  "insurance",
  "property_tax",
  "loan",
  "rent_income",
  "inpi",
  "continuity",
  "other",
  "unknown",
] as const;

export type LmnpCategory = (typeof LMNP_CATEGORIES)[number];

/** Workflow section where the user uploaded the document. */
export const USER_UPLOAD_CATEGORIES = [
  "travaux",
  "mobilier",
  "charges",
  "revenus",
  "emprunt",
  "amortissement",
  "bail",
  "autre",
] as const;

export type UserUploadCategory = (typeof USER_UPLOAD_CATEGORIES)[number];

/** Primary LMNP category implied by each upload section. */
export const USER_UPLOAD_PRIMARY_LMNP_CATEGORY: Record<UserUploadCategory, LmnpCategory> = {
  travaux: "works",
  mobilier: "furniture",
  charges: "other",
  revenus: "rent_income",
  emprunt: "loan",
  amortissement: "other",
  bail: "rent_income",
  autre: "other",
};

export function mapUserUploadCategoryToLmnp(category: UserUploadCategory): LmnpCategory {
  return USER_UPLOAD_PRIMARY_LMNP_CATEGORY[category];
}

/** Raw AI classifier recommendation — not the final business decision. */
export type AiClassificationRecommendation = {
  documentType: DocumentType;
  detectedCategory: LmnpCategory | null;
  confidenceScore: number;
  classificationReason: string[];
  /** Debug-only narrative; not persisted as business explainability. */
  reasoning?: string;
};

/** Normalized classification stored and consumed by the application. */
export type ResolvedDocumentClassification = {
  documentType: DocumentType;
  detectedCategory: LmnpCategory | null;
  userCategory: UserUploadCategory | null;
  finalCategory: LmnpCategory;
  confidenceScore: number;
  needsReview: boolean;
  classificationReason: string[];
};

export const CLASSIFICATION_REVIEW_THRESHOLD = 0.65;

/** Maps legacy workspace DocumentCategory to upload-context category. */
export function mapLegacyDocumentCategory(
  category: string | null | undefined,
): UserUploadCategory | null {
  switch (category) {
    case "charges":
      return "charges";
    case "revenus":
      return "revenus";
    case "emprunt":
      return "emprunt";
    case "bail":
      return "bail";
    case "amortissement":
      return "amortissement";
    case "autre":
      return "autre";
    default:
      return null;
  }
}

/** Maps invoice extractor categoryHint to canonical LMNP category. */
export function mapInvoiceCategoryHint(
  hint: string | null | undefined,
): LmnpCategory | null {
  if (!hint) return null;
  const normalized = hint.trim().toLowerCase();
  if ((LMNP_CATEGORIES as readonly string[]).includes(normalized)) {
    return normalized as LmnpCategory;
  }
  return null;
}

export function isLmnpCategory(value: unknown): value is LmnpCategory {
  return typeof value === "string" && (LMNP_CATEGORIES as readonly string[]).includes(value);
}

export function isUserUploadCategory(value: unknown): value is UserUploadCategory {
  return (
    typeof value === "string" && (USER_UPLOAD_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && (DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function normalizeClassificationReason(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 8);
}
