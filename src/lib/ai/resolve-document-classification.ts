import {
  CLASSIFICATION_REVIEW_THRESHOLD,
  LMNP_CATEGORIES,
  mapUserUploadCategoryToLmnp,
  type AiClassificationRecommendation,
  type DocumentType,
  type LmnpCategory,
  type ResolvedDocumentClassification,
  type UserUploadCategory,
} from "./document-classification-types";

/** Compatible detected categories per upload section (for conflict detection). */
const USER_UPLOAD_COMPATIBLE_CATEGORIES: Record<UserUploadCategory, readonly LmnpCategory[]> = {
  travaux: ["works"],
  mobilier: ["furniture", "appliance", "electronics", "kitchen"],
  charges: ["works", "insurance", "property_tax", "other", "unknown"],
  revenus: ["rent_income", "other", "unknown"],
  emprunt: ["loan", "unknown"],
  amortissement: ["furniture", "works", "appliance", "electronics", "kitchen", "continuity", "other", "unknown"],
  bail: ["rent_income", "other", "unknown"],
  autre: LMNP_CATEGORIES,
};

const DOCUMENT_TYPE_DEFAULT_CATEGORY: Record<DocumentType, LmnpCategory | null> = {
  invoice: null,
  loan_offer: "loan",
  notary_act: "notary_fees",
  tax_document: "property_tax",
  insurance_document: "insurance",
  inpi_document: "inpi",
  unknown: "unknown",
};

export type ResolveDocumentClassificationInput = {
  ai: AiClassificationRecommendation;
  userCategory?: UserUploadCategory | null;
};

function inferDetectedCategory(ai: AiClassificationRecommendation): LmnpCategory | null {
  if (ai.detectedCategory) return ai.detectedCategory;
  return DOCUMENT_TYPE_DEFAULT_CATEGORY[ai.documentType];
}

function categoriesConflict(
  userCategory: UserUploadCategory,
  detectedCategory: LmnpCategory,
): boolean {
  const compatible = USER_UPLOAD_COMPATIBLE_CATEGORIES[userCategory];
  return !compatible.includes(detectedCategory);
}

function buildFinalCategory(params: {
  detectedCategory: LmnpCategory | null;
  userCategory: UserUploadCategory | null;
  hasConflict: boolean;
  lowConfidence: boolean;
}): LmnpCategory {
  const { detectedCategory, userCategory, hasConflict, lowConfidence } = params;

  if (detectedCategory && (!lowConfidence || !userCategory)) {
    return detectedCategory;
  }

  if (userCategory) {
    return mapUserUploadCategoryToLmnp(userCategory);
  }

  return detectedCategory ?? "unknown";
}

/**
 * Normalizes AI classification into a canonical business classification.
 * The classifier is a recommendation engine — this layer is the governance boundary.
 */
export function resolveDocumentClassification(
  input: ResolveDocumentClassificationInput,
): ResolvedDocumentClassification {
  const { ai, userCategory = null } = input;
  const detectedCategory = inferDetectedCategory(ai);
  const lowConfidence = ai.confidenceScore < CLASSIFICATION_REVIEW_THRESHOLD;
  const hasConflict =
    Boolean(userCategory && detectedCategory) &&
    categoriesConflict(userCategory!, detectedCategory!);

  const needsReview =
    lowConfidence ||
    hasConflict ||
    ai.documentType === "unknown" ||
    (detectedCategory === "unknown" && Boolean(userCategory));

  const finalCategory = buildFinalCategory({
    detectedCategory,
    userCategory,
    hasConflict,
    lowConfidence,
  });

  const resolved: ResolvedDocumentClassification = {
    documentType: ai.documentType,
    detectedCategory,
    userCategory,
    finalCategory,
    confidenceScore: ai.confidenceScore,
    needsReview,
    classificationReason: ai.classificationReason,
  };

  console.log("[classification] resolved", {
    documentType: resolved.documentType,
    detectedCategory: resolved.detectedCategory,
    userCategory: resolved.userCategory,
    finalCategory: resolved.finalCategory,
    confidenceScore: resolved.confidenceScore,
    needsReview: resolved.needsReview,
  });

  if (needsReview) {
    console.log("[classification] review-required", {
      reasons: [
        lowConfidence ? "low_confidence" : null,
        hasConflict ? "user_detected_conflict" : null,
        ai.documentType === "unknown" ? "unknown_document_type" : null,
      ].filter(Boolean),
      userCategory,
      detectedCategory,
      finalCategory,
    });
  }

  return resolved;
}
