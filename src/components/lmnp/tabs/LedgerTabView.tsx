"use client";

import { useMemo } from "react";
import { FIELD_REGISTRY, type FieldKey } from "@/lib/lmnp/types/field-keys";
import { useLmnp } from "@/lib/lmnp/store";
import { isAccumulableFieldKey } from "@/lib/lmnp/services/ledger";
import { formatMoney, sumMoneyValues } from "@/lib/lmnp/types/values";
import type { LedgerEntry, ValidationItem } from "@/lib/lmnp/types";
import type { NormalizedValue } from "@/lib/lmnp/types/values";

interface LedgerTabViewProps {
  tab: "activite" | "recettes" | "depenses" | "immobilisations" | "emprunts";
  title: string;
  description: string;
}

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

function entryOriginLabel(entry: LedgerEntry): string {
  return entry.origin === "ai_extracted" ? "Importé automatiquement (OCR)" : "Validé par vous";
}

function pendingOriginLabel(item: ValidationItem): string {
  return item.confidence >= 95
    ? "En attente de votre confirmation"
    : "Confiance faible — à vérifier";
}

interface FieldGroup {
  fieldKey: FieldKey;
  label: string;
  entries: LedgerEntry[];
  pending: ValidationItem[];
  total?: NormalizedValue;
}

function groupByField(
  fieldKeys: FieldKey[],
  entries: LedgerEntry[],
  pending: ValidationItem[],
): FieldGroup[] {
  const groups: FieldGroup[] = [];

  for (const fieldKey of fieldKeys) {
    const fieldEntries = entries.filter((e) => e.fieldKey === fieldKey);
    const fieldPending = pending.filter((v) => v.fieldKey === fieldKey);
    if (fieldEntries.length === 0 && fieldPending.length === 0) continue;

    const label = FIELD_REGISTRY[fieldKey].label;
    let total: NormalizedValue | undefined;

    if (isAccumulableFieldKey(fieldKey) && fieldEntries.length > 1) {
      total = sumMoneyValues(fieldEntries.map((e) => e.value)) ?? undefined;
    }

    groups.push({ fieldKey, label, entries: fieldEntries, pending: fieldPending, total });
  }

  return groups;
}

export function LedgerTabView({ tab, title, description }: LedgerTabViewProps) {
  const { workspace } = useLmnp();
  const fieldKeys = (Object.keys(FIELD_REGISTRY) as FieldKey[]).filter(
    (k) => FIELD_REGISTRY[k].tab === tab,
  );

  const entries = workspace.ledgerEntries.filter((e) => fieldKeys.includes(e.fieldKey));
  const pending = workspace.validationItems.filter(
    (v) => v.status === "pending" && fieldKeys.includes(v.fieldKey),
  );

  const groups = useMemo(
    () => groupByField(fieldKeys, entries, pending),
    [fieldKeys, entries, pending],
  );

  const documentNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const doc of workspace.documents) map.set(doc.id, doc.fileName);
    return map;
  }, [workspace.documents]);

  return (
    <div className="space-y-6">
      {description && <p className="text-sm text-zinc-500">{description}</p>}

      {groups.length === 0 ? (
        <p className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500">
          Aucune donnée pour l&apos;instant. Ajoutez des documents — les montants à haute
          confiance apparaîtront ici automatiquement après l&apos;analyse OCR.
        </p>
      ) : (
        <ul className="space-y-4">
          {groups.map((group) => (
            <li
              key={group.fieldKey}
              className="glass overflow-hidden rounded-xl border border-white/5"
            >
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                <p className="text-sm font-medium text-zinc-200">{group.label}</p>
                {group.total && (
                  <div className="text-right">
                    <p className="text-lg font-semibold text-emerald-400">
                      {formatValue(group.total)}
                    </p>
                    <p className="text-xs text-zinc-500">Total ({group.entries.length} lignes)</p>
                  </div>
                )}
              </div>

              <ul className="divide-y divide-white/5">
                {group.entries.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      {group.entries.length > 1 && entry.label && (
                        <p className="truncate text-xs text-zinc-500">{entry.label}</p>
                      )}
                      <p className="text-xs text-emerald-400/80">{entryOriginLabel(entry)}</p>
                      {entry.sourceDocumentIds[0] && (
                        <p className="truncate text-xs text-zinc-600">
                          {documentNames.get(entry.sourceDocumentIds[0]) ?? "Document"}
                        </p>
                      )}
                    </div>
                    {!group.total && (
                      <p className="text-base font-semibold text-zinc-100">
                        {formatValue(entry.value)}
                      </p>
                    )}
                    {group.total && (
                      <p className="text-sm font-medium text-zinc-300">
                        {formatValue(entry.value)}
                      </p>
                    )}
                  </li>
                ))}

                {group.pending.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between bg-amber-500/[0.03] px-5 py-3"
                  >
                    <div className="min-w-0">
                      {item.label !== group.label && (
                        <p className="truncate text-xs text-zinc-500">{item.label}</p>
                      )}
                      <p className="text-xs text-amber-400">{pendingOriginLabel(item)}</p>
                      {item.documentFileName && (
                        <p className="truncate text-xs text-zinc-600">{item.documentFileName}</p>
                      )}
                    </div>
                    <p className="text-base font-semibold text-zinc-400">
                      {formatValue(item.proposedValue)}
                    </p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
