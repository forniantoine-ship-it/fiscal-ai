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
      <li className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.04] px-4 py-3">
        <AiActivityFeed documentType={doc.documentType} compact />
        <button
          type="button"
          onClick={onRemove}
          disabled={doc.status === "processing"}
          className="text-zinc-600 hover:text-zinc-400 disabled:opacity-30"
          aria-label="Supprimer"
        >
          ×
        </button>
      </li>
    );
  }

  if (doc.status === "analyzed") {
    return (
      <li className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/10 px-4 py-3">
        <p className="min-w-0 text-sm text-emerald-400/90">
          <span className="text-emerald-500">✓ </span>
          {detected}
          {extractionCount > 0 && (
            <span className="text-zinc-600"> · {extractionCount} montant{extractionCount > 1 ? "s" : ""}</span>
          )}
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-zinc-600 hover:text-red-400"
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
        <p className="min-w-0 flex-1 text-sm text-zinc-500">Lecture impossible</p>
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
