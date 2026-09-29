import type { ReactNode } from "react";

interface QuietBadgeProps {
  children: ReactNode;
  tone?: "neutral" | "accent" | "pending";
}

export function QuietBadge({ children, tone = "neutral" }: QuietBadgeProps) {
  const tones = {
    neutral: "text-ink-muted",
    accent: "text-ink",
    pending: "text-ink-soft",
  };

  return (
    <span className={`text-[11px] font-normal tracking-wide ${tones[tone]}`}>{children}</span>
  );
}
