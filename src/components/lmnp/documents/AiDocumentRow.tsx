"use client";

import { AI_DETECTED_SUCCESS } from "@/lib/lmnp/constants/ai-activity-copy";
import { humanDocumentLabel } from "@/lib/lmnp/constants/copilot-copy";
import { AiActivityFeed } from "@/components/lmnp/journey/AiActivityFeed";
import type { LmnpDocument } from "@/lib/lmnp/types";

interface AiDocumentRowProps {
  doc: LmnpDocument;
  extractionCount: number;
  onRetry: () => void;
  onRemove: () => void;
}

export function AiDocumentRow({ doc, extractionCount, onRetry, onRemove }: AiDocumentRowProps) {
  const detected =
    AI_DETECTED_SUCCESS[doc.documentType] ??
    `${humanDocumentLabel(doc.documentType, doc.fileName)} identifié`;

  if (doc.status === "processing" || doc.status === "uploaded") {
    return (
      <li className="flex items-center justify-between gap-3 rounded-xl border border-stone-200/80 px-4 py-3">
        <AiActivityFeed documentType={doc.documentType} compact />
        <button
          type="button"
          onClick={onRemove}
          disabled={doc.status === "processing"}
          className="text-stone-500 hover:text-stone-600 disabled:opacity-30"
          aria-label="Supprimer"
        >
          ×
        </button>
      </li>
    );
  }

  if (doc.status === "analyzed") {
    return (
      <li className="flex items-center justify-between gap-3 rounded-xl border border-accent/15 px-4 py-3">
        <p className="min-w-0 text-sm text-accent/90">
          <span className="text-accent">✓ </span>
          {detected}
          {extractionCount > 0 && (
            <span className="text-stone-500"> · {extractionCount} montant{extractionCount > 1 ? "s" : ""}</span>
          )}
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-stone-500 hover:text-red-400"
          aria-label="Supprimer"
        >
          ×
        </button>
      </li>
    );
  }

  if (doc.status === "failed") {
    return (
      <li className="flex items-center gap-3 rounded-xl border border-red-500/10 px-4 py-3">
        <p className="min-w-0 flex-1 text-sm text-stone-500">Lecture impossible</p>
        <button
          type="button"
          onClick={onRetry}
          className="text-xs text-amber-400"
        >
          Réessayer
        </button>
      </li>
    );
  }

  return null;
}
