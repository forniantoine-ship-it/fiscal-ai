import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { WorkflowStepView } from "@/components/lmnp/dashboard/dashboard-workflow-model";

export function DashboardActiveStepCard({ step }: { step: WorkflowStepView }) {
  return (
    <section
      className="mx-auto max-w-3xl overflow-hidden text-center"
      style={{
        padding: spacing.card.lg,
        borderRadius: radius.xl,
        border: `1px solid ${colors.border.selected}`,
        boxShadow: shadows.card.hover,
        backgroundImage: [
          `radial-gradient(ellipse 80% 60% at 50% 0%, ${colors.orange[100]} 0%, transparent 68%)`,
          gradients.card.highlight,
        ].join(", "),
      }}
    >
      <p
        style={{
          ...typography.caption.desktop,
          color: colors.text.accent,
          letterSpacing: typography.letterSpacing.label,
          textTransform: "uppercase",
        }}
      >
        Étape en cours · {step.label}
      </p>
      <h2
        className="mx-auto mt-4 max-w-2xl text-2xl sm:text-3xl"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          lineHeight: typography.lineHeight.title,
          color: colors.text.primary,
        }}
      >
        {step.documentPrompt}
      </h2>

      {step.aiExtracts.length > 0 ? (
        <div className="mx-auto mt-5 flex max-w-xl flex-wrap justify-center gap-2">
          {step.aiExtracts.map((field) => (
            <span
              key={field}
              style={{
                ...typography.caption.desktop,
                color: colors.text.secondary,
                padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
                borderRadius: radius.full,
                border: `1px solid ${colors.border.subtle}`,
                backgroundColor: colors.surface.primary,
              }}
            >
              IA · {field}
            </span>
          ))}
        </div>
      ) : null}

      <p className="mx-auto mt-5 max-w-xl" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
        {step.documentDetected
          ? `Document détecté : ${step.documentDetected}. ${step.extractionState}.`
          : step.extractionState}
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button href={step.uploadHref}>Importer le document</Button>
        {step.correctionsRemaining > 0 ? (
          <Button href={step.href} variant="secondary">
            Corriger ({step.correctionsRemaining})
          </Button>
        ) : null}
      </div>
    </section>
  );
}
