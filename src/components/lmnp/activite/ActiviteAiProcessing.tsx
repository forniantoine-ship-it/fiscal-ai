"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

type ActiviteAiProcessingProps = {
  onComplete?: () => void;
  minDurationMs?: number;
  finalStepLabel?: string;
  /** When set, replaces the default step sequence entirely. */
  steps?: readonly string[];
};

const BASE_STEPS = [
  "Document reçu",
  "Analyse OCR",
  "Détection des informations",
  "Vérification cohérence",
] as const;

export function ActiviteAiProcessing({
  onComplete,
  minDurationMs = 4200,
  finalStepLabel = "Préparation du formulaire",
  steps: stepsOverride,
}: ActiviteAiProcessingProps) {
  const steps = useMemo(
    () => stepsOverride ?? [...BASE_STEPS, finalStepLabel],
    [stepsOverride, finalStepLabel],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const stepDuration = Math.floor(minDurationMs / steps.length);
    const timers = steps.map((_, index) =>
      window.setTimeout(() => setActiveIndex(index), stepDuration * index),
    );
    const completeTimer = window.setTimeout(() => onCompleteRef.current?.(), minDurationMs);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(completeTimer);
    };
  }, [minDurationMs, steps]);

  return (
    <section
      aria-live="polite"
      aria-busy="true"
      className="mx-auto w-full max-w-lg animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{
        borderRadius: radius.lg,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.primary,
        backgroundImage: [
          `radial-gradient(ellipse 88% 52% at 50% -8%, ${colors.orange[100]} 0%, transparent 62%)`,
          gradients.card.elevated,
        ].join(", "),
        boxShadow: shadows.card.default,
        padding: spacing.card.md,
      }}
    >
      <p
        className="text-center"
        style={{
          ...typography.caption.desktop,
          color: colors.text.accent,
          letterSpacing: typography.letterSpacing.label,
        }}
      >
        Analyse intelligente
      </p>
      <p
        className="mt-2 text-center text-xl sm:text-2xl"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          color: colors.text.primary,
        }}
      >
        L&apos;IA prépare vos informations
      </p>

      <ol className="mt-8 space-y-4">
        {steps.map((label, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li
              key={label}
              className="flex items-center gap-3 animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
              style={{
                opacity: index <= activeIndex ? 1 : 0.4,
                transition: motions.workflow.complete,
              }}
            >
              <span
                aria-hidden
                className="inline-flex h-2 w-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: done
                    ? colors.success.DEFAULT
                    : active
                      ? colors.orange[500]
                      : colors.border.default,
                  animation: active ? motions.analyzing.pulse : undefined,
                  boxShadow: active ? `0 0 10px ${colors.orange[200]}` : undefined,
                }}
              />
              <span
                style={{
                  ...typography.body.desktop,
                  fontSize: typography.fontSize.sm,
                  color: active ? colors.text.primary : colors.text.secondary,
                  fontWeight: active ? typography.fontWeight.medium : typography.fontWeight.regular,
                }}
              >
                {label}
              </span>
              {done ? (
                <span
                  className="ml-auto"
                  style={{ ...typography.caption.desktop, color: colors.success.DEFAULT }}
                >
                  ✓
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div
        className="mt-8 overflow-hidden"
        style={{
          height: "3px",
          borderRadius: radius.full,
          backgroundColor: colors.surface.tertiary,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, ((activeIndex + 1) / steps.length) * 100)}%`,
            borderRadius: radius.full,
            backgroundImage: gradients.workflow.analyzing,
            transition: motions.workflow.progress,
          }}
        />
      </div>
    </section>
  );
}
