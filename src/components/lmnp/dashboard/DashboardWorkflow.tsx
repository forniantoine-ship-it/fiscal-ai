"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { DashboardWorkflowStepId, WorkflowStepView } from "@/components/lmnp/dashboard/dashboard-workflow-model";
import {
  resolveActiveWorkflowStepFromRoute,
  resolveWorkflowStepNavigationHref,
} from "@/components/lmnp/dashboard/dashboard-workflow-model";

const CARD_HOVER_TRANSITION = [
  motions.hover.card,
  "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
].join(", ");

const CARD_HOVER_SHADOW = [
  shadows.workflow.hover,
  `0 10px 32px rgba(232, 125, 58, 0.08)`,
  `0 0 0 1px rgba(255, 196, 154, 0.22)`,
].join(", ");

function stepShadow(status: WorkflowStepView["status"], isRouteActive: boolean, hovered: boolean) {
  if (hovered) return CARD_HOVER_SHADOW;
  if (isRouteActive) return shadows.workflow.active;
  if (status === "current") return shadows.workflow.active;
  if (status === "completed") return shadows.workflow.completed;
  return shadows.workflow.default;
}

function stepBorderColor(status: WorkflowStepView["status"], isRouteActive: boolean) {
  if (isRouteActive || status === "current") return colors.border.selected;
  if (status === "completed") return colors.success.border;
  return colors.border.subtle;
}

function stepBackground(status: WorkflowStepView["status"], isRouteActive: boolean) {
  if (isRouteActive || status === "current") {
    return [
      `radial-gradient(ellipse 90% 70% at 100% 0%, ${colors.orange[100]} 0%, transparent 68%)`,
      gradients.card.interactive,
    ].join(", ");
  }
  if (status === "completed") return gradients.workflow.success;
  return gradients.card.elevated;
}

function StepIcon({ id }: { id: DashboardWorkflowStepId }) {
  const stroke = colors.orange[500];
  const common = { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", "aria-hidden": true as const };

  switch (id) {
    case "dashboard":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="6" height="6" rx="1.5" stroke={stroke} strokeWidth="1.4" />
          <rect x="11" y="3" width="6" height="6" rx="1.5" stroke={stroke} strokeWidth="1.4" />
          <rect x="3" y="11" width="6" height="6" rx="1.5" stroke={stroke} strokeWidth="1.4" />
          <rect x="11" y="11" width="6" height="6" rx="1.5" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
    case "activite":
      return (
        <svg {...common}>
          <path d="M4 15V8l6-3 6 3v7" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M8 15v-4h4v4" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
    case "logement":
      return (
        <svg {...common}>
          <path d="M3 10.5 10 4l7 6.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.5Z" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
    case "credit":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="14" height="10" rx="2" stroke={stroke} strokeWidth="1.4" />
          <path d="M3 9h14" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
    case "amortissement":
      return (
        <svg {...common}>
          <path d="M5 15V7h4v8M11 15V5h4v10" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "revenus":
      return (
        <svg {...common}>
          <path d="M4 14c2.5-4 4.5-4 6 0s3.5 4 6 0" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "charges":
      return (
        <svg {...common}>
          <path d="M6 5h8M6 10h8M6 15h5" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M6 10.5 9 13.5 14 7.5" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="10" cy="10" r="7" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
  }
}

function StatusLine({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="space-y-1">
      <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>{label}</p>
      <p
        style={{
          ...typography.caption.desktop,
          color: accent ? colors.text.accent : colors.text.secondary,
          fontWeight: accent ? typography.fontWeight.medium : typography.fontWeight.regular,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function ImporterCta() {
  return (
    <span
      className="inline-flex min-h-[44px] w-full items-center justify-center"
      style={{
        ...typography.button.desktop,
        color: colors.text.inverse,
        backgroundImage: gradients.button.primary,
        borderRadius: radius.full,
        boxShadow: shadows.button.primary,
      }}
    >
      Importer
    </span>
  );
}

function WorkflowStepCard({
  step,
  index,
  isRouteActive,
}: {
  step: WorkflowStepView;
  index: number;
  isRouteActive: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const href = resolveWorkflowStepNavigationHref(step);
  const lifted = hovered;

  return (
    <Link
      href={href}
      aria-current={isRouteActive ? "page" : undefined}
      className="group block h-full outline-none"
      style={{
        cursor: "pointer",
        textDecoration: "none",
        color: "inherit",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <article
        className="flex h-full flex-col"
        style={{
          minHeight: "320px",
          padding: spacing.card.md,
          borderRadius: radius.xl,
          border: `1px solid ${stepBorderColor(step.status, isRouteActive)}`,
          backgroundImage: stepBackground(step.status, isRouteActive),
          boxShadow: stepShadow(step.status, isRouteActive, hovered),
          transform: lifted ? "translateY(-2px)" : "translateY(0)",
          transition: CARD_HOVER_TRANSITION,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-10 w-10 items-center justify-center"
              style={{
                borderRadius: radius.lg,
                backgroundColor:
                  step.status === "completed"
                    ? colors.success.surface
                    : step.status === "current" || isRouteActive
                      ? colors.surface.selected
                      : colors.surface.secondary,
                border: `1px solid ${
                  step.status === "completed"
                    ? colors.success.border
                    : step.status === "current" || isRouteActive
                      ? colors.border.selected
                      : colors.border.subtle
                }`,
              }}
            >
              <StepIcon id={step.id} />
            </span>
            <div>
              <p
                style={{
                  ...typography.caption.desktop,
                  color: colors.text.muted,
                  letterSpacing: typography.letterSpacing.label,
                }}
              >
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3
                style={{
                  fontFamily: typography.fontFamily.display,
                  fontWeight: typography.fontWeight.regular,
                  fontSize: typography.fontSize.lg,
                  color: step.status === "upcoming" && !isRouteActive ? colors.text.muted : colors.text.primary,
                }}
              >
                {step.label}
              </h3>
            </div>
          </div>
          {step.status === "completed" ? (
            <span
              style={{
                ...typography.caption.desktop,
                color: colors.success.DEFAULT,
                padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
                borderRadius: radius.full,
                border: `1px solid ${colors.success.border}`,
                backgroundColor: colors.success.surface,
              }}
            >
              Configuré
            </span>
          ) : null}
        </div>

        <div
          className="mt-5 space-y-4"
          style={{
            padding: spacing.scale[3],
            borderRadius: radius.lg,
            backgroundColor: colors.surface.primary,
            border: `1px solid ${colors.border.subtle}`,
          }}
        >
          <StatusLine label="Document demandé" value={step.requestedDocument} accent />
          <StatusLine label="Extraction IA" value={step.extractionState} />
          <StatusLine
            label="Corrections"
            value={step.correctionState}
            accent={step.correctionsRemaining > 0}
          />
          <StatusLine
            label="Validation"
            value={step.validationState}
            accent={step.validationBadge === "pending"}
          />
        </div>

        {step.status === "current" && step.id !== "dashboard" ? (
          <div className="mt-auto pt-5">
            <ImporterCta />
          </div>
        ) : step.status === "completed" && step.dossierSummary ? (
          <p
            className="mt-auto pt-5"
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize.base,
              color: colors.success.DEFAULT,
              lineHeight: typography.lineHeight.relaxed,
            }}
          >
            {step.dossierSummary}
          </p>
        ) : (
          <p
            className="mt-auto pt-5"
            style={{ ...typography.caption.desktop, color: colors.text.muted, lineHeight: typography.lineHeight.relaxed }}
          >
            {step.documentPrompt}
          </p>
        )}
      </article>
    </Link>
  );
}

export function DashboardWorkflow({ steps }: { steps: WorkflowStepView[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeStepId = useMemo(
    () => resolveActiveWorkflowStepFromRoute(pathname, searchParams.get("step")),
    [pathname, searchParams],
  );

  return (
    <section aria-label="Parcours LMNP">
      <div className="relative overflow-x-auto pb-2">
        <ol className="flex min-w-[1280px] gap-4">
          {steps.map((step, index) => (
            <li key={step.id} className="min-w-[240px] flex-1">
              <WorkflowStepCard
                step={step}
                index={index}
                isRouteActive={activeStepId === step.id}
              />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
