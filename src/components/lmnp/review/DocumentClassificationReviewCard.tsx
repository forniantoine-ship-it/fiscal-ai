"use client";

import { useState } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  buildClassificationConflictMessage,
  getLmnpCategoryLabel,
  getUserUploadCategoryLabel,
} from "@/lib/ai/classification-labels";
import { submitClassificationReview } from "@/lib/ai/classification-review-client";
import type { ResolvedDocumentClassification } from "@/lib/ai/document-classification-types";

type DocumentClassificationReviewCardProps = {
  extractionRowId: string;
  classification: ResolvedDocumentClassification;
  fileName?: string;
  onResolved: (updated: ResolvedDocumentClassification) => void;
};

export function DocumentClassificationReviewCard({
  extractionRowId,
  classification,
  fileName,
  onResolved,
}: DocumentClassificationReviewCardProps) {
  const [isSubmitting, setIsSubmitting] = useState<"confirm-ai" | "keep-user-category" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const detectedLabel = getLmnpCategoryLabel(classification.detectedCategory);
  const userLabel = getUserUploadCategoryLabel(classification.userCategory);
  const message = buildClassificationConflictMessage(classification);
  const reasons = classification.classificationReason.filter(Boolean);

  async function handleAction(action: "confirm-ai" | "keep-user-category") {
    setIsSubmitting(action);
    setError(null);

    try {
      const updated = await submitClassificationReview({ extractionRowId, action });
      onResolved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation impossible.");
    } finally {
      setIsSubmitting(null);
    }
  }

  return (
    <div
      className="mt-4"
      style={{
        borderRadius: radius.md,
        border: `1px solid ${colors.orange[200]}`,
        backgroundColor: colors.orange[50],
        padding: spacing.scale[4],
      }}
    >
      <p
        style={{
          ...typography.body.desktop,
          fontWeight: typography.fontWeight.medium,
          color: colors.text.primary,
        }}
      >
        ⚠️ {message}
      </p>

      {fileName ? (
        <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          {fileName}
        </p>
      ) : null}

      {reasons.length > 0 ? (
        <div className="mt-3">
          <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>Motifs :</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {reasons.map((reason) => (
              <li key={reason} style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
                {reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          variant="primary"
          disabled={Boolean(isSubmitting)}
          onClick={() => void handleAction("confirm-ai")}
        >
          {isSubmitting === "confirm-ai"
            ? "Confirmation…"
            : `Confirmer ${detectedLabel}`}
        </Button>
        <Button
          variant="secondary"
          disabled={Boolean(isSubmitting)}
          onClick={() => void handleAction("keep-user-category")}
        >
          {isSubmitting === "keep-user-category" ? "Enregistrement…" : `Garder ${userLabel}`}
        </Button>
      </div>

      {error ? (
        <p className="mt-2" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
