import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

interface MinimalProgressProps {
  percent: number;
  label?: string;
  className?: string;
}

export function MinimalProgress({ percent, label, className = "" }: MinimalProgressProps) {
  return (
    <div className={className}>
      {label ? (
        <div
          className="mb-2 flex items-baseline justify-between"
          style={{ ...typography.caption.desktop, color: colors.text.muted }}
        >
          <span>{label}</span>
          <span className="tabular-nums">{percent}%</span>
        </div>
      ) : null}
      <div
        style={{
          height: "6px",
          overflow: "hidden",
          borderRadius: radius.full,
          backgroundColor: colors.surface.tertiary,
        }}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, Math.max(percent, 2))}%`,
            borderRadius: radius.full,
            backgroundImage: gradients.workflow.analyzing,
            transition: "width 700ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </div>
    </div>
  );
}
