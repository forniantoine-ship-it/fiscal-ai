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
        className={`rounded-full bg-accent font-semibold text-white hover:opacity-90 ${btn}`}
      >
        {approveLabel}
      </button>
      <button
        type="button"
        onClick={onCorrect}
        className={`rounded-full border border-stone-200 font-medium text-stone-700 hover:bg-stone-100 ${btn}`}
      >
        Corriger
      </button>
      <button
        type="button"
        onClick={onReject}
        className={`rounded-full font-medium text-stone-500 hover:bg-red-500/10 hover:text-red-400 ${btn}`}
      >
        Rejeter
      </button>
    </div>
  );
}
