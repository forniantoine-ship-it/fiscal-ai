"use client";

import type { ValidationItem } from "@/lib/lmnp/types";
import type { NormalizedValue } from "@/lib/lmnp/types/values";
import { formatMoney } from "@/lib/lmnp/types/values";
import { humanDocumentLabel } from "@/lib/lmnp/constants/copilot-copy";
import type { LmnpDocument } from "@/lib/lmnp/types";
import { ConfidencePill } from "@/components/lmnp/shared/ConfidencePill";

function formatValue(value: NormalizedValue): string {
  if (value.type === "money") return formatMoney(value);
  if (value.type === "text") return value.text;
  return "—";
}

interface PendingAmountRowProps {
  item: ValidationItem;
  document?: LmnpDocument | null;
  onConfirm: () => void;
  onCorrect: () => void;
}

export function PendingAmountRow({
  item,
  document,
  onConfirm,
  onCorrect,
}: PendingAmountRowProps) {
  const sourceLabel = document
    ? humanDocumentLabel(document.documentType, document.fileName)
    : item.documentFileName ?? "Document";

  return (
    <li className="flex flex-col gap-3 bg-accent/[0.04] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-stone-800">{item.label}</p>
        <p className="mt-1 text-xs text-stone-500">
          Pré-rempli par l’IA · source : {sourceLabel}
        </p>
        <div className="mt-2">
          <ConfidencePill score={item.confidence} />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <p className="text-lg font-semibold tabular-nums text-stone-900">
          {formatValue(item.proposedValue)}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Confirmer
          </button>
          <button
            type="button"
            onClick={onCorrect}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-stone-700 ring-1 ring-white/15 hover:bg-stone-100"
          >
            Corriger
          </button>
        </div>
      </div>
    </li>
  );
}
