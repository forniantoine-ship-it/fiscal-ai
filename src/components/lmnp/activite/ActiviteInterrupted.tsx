"use client";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

type ActiviteInterruptedProps = {
  onResumeAnalysis: () => void;
  onReplaceDocument: () => void;
  resumeDisabled?: boolean;
};

export function ActiviteInterrupted({
  onResumeAnalysis,
  onReplaceDocument,
  resumeDisabled = false,
}: ActiviteInterruptedProps) {
  return (
    <div
      className="w-full text-center animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{
        borderRadius: radius.lg,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.primary,
        boxShadow: shadows.card.default,
        padding: spacing.card.md,
      }}
    >
      <p
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize.xl,
          color: colors.text.primary,
        }}
      >
        L&apos;analyse du document a été interrompue
      </p>
      <p className="mt-3" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
        Vous pouvez relancer l&apos;analyse ou importer un autre document INPI.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Button onClick={onResumeAnalysis} disabled={resumeDisabled}>
          Reprendre l&apos;analyse
        </Button>
        <Button variant="secondary" onClick={onReplaceDocument}>
          Remplacer le document
        </Button>
      </div>
    </div>
  );
}
