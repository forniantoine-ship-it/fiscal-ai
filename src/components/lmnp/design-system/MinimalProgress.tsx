interface MinimalProgressProps {
  percent: number;
  label?: string;
  className?: string;
}

export function MinimalProgress({ percent, label, className = "" }: MinimalProgressProps) {
  return (
    <div className={className}>
      {label && (
        <div className="mb-2 flex items-baseline justify-between text-[11px] text-stone-500">
          <span>{label}</span>
          <span className="tabular-nums">{percent}%</span>
        </div>
      )}
      <div
        className="h-px overflow-hidden bg-stone-200/80"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-stone-400/70 transition-[width] duration-700 ease-out"
          style={{ width: `${Math.min(100, Math.max(percent, 2))}%` }}
        />
      </div>
    </div>
  );
}
