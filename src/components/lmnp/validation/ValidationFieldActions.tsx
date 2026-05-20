interface ValidationFieldActionsProps {
  onApprove: () => void;
  onCorrect: () => void;
  onReject: () => void;
  compact?: boolean;
  approveLabel?: string;
}

export function ValidationFieldActions({
  onApprove,
  onCorrect,
  onReject,
  compact = false,
  approveLabel = "Approuver",
}: ValidationFieldActionsProps) {
  const btn = compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "mt-4"}`}>
      <button
        type="button"
        onClick={onApprove}
        className={`rounded-full bg-emerald-500 font-semibold text-zinc-950 hover:bg-emerald-400 ${btn}`}
      >
        {approveLabel}
      </button>
      <button
        type="button"
        onClick={onCorrect}
        className={`rounded-full border border-white/10 font-medium text-zinc-300 hover:bg-white/5 ${btn}`}
      >
        Corriger
      </button>
      <button
        type="button"
        onClick={onReject}
        className={`rounded-full font-medium text-zinc-500 hover:bg-red-500/10 hover:text-red-400 ${btn}`}
      >
        Rejeter
      </button>
    </div>
  );
}
