import type { ReactNode } from "react";

interface QuietBadgeProps {
  children: ReactNode;
  tone?: "neutral" | "accent" | "pending";
}

export function QuietBadge({ children, tone = "neutral" }: QuietBadgeProps) {
  const tones = {
    neutral: "text-stone-500",
    accent: "text-accent",
    pending: "text-stone-600",
  };

  return (
    <span className={`text-[11px] font-normal tracking-wide ${tones[tone]}`}>{children}</span>
  );
}
