"use client";

import Link from "next/link";

import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { WorkflowStepView } from "@/components/lmnp/dashboard/dashboard-workflow-model";

function stepShadow(status: WorkflowStepView["status"]) {
  if (status === "current") return shadows.workflow.active;
  if (status === "completed") return shadows.workflow.completed;
  return shadows.workflow.default;
}

function validationBadgeCopy(step: WorkflowStepView) {
  if (step.validationBadge === "pending") {
    return `${step.correctionsRemaining} correction${step.correctionsRemaining > 1 ? "s" : ""}`;
  }
  if (step.validationBadge === "validated") return "Validé";
  return "—";
}

function MetaRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span style={{ ...typography.caption.desktop, color: colors.text.muted }}>{label}</span>
      <span
        className="text-right"
        style={{
          ...typography.caption.desktop,
          color: accent ? colors.text.accent : colors.text.secondary,
          fontWeight: accent ? typography.fontWeight.medium : typography.fontWeight.regular,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function DashboardWorkflow({ steps }: { steps: WorkflowStepView[] }) {
  return (
    <section aria-label="Parcours LMNP">
      <div className="mb-5 text-center">
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.accent,
            letterSpacing: typography.letterSpacing.label,
            textTransform: "uppercase",
          }}
        >
          Votre parcours guidé
        </p>
        <h2
          className="mt-2"
          style={{
            fontFamily: typography.fontFamily.display,
            fontWeight: typography.fontWeight.regular,
            fontSize: typography.fontSize["2xl"],
            color: colors.text.primary,
          }}
        >
          De vos documents à la validation
        </h2>
      </div>

      <div className="relative overflow-x-auto pb-2">
        <ol className="flex min-w-[1120px] gap-3">
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;

            return (
              <li key={step.id} className="relative min-w-[220px] flex-1">
                <Link href={step.href} style={{ textDecoration: "none" }}>
                  <article
                    className="flex h-full flex-col overflow-hidden"
                    style={{
                      minHeight: "248px",
                      padding: spacing.card.md,
                      borderRadius: radius.xl,
                      border: `1px solid ${
                        step.status === "current"
                          ? colors.border.selected
                          : step.status === "completed"
                            ? colors.success.border
                            : colors.border.subtle
                      }`,
                      backgroundImage:
                        step.status === "current"
                          ? [
                              `radial-gradient(ellipse 90% 70% at 100% 0%, ${colors.orange[200]} 0%, ${colors.orange[100]} 34%, transparent 68%)`,
                              gradients.card.interactive,
                            ].join(", ")
                          : step.status === "completed"
                            ? gradients.workflow.success
                            : gradients.card.elevated,
                      boxShadow: stepShadow(step.status),
                      transition: motions.hover.card,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        style={{
                          ...typography.caption.desktop,
                          color:
                            step.status === "completed"
                              ? colors.success.DEFAULT
                              : step.status === "current"
                                ? colors.text.accent
                                : colors.text.muted,
                          fontWeight: typography.fontWeight.medium,
                        }}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {step.status === "completed" ? (
                        <span aria-hidden style={{ color: colors.success.DEFAULT }}>
                          ✓
                        </span>
                      ) : step.status === "current" ? (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: colors.orange[500],
                            animation: motions.analyzing.pulse,
                          }}
                        />
                      ) : null}
                    </div>

                    <h3
                      className="mt-3"
                      style={{
                        fontFamily: typography.fontFamily.display,
                        fontWeight: typography.fontWeight.regular,
                        fontSize: typography.fontSize.lg,
                        color: step.status === "upcoming" ? colors.text.muted : colors.text.primary,
                      }}
                    >
                      {step.label}
                    </h3>

                    <div className="mt-4 space-y-2">
                      <MetaRow
                        label="Document"
                        value={step.documentDetected ?? "En attente"}
                        accent={Boolean(step.documentDetected)}
                      />
                      <MetaRow label="Extraction IA" value={step.extractionState} />
                      <MetaRow
                        label="Corrections"
                        value={
                          step.correctionsRemaining > 0
                            ? `${step.correctionsRemaining} restante${step.correctionsRemaining > 1 ? "s" : ""}`
                            : "Aucune"
                        }
                        accent={step.correctionsRemaining > 0}
                      />
                      <MetaRow
                        label="Validation"
                        value={validationBadgeCopy(step)}
                        accent={step.validationBadge === "pending"}
                      />
                    </div>

                    <div
                      className="mt-auto pt-4"
                      style={{
                        ...typography.caption.desktop,
                        color: colors.text.muted,
                        borderTop: `1px solid ${colors.border.subtle}`,
                        paddingTop: spacing.scale[3],
                      }}
                    >
                      {step.documentPrompt}
                    </div>
                  </article>
                </Link>
                {!isLast ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-[-8px] top-1/2 z-10 hidden h-px w-4 lg:block"
                    style={{
                      backgroundColor:
                        step.status === "completed" ? colors.orange[300] : colors.border.default,
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
