"use client";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { LOGEMENT_FADE_IN } from "@/components/lmnp/logement/logement-visual-isolation";

export type LogementExtractionFallbackCardProps = {
  onManualFallback: () => void;
  onRetry: () => void;
};

function DocumentIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AiSparkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l1.2 4.2L17.5 8 13.2 9.2 12 13.5 10.8 9.2 6.5 8l4.3-.8L12 3zM5 14l.8 2.8L8.5 17.5l-2.7 1 .8 2.8-.8-2.1L3 17.5l2.7-.7L5 14zm14 0l.8 2.8 2.7.7-2.7 1 .8 2.1-.8-2.8-2.7-1 2.7-.7L19 14z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l7 3v6c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Premium fallback card when automatic logement extraction exhausts all AI methods.
 * Shown after upload succeeded — parcours remains fully available via manual entry.
 */
export function LogementExtractionFallbackCard({
  onManualFallback,
  onRetry,
}: LogementExtractionFallbackCardProps) {
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
      role="status"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5"
          style={{
            borderRadius: radius.full,
            backgroundColor: colors.surface.inset,
            color: colors.text.accent,
            fontFamily: typography.fontFamily.sans,
            fontSize: typography.fontSize.xs,
            fontWeight: typography.fontWeight.medium,
            letterSpacing: "0.02em",
            padding: "4px 10px",
          }}
        >
          <AiSparkIcon />
          Analyse IA effectuée
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
        <div
          className="flex shrink-0 items-center gap-2"
          style={{ color: colors.text.accent }}
          aria-hidden
        >
          <span
            className="inline-flex items-center justify-center"
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.md,
              backgroundColor: colors.surface.inset,
            }}
          >
            <DocumentIcon />
          </span>
          <span
            className="inline-flex items-center justify-center"
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.md,
              backgroundColor: colors.surface.inset,
            }}
          >
            <AiSparkIcon />
          </span>
          <span
            className="inline-flex items-center justify-center"
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.md,
              backgroundColor: colors.surface.inset,
            }}
          >
            <ShieldIcon />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <h2
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize.xl,
              color: colors.text.primary,
              lineHeight: 1.35,
              fontWeight: typography.fontWeight.medium,
            }}
          >
            Le document semble trop dégradé pour une lecture automatique fiable
          </h2>
          <p
            className="mt-3"
            style={{
              ...typography.body.desktop,
              color: colors.text.secondary,
              lineHeight: 1.6,
              maxWidth: "42rem",
            }}
          >
            Notre IA a tenté plusieurs méthodes de lecture automatique, mais la qualité du document
            ne permet pas une extraction suffisamment fiable. Vous pouvez continuer le parcours
            normalement en renseignant les informations manuellement.
          </p>
          <p
            className="mt-4"
            style={{
              fontFamily: typography.fontFamily.sans,
              fontSize: typography.fontSize.sm,
              color: colors.text.muted,
              lineHeight: 1.5,
            }}
          >
            Les documents PDF natifs ou les scans nets donnent les meilleurs résultats.
          </p>
        </div>
      </div>

      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:items-stretch">
        <Button onClick={onManualFallback} className="w-full sm:flex-1">
          Renseigner manuellement
        </Button>
        <Button variant="secondary" onClick={onRetry} className="w-full sm:flex-1">
          Réessayer l&apos;import
        </Button>
      </div>
    </section>
  );
}
