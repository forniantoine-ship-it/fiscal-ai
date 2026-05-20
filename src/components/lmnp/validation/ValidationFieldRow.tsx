"use client";

import Link from "next/link";
import type { Extraction, ValidationItem } from "@/lib/lmnp/types";
import { FIELD_REGISTRY } from "@/lib/lmnp/types/field-keys";
import { formatNormalizedValue, isPreValidated } from "@/lib/lmnp/validation/display";
import { getTabLabelForField } from "@/lib/lmnp/validation/ledger-display";
import { useLmnp } from "@/lib/lmnp/store";
import { ConfidenceScore } from "./ConfidenceScore";
import { NormalizedValueDisplay } from "./NormalizedValueDisplay";
import { PreValidatedBadge } from "./PreValidatedBadge";
import { ValidationFieldActions } from "./ValidationFieldActions";

interface ValidationFieldRowProps {
  item: ValidationItem;
  extractions: Extraction[];
  onApprove: () => void;
  onCorrect: () => void;
  onReject: () => void;
}

export function ValidationFieldRow({
  item,
  extractions,
  onApprove,
  onCorrect,
  onReject,
}: ValidationFieldRowProps) {
  const preValidated = isPreValidated(item.confidence);
  const linkedExtractions = extractions.filter((e) => item.extractionIds.includes(e.id));
  const tabLabel = getTabLabelForField(item.fieldKey);

  return (
    <article
      className={`rounded-xl border p-4 transition-colors sm:p-5 ${
        preValidated
          ? "border-emerald-500/25 bg-emerald-500/[0.06] shadow-[inset_3px_0_0_0_rgba(52,211,153,0.6)]"
          : "border-white/8 bg-white/[0.02]"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium text-zinc-100">{item.label}</h4>
            {item.isRequired && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                Obligatoire
              </span>
            )}
            {preValidated && <PreValidatedBadge />}
          </div>

          <NormalizedValueDisplay value={item.proposedValue} />

          {linkedExtractions.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-black/20 px-3 py-2 text-xs text-zinc-500">
              {linkedExtractions.map((ext) => (
                <li key={ext.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Extrait IA : <span className="text-zinc-400">{ext.rawValue}</span>
                  </span>
                  <span className="text-zinc-600">{ext.confidence} %</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <ConfidenceScore score={item.confidence} size="sm" />
      </div>

      <ValidationFieldActions
        onApprove={onApprove}
        onCorrect={onCorrect}
        onReject={onReject}
        approveLabel={preValidated ? "Confirmer" : "Approuver"}
      />

      <p className="mt-3 text-xs text-zinc-600">
        Approuver crée une ligne dans l&apos;onglet{" "}
        <span className="text-emerald-500/80">{tabLabel}</span> — modification possible ensuite.
      </p>
    </article>
  );
}

export function ValidationFieldRowDone({ item }: { item: ValidationItem }) {
  const { workspace } = useLmnp();
  const value = item.finalValue ?? item.proposedValue;
  const tabLabel = getTabLabelForField(item.fieldKey);
  const tabHref = `/app/exercices/${workspace.fiscalYear.id}/${FIELD_REGISTRY[item.fieldKey].tab}`;

  const statusLabel =
    item.status === "approved"
      ? "Validé par IA + vous"
      : item.status === "corrected"
        ? "Corrigé par vous"
        : "Rejeté";

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-4 py-3 text-sm">
      <div className="min-w-0">
        <span className="text-zinc-400">{item.label}</span>
        {item.documentFileName && (
          <p className="truncate text-[10px] text-zinc-600">Source : {item.documentFileName}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-emerald-400/90">{formatNormalizedValue(value)}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            item.status === "ignored"
              ? "bg-zinc-500/10 text-zinc-500"
              : "bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {statusLabel}
        </span>
        {item.status !== "ignored" && (
          <Link
            href={tabHref}
            className="text-[10px] font-medium text-zinc-500 hover:text-emerald-400"
          >
            → {tabLabel}
          </Link>
        )}
      </div>
    </li>
  );
}
