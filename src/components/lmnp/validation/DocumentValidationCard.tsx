"use client";

import type { DocumentValidationGroup } from "@/lib/lmnp/validation/grouping";
import { DOCUMENT_TYPE_LABELS } from "@/lib/lmnp/validation/grouping";
import { DOCUMENT_CATEGORIES } from "@/lib/lmnp/constants/documents";
import type { ValidationItem } from "@/lib/lmnp/types";
import { ValidationFieldRow } from "./ValidationFieldRow";

interface DocumentValidationCardProps {
  group: DocumentValidationGroup;
  onApprove: (item: ValidationItem) => void;
  onCorrect: (item: ValidationItem) => void;
  onReject: (item: ValidationItem) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function DocumentValidationCard({
  group,
  onApprove,
  onCorrect,
  onReject,
}: DocumentValidationCardProps) {
  const { document, items, extractions, pendingCount, preValidatedCount } = group;
  const pendingItems = items.filter((i) => i.status === "pending");

  if (pendingItems.length === 0) return null;

  const fileName = document?.fileName ?? "Champs sans document source";
  const categoryLabel = document
    ? DOCUMENT_CATEGORIES.find((c) => c.id === document.category)?.label
    : null;
  const typeLabel = document
    ? DOCUMENT_TYPE_LABELS[document.documentType] ?? document.documentType
    : null;

  return (
    <section className="glass overflow-hidden rounded-2xl">
      <header className="flex flex-col gap-3 border-b border-white/5 bg-white/[0.02] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-zinc-100">{fileName}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {[typeLabel, categoryLabel, document ? formatSize(document.sizeBytes) : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-zinc-400">
            {pendingCount} champ{pendingCount > 1 ? "s" : ""} à valider
          </span>
          {preValidatedCount > 0 && (
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-400">
              {preValidatedCount} pré-validé{preValidatedCount > 1 ? "s" : ""}
            </span>
          )}
          {document?.status === "analyzed" && (
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-400/90">
              Analysé
            </span>
          )}
        </div>
      </header>

      <div className="space-y-3 p-4 sm:p-5">
        {pendingItems.map((item) => (
          <ValidationFieldRow
            key={item.id}
            item={item}
            extractions={extractions}
            onApprove={() => onApprove(item)}
            onCorrect={() => onCorrect(item)}
            onReject={() => onReject(item)}
          />
        ))}
      </div>
    </section>
  );
}
