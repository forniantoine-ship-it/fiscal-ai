"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildConseillerComplements,
  humanizeConseillerText,
} from "@/components/lmnp/dashboard/conseiller-suggestions";
import { preserveChapterScrollPosition } from "@/components/lmnp/dashboard/dashboard-chapter-scroll";
import type { WorkflowStepView } from "@/components/lmnp/dashboard/dashboard-workflow-model";
import type { DashboardHeroKind } from "@/components/lmnp/dashboard/workflow-progression";
import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

const DESKTOP_MEDIA = "(min-width: 1024px)";

type DashboardConseillerSectionProps = {
  title: string;
  explanation: string;
  conseillerObservation: string;
  heroKind: DashboardHeroKind;
  primaryLabel: string;
  onPrimaryClick: () => void;
  currentStep: WorkflowStepView | null;
};

function SparklesIcon({ inverse = false }: { inverse?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
        stroke={inverse ? colors.text.inverse : colors.orange[500]}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="2" fill={inverse ? "rgba(255,250,246,0.35)" : colors.orange[200]} />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke={colors.text.muted} strokeWidth="1.2" />
      <path
        d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
        stroke={colors.text.muted}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ConseillerPresenceIcon() {
  return (
    <span
      className="inline-flex items-center justify-center"
      style={{
        width: "28px",
        height: "28px",
        borderRadius: radius.full,
        backgroundColor: colors.orange[100],
        color: colors.orange[600],
        fontSize: typography.fontSize.xs,
        fontWeight: typography.fontWeight.medium,
      }}
      aria-hidden
    >
      ✦
    </span>
  );
}

function useDesktopLayout() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_MEDIA);
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

export function DashboardConseillerSection({
  title,
  explanation,
  conseillerObservation,
  heroKind,
  primaryLabel,
  onPrimaryClick,
  currentStep,
}: DashboardConseillerSectionProps) {
  const [showComplements, setShowComplements] = useState(false);
  const [activeComplementId, setActiveComplementId] = useState<string | null>(null);
  const isDesktop = useDesktopLayout();

  const displayTitle = humanizeConseillerText(title);
  const displayExplanation = humanizeConseillerText(explanation);
  const displayObservation = humanizeConseillerText(conseillerObservation);
  const complements = useMemo(
    () => buildConseillerComplements(currentStep, heroKind),
    [currentStep, heroKind],
  );

  const toggleComplement = (id: string) => {
    preserveChapterScrollPosition(() => {
      setActiveComplementId((current) => (current === id ? null : id));
    });
  };

  return (
    <div style={{ marginLeft: spacing.scale[9], paddingLeft: spacing.scale[6] }}>
      <p
        className="max-w-2xl"
        style={{
          ...typography.body.desktop,
          color: colors.text.secondary,
          lineHeight: typography.lineHeight.relaxed,
          marginBottom: spacing.scale[8],
        }}
      >
        Je suis votre conseiller. Nous allons préparer votre déclaration LMNP ensemble, étape par
        étape.
      </p>

      <div
        className="gap-6 lg:gap-8"
        style={{
          display: "grid",
          gridTemplateColumns: isDesktop ? "minmax(0, 7fr) minmax(0, 3fr)" : "minmax(0, 1fr)",
        }}
      >
        <div>
          <div
            style={{
              borderRadius: radius.xl,
              border: `1px solid ${colors.orange[600]}`,
              boxShadow: shadows.card.hover,
              padding: spacing.card.xl,
              backgroundImage: gradients.button.primary,
            }}
          >
            <div className="flex items-center gap-2">
              <SparklesIcon inverse />
              <p
                style={{
                  ...typography.caption.desktop,
                  color: "rgba(255, 250, 246, 0.88)",
                  letterSpacing: typography.letterSpacing.label,
                  textTransform: "uppercase",
                  fontWeight: typography.fontWeight.medium,
                }}
              >
                À faire maintenant
              </p>
            </div>

            <h3
              className="mt-4"
              style={{
                fontFamily: typography.fontFamily.display,
                fontSize: typography.fontSize["2xl"],
                lineHeight: typography.lineHeight.heading,
                letterSpacing: typography.letterSpacing.heading,
                color: colors.text.inverse,
              }}
            >
              {displayTitle}
            </h3>

            <p
              className="mt-4 whitespace-pre-line"
              style={{
                ...typography.body.desktop,
                color: "rgba(255, 250, 246, 0.92)",
                lineHeight: typography.lineHeight.relaxed,
              }}
            >
              {displayExplanation}
            </p>

            <div className="mt-8">
              <Button variant="onAccent" onClick={onPrimaryClick}>
                {primaryLabel}
              </Button>
            </div>
          </div>

          <p
            className="mt-4 flex items-center justify-center gap-2 lg:justify-start"
            style={{
              ...typography.caption.desktop,
              color: colors.text.muted,
            }}
          >
            <LockIcon />
            Vos données sont sécurisées et confidentielles.
          </p>
        </div>

        <div
          style={{
            borderRadius: radius.xl,
            border: `1px solid ${colors.border.subtle}`,
            boxShadow: shadows.card.default,
            padding: spacing.card.lg,
            backgroundColor: colors.surface.primary,
          }}
        >
          <div className="flex items-center gap-3">
            <ConseillerPresenceIcon />
            <h3
              style={{
                fontFamily: typography.fontFamily.display,
                fontSize: typography.fontSize.lg,
                lineHeight: typography.lineHeight.title,
                color: colors.text.primary,
              }}
            >
              Votre conseiller
            </h3>
          </div>

          <p
            className="mt-4"
            style={{
              ...typography.body.desktop,
              color: colors.text.secondary,
              lineHeight: typography.lineHeight.relaxed,
            }}
          >
            {displayObservation}
          </p>

          {!showComplements ? (
            <button
              type="button"
              onClick={() => preserveChapterScrollPosition(() => setShowComplements(true))}
              style={{
                ...typography.caption.desktop,
                color: colors.text.tertiary,
                marginTop: spacing.scale[4],
                padding: 0,
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
                transition: motions.hover.ghost,
              }}
            >
              En savoir plus
            </button>
          ) : (
            <ul
              className="mt-4"
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: spacing.scale[2],
              }}
            >
              {complements.map((complement) => {
                const isActive = activeComplementId === complement.id;
                return (
                  <li key={complement.id}>
                    <button
                      type="button"
                      onClick={() => toggleComplement(complement.id)}
                      aria-expanded={isActive}
                      style={{
                        ...typography.caption.desktop,
                        color: colors.text.tertiary,
                        padding: 0,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        textDecoration: isActive ? "underline" : "none",
                        textUnderlineOffset: "3px",
                        transition: motions.hover.ghost,
                      }}
                    >
                      {complement.question}
                    </button>
                    {isActive ? (
                      <p
                        className="mt-2"
                        style={{
                          ...typography.caption.desktop,
                          color: colors.text.muted,
                          lineHeight: typography.lineHeight.relaxed,
                        }}
                      >
                        {humanizeConseillerText(complement.answer)}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
