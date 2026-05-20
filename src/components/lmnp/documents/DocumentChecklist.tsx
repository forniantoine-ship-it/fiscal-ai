"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLmnp } from "@/lib/lmnp/store";
import {
  computeDocumentChecklist,
  countMissingRequired,
} from "@/lib/lmnp/services/document-checklist";

export function DocumentChecklist() {
  const { workspace } = useLmnp();
  const base = `/app/exercices/${workspace.fiscalYear.id}`;

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
    <section className="glass rounded-2xl border border-white/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-200">Pièces attendues</p>
          <p className="mt-1 text-xs text-zinc-500">
            {presentCount}/{items.length} reçue{presentCount > 1 ? "s" : ""}
            {missingRequired > 0 && (
              <span className="text-amber-400">
                {" "}
                · {missingRequired} manquante{missingRequired > 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        {missingRequired > 0 && (
          <Link
            href={`${base}/alertes`}
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
          >
            Voir les alertes →
          </Link>
        )}
      </div>

      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm ${
              item.status === "present"
                ? "bg-emerald-500/5"
                : item.status === "missing"
                  ? "bg-amber-500/5"
                  : "bg-white/[0.02]"
            }`}
          >
            <div className="min-w-0">
              <p className="font-medium text-zinc-300">{item.label}</p>
              {item.hint && <p className="text-[10px] text-zinc-600">{item.hint}</p>}
            </div>
            <StatusChip status={item.status} level={item.level} />
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-zinc-600">
        Pas de jargon comptable — ajoutez simplement les documents que vous avez sous la main.
      </p>
    </section>
  );
}

function StatusChip({
  status,
  level,
}: {
  status: "present" | "missing" | "recommended";
  level: string;
}) {
  if (status === "present") {
    return (
      <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
        Reçu ✓
      </span>
    );
  }
  if (status === "missing") {
    return (
      <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
        {level === "conditional" ? "À fournir" : "Manquant"}
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
      Recommandé
    </span>
  );
}
