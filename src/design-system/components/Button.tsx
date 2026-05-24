"use client";

import Link from "next/link";
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useState,
} from "react";

import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  href?: string;
  children: ReactNode;
  className?: string;
};

function isInternalPath(href: string) {
  return href.startsWith("/") && !href.startsWith("//");
}

export function Button({
  variant = "primary",
  href,
  children,
  className = "",
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const baseClass = `inline-flex min-h-[44px] items-center justify-center gap-2 ${className}`;

  const sharedHandlers = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => {
      setHovered(false);
      setPressed(false);
    },
    onMouseDown: () => setPressed(true),
    onMouseUp: () => setPressed(false),
  };

  const primaryStyle = {
    ...typography.button.desktop,
    color: colors.text.inverse,
    backgroundImage: pressed
      ? gradients.button.primaryPressed
      : hovered
        ? gradients.button.primaryHover
        : gradients.button.primary,
    borderRadius: radius.full,
    padding: `${spacing.scale[3]} ${spacing.scale[6]}`,
    boxShadow: hovered ? shadows.button.primaryHover : shadows.button.primary,
    transition: motions.hover.button,
    opacity: disabled ? 0.5 : 1,
    pointerEvents: disabled ? ("none" as const) : undefined,
  };

  const secondaryStyle = {
    ...typography.button.desktop,
    color: colors.text.secondary,
    backgroundColor: hovered ? colors.surface.interactive : colors.surface.primary,
    border: `1px solid ${hovered ? colors.border.strong : colors.border.default}`,
    borderRadius: radius.full,
    padding: `${spacing.scale[3]} ${spacing.scale[6]}`,
    boxShadow: shadows.card.default,
    transition: motions.hover.button,
    opacity: disabled ? 0.5 : 1,
    pointerEvents: disabled ? ("none" as const) : undefined,
  };

  const ghostStyle = {
    ...typography.button.desktop,
    color: hovered ? colors.text.primary : colors.text.secondary,
    backgroundColor: hovered ? colors.hover.ghostBackground : "transparent",
    borderRadius: radius.full,
    padding: `${spacing.scale[3]} ${spacing.scale[5]}`,
    transition: motions.hover.button,
    opacity: disabled ? 0.5 : 1,
    pointerEvents: disabled ? ("none" as const) : undefined,
  };

  const style =
    variant === "primary" ? primaryStyle : variant === "secondary" ? secondaryStyle : ghostStyle;

  if (href && !disabled) {
    if (isInternalPath(href)) {
      return (
        <Link href={href} className={baseClass} style={style} {...sharedHandlers}>
          {children}
        </Link>
      );
    }

    return (
      <a href={href} className={baseClass} style={style} {...sharedHandlers}>
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={baseClass}
      style={style}
      disabled={disabled}
      {...sharedHandlers}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
