"use client";

import Link from "next/link";
import type { Extraction, OcrFieldKey, ValidationItem } from "@/lib/lmnp/types";
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
  activeFieldKey?: OcrFieldKey | null;
  onFieldHover?: (fieldKey: OcrFieldKey | null) => void;
  onApprove: () => void;
  onCorrect: () => void;
  onReject: () => void;
}

export function ValidationFieldRow({
  item,
  extractions,
  activeFieldKey,
  onFieldHover,
  onApprove,
  onCorrect,
  onReject,
}: ValidationFieldRowProps) {
  const preValidated = isPreValidated(item.confidence);
  const linkedExtractions = extractions.filter((e) => item.extractionIds.includes(e.id));
  const tabLabel = getTabLabelForField(item.fieldKey);
  const primaryExtraction = linkedExtractions[0];
  const warnings = linkedExtractions.flatMap((e) => e.warnings ?? []);
  const isHighlighted =
    primaryExtraction?.ocrFieldKey && activeFieldKey === primaryExtraction.ocrFieldKey;

  return (
    <article
      className={`rounded-xl border p-4 transition-colors sm:p-5 ${
        isHighlighted
          ? "border-accent/30 bg-accent-subtle ring-1 ring-accent/20"
          : preValidated
            ? "border-accent/25 bg-accent-subtle shadow-[inset_3px_0_0_0_rgba(52,211,153,0.6)]"
            : "border-stone-200 bg-stone-100/80"
      }`}
      onMouseEnter={() => {
        if (primaryExtraction?.ocrFieldKey) onFieldHover?.(primaryExtraction.ocrFieldKey);
      }}
      onMouseLeave={() => onFieldHover?.(null)}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium text-stone-900">{item.label}</h4>
            {item.isRequired && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                Obligatoire
              </span>
            )}
            {preValidated && <PreValidatedBadge />}
            {primaryExtraction?.ocrFieldKey && (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">
                Détecté sur le document
              </span>
            )}
          </div>

          <NormalizedValueDisplay value={item.proposedValue} />

          {linkedExtractions.length > 0 && (
            <ul className="space-y-1.5 rounded-lg bg-stone-100 px-3 py-2 text-xs">
              {linkedExtractions.map((ext) => (
                <li key={ext.id} className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-stone-500">
                      Extrait IA : <span className="text-stone-700">{ext.rawValue}</span>
                    </span>
                    <ConfidenceScore score={ext.confidence} size="sm" showRing={false} />
                  </div>
                  {ext.warnings && ext.warnings.length > 0 && (
                    <ul className="text-stone-500">
                      {ext.warnings.map((w) => (
                        <li key={w}>⚠ {w}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}

          {warnings.length > 0 && linkedExtractions.length === 0 && (
            <p className="text-xs text-stone-500">{warnings[0]}</p>
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

      <p className="mt-3 text-xs text-stone-500">
        Approuver crée une ligne dans l&apos;onglet{" "}
        <span className="text-accent/80">{tabLabel}</span> — modification possible ensuite.
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
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-100/80 px-4 py-3 text-sm">
      <div className="min-w-0">
        <span className="text-stone-600">{item.label}</span>
        {item.documentFileName && (
          <p className="truncate text-[10px] text-stone-500">Source : {item.documentFileName}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-accent/90">{formatNormalizedValue(value)}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            item.status === "ignored"
              ? "bg-stone-400/10 text-stone-500"
              : "bg-accent/10 text-accent"
          }`}
        >
          {statusLabel}
        </span>
        {item.status !== "ignored" && (
          <Link
            href={tabHref}
            className="text-[10px] font-medium text-stone-500 hover:text-accent"
          >
            → {tabLabel}
          </Link>
        )}
      </div>
    </li>
  );
}
