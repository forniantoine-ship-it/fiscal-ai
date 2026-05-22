import type { ReactNode } from "react";

interface LightCardProps {
  children: ReactNode;
  className?: string;
}

export function LightCard({ children, className = "" }: LightCardProps) {
  return (
    <div
      className={`rounded-[var(--radius-xl)] bg-card px-6 py-5 shadow-[var(--shadow-soft)] ${className}`}
    >
      {children}
    </div>
  );
}
