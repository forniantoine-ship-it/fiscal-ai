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
        size === "lg" ? "text-lg text-zinc-50" : "text-sm text-zinc-200"
      } ${muted ? "text-zinc-500 line-through decoration-zinc-600" : ""}`}
    >
      {formatNormalizedValue(value)}
    </span>
  );
}
