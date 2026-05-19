"use client";

import { FIELD_REGISTRY, type FieldKey } from "@/lib/lmnp/types/field-keys";
import { useLmnp } from "@/lib/lmnp/store";
import { formatMoney } from "@/lib/lmnp/types/values";

interface LedgerTabViewProps {
  tab: "activite" | "recettes" | "depenses" | "immobilisations" | "emprunts";
  title: string;
  description: string;
}

export function LedgerTabView({ tab, title, description }: LedgerTabViewProps) {
  const { workspace } = useLmnp();
  const fieldKeys = (Object.keys(FIELD_REGISTRY) as FieldKey[]).filter(
    (k) => FIELD_REGISTRY[k].tab === tab,
  );

  const entries = workspace.ledgerEntries.filter((e) =>
    fieldKeys.includes(e.fieldKey),
  );
  const pending = workspace.validationItems.filter(
    (v) => v.status === "pending" && fieldKeys.includes(v.fieldKey),
  );

  return (
    <div className="space-y-6">
      {entries.length === 0 && pending.length === 0 ? (
        <p className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500">
          Aucune donnée pour l&apos;instant. Ajoutez des documents puis confirmez les montants
          dans Validation.
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="glass flex items-center justify-between rounded-xl px-5 py-4">
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  {FIELD_REGISTRY[entry.fieldKey].label}
                </p>
                <p className="text-xs text-emerald-400/80">Validé par vous</p>
              </div>
              <p className="text-lg font-semibold text-zinc-100">
                {entry.value.type === "money"
                  ? formatMoney(entry.value)
                  : entry.value.type === "text"
                    ? entry.value.text
                    : entry.value.type === "enum"
                      ? entry.value.enumKey
                      : "—"}
              </p>
            </li>
          ))}
          {pending.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4"
            >
              <div>
                <p className="text-sm font-medium text-zinc-200">{item.label}</p>
                <p className="text-xs text-amber-400">À confirmer dans Validation</p>
              </div>
              <p className="text-lg font-semibold text-zinc-400">
                {item.proposedValue.type === "money"
                  ? formatMoney(item.proposedValue)
                  : "—"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
