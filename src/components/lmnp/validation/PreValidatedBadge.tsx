import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

export function PreValidatedBadge() {
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{
        borderRadius: radius.full,
        border: `1px solid ${colors.workflow.completedBorder}`,
        backgroundColor: colors.workflow.completedBackground,
        padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
        ...typography.caption.desktop,
        color: colors.workflow.completed,
        fontWeight: typography.fontWeight.medium,
      }}
    >
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
      Pré-validé
    </span>
  );
}
