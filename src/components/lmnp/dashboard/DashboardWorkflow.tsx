"use client";

import Link from "next/link";

import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { JourneyStepId, LmnpJourney } from "@/lib/lmnp/types";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";

type WorkflowGroupId = "documents" | "ocr" | "corrections" | "validation" | "teletransmission";

type WorkflowGroup = {
  id: WorkflowGroupId;
  label: string;
  journeyIds: JourneyStepId[];
  href: string;
};

const WORKFLOW_GROUPS: WorkflowGroup[] = [
  { id: "documents", label: "Documents", journeyIds: ["documents"], href: LMNP_ROUTES.documents },
  { id: "ocr", label: "OCR IA", journeyIds: ["analysis"], href: LMNP_ROUTES.documents },
  { id: "corrections", label: "Corrections", journeyIds: ["validation"], href: LMNP_ROUTES.declarations },
  {
    id: "validation",
    label: "Validation",
    journeyIds: ["dossier", "generate"],
    href: LMNP_ROUTES.declarations,
  },
  {
    id: "teletransmission",
    label: "Télétransmission",
    journeyIds: ["payment", "transmission"],
    href: LMNP_ROUTES.dashboard,
  },
];

function resolveGroupIndex(currentStepId: JourneyStepId): number {
  const idx = WORKFLOW_GROUPS.findIndex((group) => group.journeyIds.includes(currentStepId));
  return idx === -1 ? 0 : idx;
}

function stepShadow(status: "completed" | "current" | "upcoming") {
  if (status === "current") return shadows.workflow.active;
  if (status === "completed") return shadows.workflow.completed;
  return shadows.workflow.default;
}

export function DashboardWorkflow({ journey }: { journey: LmnpJourney }) {
  const activeIndex = journey.isComplete ? WORKFLOW_GROUPS.length : resolveGroupIndex(journey.currentStepId);

  return (
    <nav aria-label="Parcours de déclaration">
      <p
        className="mb-4"
        style={{
          ...typography.caption.desktop,
          color: colors.text.muted,
          letterSpacing: typography.letterSpacing.label,
          textTransform: "uppercase",
        }}
      >
        Votre parcours
      </p>
      <div className="relative overflow-x-auto pb-1">
        <ol className="flex min-w-[640px] items-stretch gap-2 sm:gap-3">
          {WORKFLOW_GROUPS.map((group, index) => {
            let status: "completed" | "current" | "upcoming" = "upcoming";
            if (journey.isComplete || index < activeIndex) status = "completed";
            else if (index === activeIndex) status = "current";

            const isLast = index === WORKFLOW_GROUPS.length - 1;

            return (
              <li key={group.id} className="relative flex min-w-0 flex-1 items-stretch">
                <Link
                  href={group.href}
                  className="group flex min-w-0 flex-1 flex-col"
                  style={{ textDecoration: "none" }}
                >
                  <div
                    className="relative flex min-h-[88px] flex-1 flex-col justify-between overflow-hidden"
                    style={{
                      padding: spacing.scale[4],
                      borderRadius: radius.lg,
                      border: `1px solid ${
                        status === "current"
                          ? colors.border.selected
                          : status === "completed"
                            ? colors.success.border
                            : colors.border.subtle
                      }`,
                      backgroundImage:
                        status === "current"
                          ? [
                              `radial-gradient(ellipse 90% 70% at 100% 0%, ${colors.orange[100]} 0%, transparent 68%)`,
                              gradients.card.interactive,
                            ].join(", ")
                          : status === "completed"
                            ? gradients.workflow.success
                            : gradients.card.elevated,
                      boxShadow: stepShadow(status),
                      transition: motions.hover.card,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        style={{
                          ...typography.caption.desktop,
                          color:
                            status === "completed"
                              ? colors.success.DEFAULT
                              : status === "current"
                                ? colors.text.accent
                                : colors.text.muted,
                          fontWeight: typography.fontWeight.medium,
                        }}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {status === "completed" ? (
                        <span aria-hidden style={{ color: colors.success.DEFAULT, fontSize: "14px" }}>
                          ✓
                        </span>
                      ) : status === "current" ? (
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: colors.orange[500],
                            animation: motions.analyzing.pulse,
                          }}
                        />
                      ) : null}
                    </div>
                    <p
                      className="mt-3"
                      style={{
                        ...typography.body.desktop,
                        color: status === "upcoming" ? colors.text.muted : colors.text.primary,
                        fontWeight: status === "current" ? typography.fontWeight.medium : typography.fontWeight.regular,
                      }}
                    >
                      {group.label}
                    </p>
                    <div
                      className="mt-3 h-1 overflow-hidden rounded-full"
                      style={{ backgroundColor: colors.surface.tertiary }}
                    >
                      <div
                        style={{
                          width:
                            status === "completed" ? "100%" : status === "current" ? "42%" : "0%",
                          height: "100%",
                          borderRadius: radius.full,
                          backgroundColor:
                            status === "completed" ? colors.success.DEFAULT : colors.orange[500],
                          transition: motions.workflow.progress,
                        }}
                      />
                    </div>
                  </div>
                </Link>
                {!isLast ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-[-7px] top-1/2 z-10 hidden h-px w-3 sm:block"
                    style={{
                      backgroundColor:
                        index < activeIndex ? colors.orange[300] : colors.border.default,
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
