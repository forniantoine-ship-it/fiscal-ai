"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

export function PrimaryButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <Link
      href={href}
      className={`inline-flex min-h-[44px] items-center justify-center ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        ...typography.button.desktop,
        color: colors.text.inverse,
        backgroundImage: pressed
          ? gradients.button.primaryPressed
          : hovered
            ? gradients.button.primaryHover
            : gradients.button.primary,
        borderRadius: radius.full,
        padding: `${spacing.scale[3]} ${spacing.scale[8]}`,
        boxShadow: hovered ? shadows.button.primaryHover : shadows.button.primary,
        transition: motions.hover.button,
      }}
    >
      {children}
    </Link>
  );
}

export function SecondaryButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={href}
      className={`inline-flex min-h-[44px] items-center justify-center ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...typography.button.desktop,
        color: colors.text.secondary,
        backgroundColor: hovered ? colors.surface.interactive : colors.surface.primary,
        border: `1px solid ${hovered ? colors.border.strong : colors.border.default}`,
        borderRadius: radius.full,
        padding: `${spacing.scale[3]} ${spacing.scale[8]}`,
        boxShadow: hovered ? shadows.button.secondaryHover : shadows.none,
        transition: motions.hover.ghost,
      }}
    >
      {children}
    </Link>
  );
}
