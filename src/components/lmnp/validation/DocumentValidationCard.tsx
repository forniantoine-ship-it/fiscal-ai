"use client";

import { useState } from "react";
import type { OcrFieldKey } from "@/lib/lmnp/types";
import type { DocumentValidationGroup } from "@/lib/lmnp/validation/grouping";
import { DOCUMENT_TYPE_LABELS } from "@/lib/lmnp/validation/grouping";
import { DOCUMENT_CATEGORIES } from "@/lib/lmnp/constants/documents";
import type { ValidationItem } from "@/lib/lmnp/types";
import { DocumentPreviewPanel } from "./DocumentPreviewPanel";
import { ManualExtractionFallback } from "./ManualExtractionFallback";
import { ValidationFieldRow } from "./ValidationFieldRow";

interface DocumentValidationCardProps {
  group: DocumentValidationGroup;
  file?: File;
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
  file,
  onApprove,
  onCorrect,
  onReject,
}: DocumentValidationCardProps) {
  const { document, items, extractions, pendingCount, preValidatedCount } = group;
  const pendingItems = items.filter((i) => i.status === "pending");
  const [activeFieldKey, setActiveFieldKey] = useState<OcrFieldKey | null>(null);

  const fileName = document?.fileName ?? "Champs sans document source";
  const categoryLabel = document
    ? DOCUMENT_CATEGORIES.find((c) => c.id === document.category)?.label
    : null;
  const typeLabel = document
    ? DOCUMENT_TYPE_LABELS[document.documentType] ?? document.documentType
    : null;

  const showManualFallback =
    document &&
    pendingItems.length === 0 &&
    (document.ocrMeta?.usedHeuristicFallback ||
      document.ocrMeta?.warnings.some((w) => w.includes("manuelle")) ||
      (document.ocrMeta?.fieldsDetected === 0 && document.status === "analyzed"));

  const ocrWarnings = document?.ocrMeta?.warnings ?? [];
  const inconsistencies = document?.ocrMeta?.inconsistencies ?? [];

  if (pendingItems.length === 0 && !showManualFallback) return null;

  return (
    <section className="glass overflow-hidden rounded-2xl">
      <header className="flex flex-col gap-3 border-b border-stone-200 bg-stone-100/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
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
            <p className="truncate font-medium text-stone-900">{fileName}</p>
            <p className="mt-0.5 text-xs text-stone-500">
              {[typeLabel, categoryLabel, document ? formatSize(document.sizeBytes) : null]
                .filter(Boolean)
                .join(" · ")}
              {document?.ocrMeta && (
                <span className="text-stone-500">
                  {" "}
                  · Type {document.ocrMeta.documentTypeConfidence}% confiance
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {pendingCount > 0 && (
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">
              {pendingCount} champ{pendingCount > 1 ? "s" : ""} à valider
            </span>
          )}
          {preValidatedCount > 0 && (
            <span className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 font-medium text-accent">
              {preValidatedCount} haute confiance
            </span>
          )}
          {document?.status === "analyzed" && (
            <span className="rounded-full bg-accent/10 px-2.5 py-1 text-accent/90">
              Analysé
            </span>
          )}
        </div>
      </header>

      {(ocrWarnings.length > 0 || inconsistencies.length > 0) && (
        <div className="border-b border-stone-200 bg-amber-500/[0.03] px-5 py-3">
          <ul className="space-y-1 text-xs text-amber-200/80">
            {inconsistencies
              .filter((i) => i.severity === "warning")
              .map((i) => (
                <li key={i.message} className="flex items-start gap-2">
                  <span className="mt-0.5 text-amber-400">⚠</span>
                  {i.message}
                </li>
              ))}
            {ocrWarnings.map((w) => (
              <li key={w} className="flex items-start gap-2 text-stone-500">
                <span className="mt-0.5">·</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-0 lg:grid-cols-[minmax(240px,340px)_1fr]">
        {document && (
          <div className="border-b border-stone-200 p-4 lg:border-b-0 lg:border-r">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-stone-500">
              Aperçu document
            </p>
            <DocumentPreviewPanel
              file={file}
              extractions={extractions}
              activeFieldKey={activeFieldKey}
              onFieldHover={setActiveFieldKey}
            />
          </div>
        )}

        <div className="space-y-3 p-4 sm:p-5">
          {pendingItems.map((item) => (
            <ValidationFieldRow
              key={item.id}
              item={item}
              extractions={extractions}
              activeFieldKey={activeFieldKey}
              onFieldHover={setActiveFieldKey}
              onApprove={() => onApprove(item)}
              onCorrect={() => onCorrect(item)}
              onReject={() => onReject(item)}
            />
          ))}

          {showManualFallback && document && (
            <ManualExtractionFallback document={document} warnings={ocrWarnings} />
          )}
        </div>
      </div>
    </section>
  );
}
