"use client";

interface ValidationSummaryBarProps {
  pendingCount: number;
  highConfidenceCount: number;
  analyzedDocumentsCount: number;
  validatedCount: number;
  onBulkApproveHighConfidence: () => void;
}

export function ValidationSummaryBar({
  pendingCount,
  highConfidenceCount,
  analyzedDocumentsCount,
  validatedCount,
  onBulkApproveHighConfidence,
}: ValidationSummaryBarProps) {
  return (
    <div className="glass grid gap-4 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-4 lg:p-5">
      <Stat label="Documents analysés" value={analyzedDocumentsCount} accent="text-stone-900" />
      <Stat label="À confirmer" value={pendingCount} accent="text-amber-400" />
      <Stat
        label="Pré-validés ≥ 95 %"
        value={highConfidenceCount}
        accent="text-accent"
        hint="Lecture nette par l'IA"
      />
      <Stat label="Déjà validés" value={validatedCount} accent="text-accent" />

      {highConfidenceCount > 0 && pendingCount > 0 && (
        <div className="flex items-center sm:col-span-2 lg:col-span-4">
          <button
            type="button"
            onClick={onBulkApproveHighConfidence}
            className="w-full rounded-full border border-accent/25 bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent-muted sm:w-auto"
          >
            Valider tous les champs ≥ 95 % ({highConfidenceCount})
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: number;
  accent: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-stone-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-stone-500">{hint}</p>}
    </div>
  );
}
