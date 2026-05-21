"use client";

import type { LedgerEntry, LmnpDocument } from "@/lib/lmnp/types";
import type { NormalizedValue } from "@/lib/lmnp/types/values";
import { formatMoney } from "@/lib/lmnp/types/values";
import {
  formatLedgerSourceLine,
  getLedgerOriginBadge,
} from "@/lib/lmnp/validation/ledger-display";

function formatValue(value: NormalizedValue): string {
  switch (value.type) {
    case "money":
      return formatMoney(value);
    case "text":
      return value.text;
    case "enum":
      return value.enumKey;
    case "date":
      return new Date(value.date).toLocaleDateString("fr-FR");
    default:
      return "—";
  }
}

interface LedgerLineRowProps {
  entry: LedgerEntry;
  document?: LmnpDocument | null;
  showFieldLabel?: boolean;
  compactAmount?: boolean;
  onEdit?: () => void;
}

export function LedgerLineRow({
  entry,
  document,
  showFieldLabel = false,
  compactAmount = false,
  onEdit,
}: LedgerLineRowProps) {
  const badge = getLedgerOriginBadge(entry.origin);
  const sourceLine = formatLedgerSourceLine({
    document,
    documentType: entry.sourceDocumentType ?? document?.documentType,
    fileName: document?.fileName,
  });

  return (
    <li className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1 space-y-2">
        {showFieldLabel && entry.label && (
          <p className="text-sm font-medium text-stone-800">{entry.label}</p>
        )}

        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${badge.className}`}
        >
          {badge.label}
        </span>

        <div className="space-y-0.5">
          <p className="truncate text-xs text-stone-500">
            Source : <span className="text-stone-600">{sourceLine}</span>
          </p>
          {entry.updatedAt && entry.version > 1 && (
            <p className="text-[10px] text-stone-500">
              Historique · version {entry.version}
              {entry.editNote ? ` · ${entry.editNote}` : ""}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <p
          className={`font-semibold tabular-nums text-stone-900 ${compactAmount ? "text-sm" : "text-lg"}`}
        >
          {formatValue(entry.value)}
        </p>
        {onEdit && (entry.value.type === "money" || entry.value.type === "text") && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-stone-600 ring-1 ring-stone-200 transition-colors hover:bg-stone-100 hover:text-stone-800"
          >
            Modifier
          </button>
        )}
      </div>
    </li>
  );
}
