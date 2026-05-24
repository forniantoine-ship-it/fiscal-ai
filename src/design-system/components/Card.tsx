import type { CSSProperties, ReactNode } from "react";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";

export type CardProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  variant?: "default" | "muted";
};

export function Card({ children, className = "", style, variant = "default" }: CardProps) {
  return (
    <div
      className={className}
      style={{
        borderRadius: radius.lg,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: variant === "muted" ? colors.surface.secondary : colors.surface.primary,
        boxShadow: shadows.card.default,
        padding: spacing.card.md,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default Card;
