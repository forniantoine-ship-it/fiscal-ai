import { type CSSProperties } from "react";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

type SectionHeaderProps = {
  number: 1 | 2 | 3;
  surtitle: string;
  title: string;
  showRailAbove?: boolean;
  showRailBelow?: boolean;
  /** Couche CSS du verrou d'axe chapitre (ex. pan-y hors carrousel écran 2). */
  touchAction?: CSSProperties["touchAction"];
};

function NumberPill({ number }: { number: 1 | 2 | 3 }) {
  return (
    <span
      className="relative z-10 inline-flex shrink-0 items-center justify-center"
      style={{
        width: "36px",
        height: "36px",
        borderRadius: radius.full,
        backgroundColor: colors.orange[500],
        color: colors.text.inverse,
        fontFamily: typography.fontFamily.sans,
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
        boxShadow: `0 0 0 4px ${colors.orange[50]}`,
      }}
    >
      {number}
    </span>
  );
}

export function SectionHeader({
  number,
  surtitle,
  title,
  showRailAbove = false,
  showRailBelow = true,
  touchAction,
}: SectionHeaderProps) {
  return (
    <div
      className="flex"
      style={{ gap: spacing.scale[6], marginBottom: spacing.scale[8], touchAction }}
    >
      <div
        className="flex flex-col items-center"
        style={{ width: spacing.scale[9], minHeight: showRailAbove ? spacing.scale[10] : undefined }}
      >
        {showRailAbove ? (
          <div
            aria-hidden
            style={{
              width: "1px",
              flex: 1,
              minHeight: spacing.scale[6],
              borderLeft: `2px dashed ${colors.border.default}`,
            }}
          />
        ) : (
          <div style={{ height: spacing.scale[2] }} />
        )}
        <NumberPill number={number} />
        {showRailBelow ? (
          <div
            aria-hidden
            style={{
              width: "1px",
              flex: 1,
              minHeight: spacing.scale[4],
              borderLeft: `2px dashed ${colors.border.default}`,
            }}
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1 pt-1">
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.accent,
            letterSpacing: typography.letterSpacing.caps,
            textTransform: "uppercase",
            fontWeight: typography.fontWeight.medium,
          }}
        >
          {surtitle}
        </p>
        <h2
          className="mt-2"
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: `clamp(${typography.sectionTitle.mobile.fontSize}px, 4vw, ${typography.sectionTitle.desktop.fontSize}px)`,
            lineHeight: typography.lineHeight.display,
            letterSpacing: typography.letterSpacing.display,
            fontWeight: typography.fontWeight.regular,
            color: colors.text.primary,
          }}
        >
          {title}
        </h2>
      </div>
    </div>
  );
}
