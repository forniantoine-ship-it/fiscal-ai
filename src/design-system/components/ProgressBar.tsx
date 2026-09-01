import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";

export type ProgressBarProps = {
  value: number;
  max?: number;
  label?: string;
};

export function ProgressBar({ value, max = 100, label }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, Math.round((value / max) * 100)));

  return (
    <div>
      {label ? (
        <div className="mb-2 flex items-center justify-between text-sm">
          <span style={{ color: colors.text.secondary }}>{label}</span>
          <span style={{ color: colors.text.primary }}>{percent}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          height: "6px",
          borderRadius: radius.full,
          backgroundColor: colors.surface.tertiary,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            borderRadius: radius.full,
            backgroundColor: colors.orange[500],
            transition: "width 400ms ease",
          }}
        />
      </div>
    </div>
  );
}

export default ProgressBar;
