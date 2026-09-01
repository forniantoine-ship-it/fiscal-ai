"use client";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { LogementExtractionState } from "@/lib/lmnp/services/logement/logement-extraction-state";
import { LOGEMENT_FADE_IN } from "@/components/lmnp/logement/logement-visual-isolation";

export type LogementExtractionRecoveryActionsProps = {
  extractionState: LogementExtractionState;
  hasPartialFields: boolean;
  onManualFallback: () => void;
  onEditFields: () => void;
  onRetry?: () => void;
  showRetry?: boolean;
};

export function LogementExtractionRecoveryActions({
  extractionState,
  hasPartialFields,
  onManualFallback,
  onEditFields,
  onRetry,
  showRetry = false,
}: LogementExtractionRecoveryActionsProps) {
  if (extractionState === "failed") {
    return (
      <section
        className={`w-full ${LOGEMENT_FADE_IN}`}
        style={{
          borderRadius: radius.lg,
          border: `1px solid ${colors.border.subtle}`,
          backgroundColor: colors.surface.primary,
          boxShadow: shadows.card.default,
          padding: spacing.card.md,
        }}
        aria-live="polite"
      >
        <p
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize.lg,
            color: colors.text.primary,
            lineHeight: 1.4,
          }}
        >
          Impossible de lire automatiquement ce document.
        </p>
        <p
          className="mt-3"
          style={{ ...typography.body.desktop, color: colors.text.secondary, lineHeight: 1.55 }}
        >
          {hasPartialFields
            ? "Quelques éléments ont été repérés, mais la lecture automatique est incomplète. Vous pouvez vérifier et compléter les informations à la main."
            : "Vous pouvez renseigner les informations manuellement — le parcours reste entièrement disponible."}
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <Button onClick={onManualFallback} className="sm:min-w-[220px]">
            Renseigner manuellement
          </Button>
          {showRetry && onRetry ? (
            <Button variant="secondary" onClick={onRetry}>
              Réessayer l&apos;import
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  if (extractionState === "partial") {
    return (
      <section
        className={`w-full ${LOGEMENT_FADE_IN}`}
        style={{
          borderRadius: radius.md,
          border: `1px solid ${colors.border.subtle}`,
          backgroundColor: colors.surface.inset,
          padding: spacing.card.sm,
        }}
        aria-live="polite"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p style={{ ...typography.body.desktop, color: colors.text.secondary, lineHeight: 1.5 }}>
            Certaines informations n&apos;ont pas pu être détectées automatiquement. Vous pouvez
            les compléter à tout moment.
          </p>
          <Button variant="secondary" onClick={onManualFallback} className="shrink-0">
            Compléter manuellement
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className={`flex justify-end ${LOGEMENT_FADE_IN}`}>
      <Button variant="ghost" onClick={onEditFields}>
        Modifier les informations
      </Button>
    </div>
  );
}
