"use client";

import { useMemo } from "react";
import { useLmnp } from "@/lib/lmnp/store";
import {
  computeDocumentChecklist,
  countMissingRequired,
} from "@/lib/lmnp/services/document-checklist";

export function DocumentChecklist() {
  const { workspace } = useLmnp();

  const items = useMemo(
    () =>
      computeDocumentChecklist({
        fiscalYear: workspace.fiscalYear,
        properties: workspace.properties,
        documents: workspace.documents,
        validationItems: workspace.validationItems,
        ledgerEntries: workspace.ledgerEntries,
      }),
    [workspace],
  );

  const missingRequired = countMissingRequired(items);
  const presentCount = items.filter((i) => i.status === "present").length;

  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
      <p className="text-sm text-zinc-400">
        {presentCount} sur {items.length} documents reçus
        {missingRequired > 0 && (
          <span className="text-zinc-500">
            {" "}
            · {missingRequired} encore utile{missingRequired > 1 ? "s" : ""}
          </span>
        )}
      </p>

      <ul className="mt-4 space-y-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm"
          >
            <span
              className={
                item.status === "present" ? "text-zinc-300" : "text-zinc-500"
              }
            >
              {item.label}
            </span>
            {item.status === "present" ? (
              <span className="text-xs text-emerald-500/80">✓</span>
            ) : item.status === "missing" ? (
              <span className="text-xs text-zinc-600">—</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
