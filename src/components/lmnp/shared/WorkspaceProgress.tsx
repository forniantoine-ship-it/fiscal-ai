"use client";

import { ProgressBar } from "@/design-system/components/ProgressBar";
import { colors } from "@/design-system/theme/colors";
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

  return (
    <div
      style={{
        padding: spacing.card.sm,
        borderRadius: "16px",
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.secondary,
      }}
    >
      <ProgressBar value={declarationPercent} label={label} />
      <div
        className="mt-3 flex flex-wrap gap-4"
        style={{ ...typography.caption.desktop, color: colors.text.secondary }}
      >
        <span>
          Documents {docProgress.completed}/{docProgress.total}
        </span>
        {pendingValidations > 0 ? (
          <span style={{ color: colors.text.accent }}>
            {pendingValidations} validation{pendingValidations > 1 ? "s" : ""} en attente
          </span>
        ) : (
          <span>Aucune validation en attente</span>
        )}
      </div>
    </div>
  );
}
