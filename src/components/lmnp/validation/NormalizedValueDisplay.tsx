import type { NormalizedValue } from "@/lib/lmnp/types";
import { formatNormalizedValue } from "@/lib/lmnp/validation/display";

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
      className={`font-semibold tabular-nums ${
        size === "lg" ? "text-lg text-stone-900" : "text-sm text-stone-800"
      } ${muted ? "text-stone-500 line-through decoration-stone-400" : ""}`}
    >
      {formatNormalizedValue(value)}
    </span>
  );
}
