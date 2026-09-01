import type { ResolvedDocumentClassification } from "./document-classification-types";
import { mapUserUploadCategoryToLmnp } from "./document-classification-types";

export type ClassificationReviewAction = "confirm-ai" | "keep-user-category";

export function applyClassificationReview(
  current: ResolvedDocumentClassification,
  action: ClassificationReviewAction,
): ResolvedDocumentClassification {
  if (action === "confirm-ai") {
    return {
      ...current,
      finalCategory: current.detectedCategory ?? current.finalCategory,
      needsReview: false,
    };
  }

  const finalCategory = current.userCategory
    ? mapUserUploadCategoryToLmnp(current.userCategory)
    : current.finalCategory;

  return {
    ...current,
    finalCategory,
    needsReview: false,
  };
}

export function classificationFromRow(row: {
  document_type: string;
  detected_category: string | null;
  user_category: string | null;
  final_category: string | null;
  confidence_score: number;
  needs_review: boolean;
  classification_reason: string[] | null;
}): ResolvedDocumentClassification {
  return {
    documentType: row.document_type as ResolvedDocumentClassification["documentType"],
    detectedCategory: row.detected_category as ResolvedDocumentClassification["detectedCategory"],
    userCategory: row.user_category as ResolvedDocumentClassification["userCategory"],
    finalCategory: (row.final_category ?? "unknown") as ResolvedDocumentClassification["finalCategory"],
    confidenceScore: Number(row.confidence_score) || 0,
    needsReview: Boolean(row.needs_review),
    classificationReason: Array.isArray(row.classification_reason) ? row.classification_reason : [],
  };
}
