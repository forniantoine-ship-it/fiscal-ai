import type { NormalizedValue } from "@/lib/lmnp/types";
import { formatNormalizedValue } from "@/lib/lmnp/validation/display";
import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";

interface NormalizedValueDisplayProps {
  value: NormalizedValue;
  size?: "sm" | "lg";
  muted?: boolean;
}

export function NormalizedValueDisplay({
  value,
  size = "lg",
  muted = false,
}: NormalizedValueDisplayProps) {
  return (
    <span
      className="tabular-nums"
      style={{
        ...(size === "lg" ? typography.cardTitle.desktop : typography.body.desktop),
        color: muted ? colors.text.muted : colors.text.primary,
        fontWeight: typography.fontWeight.medium,
        textDecoration: muted ? "line-through" : undefined,
      }}
    >
      {formatNormalizedValue(value)}
    </span>
  );
}
