import { getConfidenceBand } from "@/lib/lmnp/engine";

export function ConfidencePill({ score }: { score: number }) {
  const band = getConfidenceBand(score);
  const className =
    band === "high"
      ? "bg-emerald-500/15 text-emerald-400"
      : band === "medium"
        ? "bg-amber-500/15 text-amber-400"
        : "bg-red-500/10 text-red-300";

  const label =
    band === "high" ? "Lecture nette" : band === "medium" ? "À vérifier" : "Prioritaire";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${className}`}
      title={`Confiance de lecture ${score} % — confirmez le montant`}
    >
      {label} · {score} %
    </span>
  );
}
