"use client";

import { useState } from "react";

import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

type ValidationGenerateCtaProps = {
  disabled?: boolean;
  onClick: () => void;
};

export function ValidationGenerateCta({ disabled = false, onClick }: ValidationGenerateCtaProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <div className="flex w-full justify-center">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="inline-flex min-h-[48px] items-center justify-center px-10 outline-none"
        style={{
          ...typography.button.desktop,
          color: colors.text.primary,
          backgroundColor: pressed
            ? colors.orange[100]
            : hovered
              ? colors.surface.selected
              : colors.surface.secondary,
          border: `1px solid ${hovered ? colors.border.selected : colors.border.default}`,
          borderRadius: radius.full,
          boxShadow: hovered ? shadows.card.hover : shadows.card.default,
          transition: motions.hover.button,
          opacity: disabled ? 0.45 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          setPressed(false);
        }}
        onMouseDown={() => !disabled && setPressed(true)}
        onMouseUp={() => setPressed(false)}
      >
        Générer ma déclaration
      </button>
    </div>
  );
}
