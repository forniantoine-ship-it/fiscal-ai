"use client";

import {
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useState,
} from "react";

import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

function fieldStyle(focused: boolean) {
  return {
    width: "100%",
    borderRadius: radius.lg,
    border: `1px solid ${focused ? colors.border.focus : colors.border.default}`,
    backgroundColor: colors.surface.inset,
    padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
    ...typography.body.desktop,
    color: colors.text.primary,
    outline: "none",
    boxShadow: focused ? `0 0 0 3px ${colors.focus.ring}33` : "none",
    transition: motions.hover.card,
  } as const;
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  className?: string;
};

export function Input({ className = "", style, onFocus, onBlur, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <input
      className={className}
      style={{ ...fieldStyle(focused), ...style }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      {...props}
    />
  );
}

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  className?: string;
};

export function TextArea({ className = "", style, onFocus, onBlur, ...props }: TextAreaProps) {
  const [focused, setFocused] = useState(false);

  return (
    <textarea
      className={className}
      style={{ ...fieldStyle(focused), resize: "vertical", minHeight: "120px", ...style }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      {...props}
    />
  );
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  className?: string;
};

export function Select({ className = "", style, onFocus, onBlur, children, ...props }: SelectProps) {
  const [focused, setFocused] = useState(false);

  return (
    <select
      className={className}
      style={{ ...fieldStyle(focused), ...style }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      {...props}
    >
      {children}
    </select>
  );
}

export default Input;
