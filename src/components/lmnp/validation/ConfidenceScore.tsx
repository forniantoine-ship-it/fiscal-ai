import { getConfidenceBand } from "@/lib/lmnp/engine";
import { isPreValidated } from "@/lib/lmnp/validation/display";
import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";

interface ConfidenceScoreProps {
  score: number;
  size?: "sm" | "md";
  showRing?: boolean;
}

function bandColors(band: ReturnType<typeof getConfidenceBand>) {
  if (band === "high") {
    return {
      foreground: colors.success.DEFAULT,
      background: colors.success.surface,
      border: colors.success.border,
    };
  }
  if (band === "medium") {
    return {
      foreground: colors.warning.DEFAULT,
      background: colors.warning.surface,
      border: colors.warning.border,
    };
  }
  return {
    foreground: colors.error.DEFAULT,
    background: colors.error.surface,
    border: colors.error.border,
  };
}

export function ConfidenceScore({ score, size = "sm", showRing = true }: ConfidenceScoreProps) {
  const band = getConfidenceBand(score);
  const preValidated = isPreValidated(score);
  const palette = bandColors(band);

  const label =
    band === "high" ? "Lecture nette" : band === "medium" ? "À vérifier" : "Prioritaire";

  const ringSize = size === "md" ? 44 : 36;

  return (
    <div className="flex items-center gap-2">
      {showRing ? (
        <div
          className="relative flex shrink-0 items-center justify-center rounded-full"
          style={{
            width: ringSize,
            height: ringSize,
            backgroundColor: palette.background,
            border: `1px solid ${palette.border}`,
          }}
          title={`Confiance ${score} %`}
        >
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36" aria-hidden>
            <circle cx="18" cy="18" r="15" fill="none" stroke={colors.border.subtle} strokeWidth="2" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke={palette.foreground}
              strokeWidth="2"
              strokeDasharray={`${(score / 100) * 94.2} 94.2`}
              strokeLinecap="round"
            />
          </svg>
          <span
            style={{
              ...typography.caption.desktop,
              color: palette.foreground,
              fontWeight: typography.fontWeight.medium,
            }}
          >
            {score}
          </span>
        </div>
      ) : null}
      <div className="min-w-0">
        <p
          style={{
            ...typography.caption.desktop,
            color: palette.foreground,
            fontWeight: typography.fontWeight.medium,
          }}
        >
          {label}
        </p>
        <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>{score} % confiance</p>
        {preValidated ? (
          <p style={{ ...typography.caption.desktop, color: colors.text.accent }}>
            Éligible validation rapide
          </p>
        ) : null}
      </div>
    </div>
  );
}
