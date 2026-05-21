import { getConfidenceBand } from "@/lib/lmnp/engine";
import { isPreValidated } from "@/lib/lmnp/validation/display";

interface ConfidenceScoreProps {
  score: number;
  size?: "sm" | "md";
  showRing?: boolean;
}

export function ConfidenceScore({ score, size = "sm", showRing = true }: ConfidenceScoreProps) {
  const band = getConfidenceBand(score);
  const preValidated = isPreValidated(score);

  const colorClass =
    band === "high"
      ? "text-accent"
      : band === "medium"
        ? "text-amber-400"
        : "text-red-300";

  const bgClass =
    band === "high"
      ? "bg-accent-muted"
      : band === "medium"
        ? "bg-amber-500/15"
        : "bg-red-500/10";

  const label =
    band === "high" ? "Lecture nette" : band === "medium" ? "À vérifier" : "Prioritaire";

  const textSize = size === "md" ? "text-xs" : "text-[10px]";
  const ringSize = size === "md" ? "h-11 w-11" : "h-9 w-9";

  return (
    <div className="flex items-center gap-2">
      {showRing && (
        <div
          className={`relative flex shrink-0 items-center justify-center rounded-full ${ringSize} ${bgClass}`}
          title={`Confiance ${score} %`}
        >
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-white/10"
            />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={`${(score / 100) * 94.2} 94.2`}
              className={colorClass}
              strokeLinecap="round"
            />
          </svg>
          <span className={`relative text-[10px] font-bold ${colorClass}`}>{score}</span>
        </div>
      )}
      <div className="min-w-0">
        <p className={`font-semibold ${textSize} ${colorClass}`}>{label}</p>
        <p className="text-[10px] text-stone-500">{score} % confiance</p>
        {preValidated && (
          <p className="text-[10px] text-accent/80">Éligible validation rapide</p>
        )}
      </div>
    </div>
  );
}
