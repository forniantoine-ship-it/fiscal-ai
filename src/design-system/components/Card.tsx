"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";

export type CardProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  variant?: "default" | "muted";
  interactive?: boolean;
};

export function Card({
  children,
  className = "",
  style,
  variant = "default",
  interactive = false,
}: CardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={className}
      style={{
        borderRadius: radius.lg,
        border: `1px solid ${hovered && interactive ? colors.border.default : colors.border.subtle}`,
        backgroundColor: variant === "muted" ? colors.surface.secondary : colors.surface.primary,
        boxShadow: hovered && interactive ? shadows.card.hover : shadows.card.default,
        padding: spacing.card.md,
        transition: motions.hover.card,
        ...style,
      }}
      onMouseEnter={interactive ? () => setHovered(true) : undefined}
      onMouseLeave={interactive ? () => setHovered(false) : undefined}
    >
      {children}
    </div>
  );
}

export default Card;
