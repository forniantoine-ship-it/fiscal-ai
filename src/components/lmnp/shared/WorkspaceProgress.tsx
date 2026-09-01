"use client";

import { ProgressBar } from "@/design-system/components/ProgressBar";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { getDocumentJourneyProgress } from "@/lib/lmnp/engine/document-journey-progress";
import { useLmnp } from "@/lib/lmnp/store";

export function WorkspaceProgress({ label = "Avancement du dossier" }: { label?: string }) {
  const { workspace } = useLmnp();
  const ws = {
    fiscalYear: workspace.fiscalYear,
    properties: workspace.properties,
    documents: workspace.documents,
    extractions: workspace.extractions,
    validationItems: workspace.validationItems,
    ledgerEntries: workspace.ledgerEntries,
    declarationDraft: workspace.declarationDraft,
  };

  const docProgress = getDocumentJourneyProgress(ws);
  const declarationPercent = workspace.declaration.percentComplete;
  const pendingValidations = workspace.pendingValidationCount;
  const visibleSteps = workspace.declaration.steps.filter((step) => step.status !== "upcoming").slice(-4);

  return (
    <div
      style={{
        padding: spacing.card.md,
        borderRadius: radius.lg,
        border: `1px solid ${colors.border.subtle}`,
        backgroundImage: gradients.card.inset,
        boxShadow: shadows.card.default,
      }}
    >
      <ProgressBar value={declarationPercent} label={label} />
      <div
        className="mt-4 flex flex-wrap gap-3"
        style={{ ...typography.caption.desktop, color: colors.text.secondary }}
      >
        <span>
          Documents {docProgress.completed}/{docProgress.total}
        </span>
        <span>·</span>
        <span>
          Confiance dossier {workspace.confidence.score}%
        </span>
        {pendingValidations > 0 ? (
          <>
            <span>·</span>
            <span style={{ color: colors.text.accent }}>
              {pendingValidations} validation{pendingValidations > 1 ? "s" : ""} en attente
            </span>
          </>
        ) : (
          <>
            <span>·</span>
            <span>Aucune validation en attente</span>
          </>
        )}
      </div>
      {visibleSteps.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {visibleSteps.map((step) => (
            <span
              key={step.id}
              style={{
                ...typography.caption.desktop,
                padding: `${spacing.scale[1]} ${spacing.scale[3]}`,
                borderRadius: radius.full,
                border: `1px solid ${
                  step.status === "completed"
                    ? colors.success.border
                    : step.status === "current"
                      ? colors.border.selected
                      : colors.border.subtle
                }`,
                backgroundColor:
                  step.status === "completed"
                    ? colors.success.surface
                    : step.status === "current"
                      ? colors.surface.selected
                      : colors.surface.primary,
                color:
                  step.status === "completed"
                    ? colors.success.DEFAULT
                    : step.status === "current"
                      ? colors.text.accent
                      : colors.text.muted,
              }}
            >
              {step.title}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
