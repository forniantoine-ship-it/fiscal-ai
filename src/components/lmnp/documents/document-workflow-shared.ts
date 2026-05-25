import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";

export const DOCUMENT_WORKFLOW_CARD_STYLE = {
  borderRadius: radius.lg,
  border: `1px solid ${colors.border.subtle}`,
  boxShadow: shadows.card.default,
  padding: spacing.card.md,
  backgroundImage: [
    `radial-gradient(ellipse 88% 52% at 50% -8%, ${colors.orange[100]} 0%, transparent 62%)`,
    gradients.card.elevated,
  ].join(", "),
} as const;

export const SECTION_REVEAL_DELAYS_MS = [0, 400, 800, 1200];
