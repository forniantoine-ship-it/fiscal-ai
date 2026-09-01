import { colors } from "@/design-system/theme/colors";
import { spacing } from "@/design-system/theme/spacing";

export function DashboardSectionChevron() {
  return (
    <div
      className="flex justify-center"
      style={{ paddingBlock: spacing.scale[10], marginLeft: spacing.scale[9] }}
      aria-hidden
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M5 8l5 5 5-5"
          stroke={colors.text.muted}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
