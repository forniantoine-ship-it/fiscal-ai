"use client";

import { useMemo, useState } from "react";
import { FIELD_REGISTRY, type FieldKey } from "@/lib/lmnp/types/field-keys";
import { useLmnp } from "@/lib/lmnp/store";
import { isAccumulableFieldKey } from "@/lib/lmnp/services/ledger";
import { sumMoneyValues } from "@/lib/lmnp/types/values";
import { formatMoney } from "@/lib/lmnp/types/values";
import type { LedgerEntry, ValidationItem } from "@/lib/lmnp/types";
import type { NormalizedValue } from "@/lib/lmnp/types/values";
import { LedgerEditModal } from "./LedgerEditModal";
import { LedgerLineRow } from "./LedgerLineRow";

interface LedgerTabViewProps {
  tab: "activite" | "recettes" | "depenses" | "immobilisations" | "emprunts";
  title: string;
  description: string;
}

function formatValue(value: NormalizedValue): string {
  if (value.type === "money") return formatMoney(value);
  if (value.type === "text") return value.text;
  if (value.type === "enum") return value.enumKey;
  if (value.type === "date") return new Date(value.date).toLocaleDateString("fr-FR");
  return "—";
}

function pendingOriginLabel(item: ValidationItem): string {
  return item.confidence >= 95
    ? "En attente de votre confirmation"
    : "Confiance faible — à vérifier dans Validation";
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

export function LedgerTabView({ tab, description }: LedgerTabViewProps) {
  const { workspace, dispatch } = useLmnp();
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);

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

  const documentsById = useMemo(() => {
    const map = new Map<string, (typeof workspace.documents)[0]>();
    for (const doc of workspace.documents) map.set(doc.id, doc);
    return map;
  }, [workspace.documents]);

  const editingDocument = editingEntry?.sourceDocumentIds[0]
    ? documentsById.get(editingEntry.sourceDocumentIds[0])
    : undefined;

  return (
    <div className="space-y-6">
      {description && <p className="text-sm text-zinc-500">{description}</p>}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-10 text-center">
          <p className="text-sm text-zinc-400">Aucune ligne pour l&apos;instant</p>
          <p className="mt-2 text-xs text-zinc-600">
            Importez un document, puis approuvez-le dans Validation — la ligne apparaît ici
            instantanément.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {groups.map((group) => (
            <li
              key={group.fieldKey}
              className="glass overflow-hidden rounded-xl border border-white/5"
            >
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-zinc-200">{group.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-600">
                    {group.entries.length} ligne{group.entries.length > 1 ? "s" : ""} enregistrée
                    {group.entries.length > 1 ? "s" : ""}
                    {group.pending.length > 0 &&
                      ` · ${group.pending.length} en attente de validation`}
                  </p>
                </div>
                {group.total && (
                  <div className="text-right">
                    <p className="text-lg font-semibold text-emerald-400">
                      {formatValue(group.total)}
                    </p>
                    <p className="text-xs text-zinc-500">Total</p>
                  </div>
                )}
              </div>

              <ul className="divide-y divide-white/5">
                {group.entries.map((entry) => {
                  const doc = entry.sourceDocumentIds[0]
                    ? documentsById.get(entry.sourceDocumentIds[0])
                    : undefined;
                  return (
                    <LedgerLineRow
                      key={entry.id}
                      entry={entry}
                      document={doc}
                      showFieldLabel={group.entries.length > 1 && Boolean(entry.label)}
                      compactAmount={Boolean(group.total)}
                      onEdit={() => setEditingEntry(entry)}
                    />
                  );
                })}

                {group.pending.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-4 bg-amber-500/[0.03] px-5 py-4"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-amber-400">{pendingOriginLabel(item)}</p>
                      {item.documentFileName && (
                        <p className="mt-1 truncate text-xs text-zinc-600">
                          Source : {item.documentFileName}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-base font-semibold text-zinc-400">
                      {formatValue(item.proposedValue)}
                    </p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <LedgerEditModal
        entry={editingEntry}
        documentFileName={editingDocument?.fileName}
        onClose={() => setEditingEntry(null)}
        onSave={(value, note) => {
          if (!editingEntry) return;
          dispatch({
            type: "LEDGER_UPDATE_VALUE",
            ledgerEntryId: editingEntry.id,
            value,
            note,
          });
        }}
      />
    </div>
  );
}
