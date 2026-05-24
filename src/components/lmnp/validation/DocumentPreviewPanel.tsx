"use client";

import { useEffect, useMemo } from "react";
import type { Extraction, OcrFieldKey } from "@/lib/lmnp/types";
import { FieldHighlightOverlay } from "./FieldHighlightOverlay";

interface DocumentPreviewPanelProps {
  file: File | undefined;
  extractions: Extraction[];
  activeFieldKey?: OcrFieldKey | null;
  onFieldHover?: (fieldKey: OcrFieldKey | null) => void;
  className?: string;
}

export function DocumentPreviewPanel({
  file,
  extractions,
  activeFieldKey,
  onFieldHover,
  className = "",
}: DocumentPreviewPanelProps) {
  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);
  const isPdf = file?.type === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf");
  const isImage = file?.type.startsWith("image/");

  const regionsByField = useMemo(() => {
    const map = new Map<OcrFieldKey, Extraction>();
    for (const ext of extractions) {
      if (ext.ocrFieldKey && ext.region) {
        map.set(ext.ocrFieldKey, ext);
      }
    }
    return map;
  }, [extractions]);

  if (!file || !objectUrl) {
    return (
      <div
        className={`flex aspect-[3/4] items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-100 ${className}`}
      >
        <div className="px-6 text-center">
          <svg
            className="mx-auto h-10 w-10 text-stone-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="mt-3 text-sm text-stone-500">Aperçu indisponible</p>
          <p className="mt-1 text-xs text-stone-500">Réimportez le document pour afficher l&apos;aperçu</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border border-stone-200 bg-black/30 ${className}`}>
      <div className="relative aspect-[3/4] w-full">
        {isPdf ? (
          <iframe
            src={objectUrl}
            title={`Aperçu ${file.name}`}
            className="h-full w-full border-0 bg-white"
          />
        ) : isImage ? (
          <div className="relative h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={objectUrl}
              alt={`Aperçu ${file.name}`}
              className="h-full w-full object-contain"
            />
            <FieldHighlightOverlay
              extractions={extractions}
              activeFieldKey={activeFieldKey}
              onFieldHover={onFieldHover}
            />
          </div>
        ) : (
          <iframe
            src={objectUrl}
            title={`Aperçu ${file.name}`}
            className="h-full w-full border-0"
          />
        )}
      </div>

      {isPdf && regionsByField.size > 0 && (
        <div className="border-t border-stone-200 bg-black/40 px-3 py-2">
          <p className="text-[10px] text-stone-500">
            Surlignage disponible sur les images — ouvrez le PDF dans un lecteur externe pour comparer.
          </p>
          <FieldLegend
            extractions={extractions}
            activeFieldKey={activeFieldKey}
            onFieldHover={onFieldHover}
          />
        </div>
      )}

      {!isPdf && regionsByField.size > 0 && (
        <FieldLegend
          extractions={extractions}
          activeFieldKey={activeFieldKey}
          onFieldHover={onFieldHover}
          className="border-t border-stone-200 bg-black/40 px-3 py-2"
        />
      )}
    </div>
  );
}

const FIELD_COLORS: Record<OcrFieldKey, string> = {
  totalAmount: "border-accent border-accent",
  vatAmount: "bg-blue-400/30 border-blue-400",
  supplierName: "bg-purple-400/30 border-purple-400",
  invoiceDate: "bg-amber-400/30 border-amber-400",
  address: "bg-pink-400/30 border-pink-400",
};

const FIELD_LABELS: Record<OcrFieldKey, string> = {
  totalAmount: "Montant",
  vatAmount: "TVA",
  supplierName: "Fournisseur",
  invoiceDate: "Date",
  address: "Adresse",
};

function FieldLegend({
  extractions,
  activeFieldKey,
  onFieldHover,
  className = "",
}: {
  extractions: Extraction[];
  activeFieldKey?: OcrFieldKey | null;
  onFieldHover?: (fieldKey: OcrFieldKey | null) => void;
  className?: string;
}) {
  const fields = extractions.filter((e) => e.ocrFieldKey && e.region);

  if (fields.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {fields.map((ext) => {
        if (!ext.ocrFieldKey) return null;
        const key = ext.ocrFieldKey;
        const isActive = activeFieldKey === key;
        const colorClass = FIELD_COLORS[key];

        return (
          <button
            key={ext.id}
            type="button"
            onMouseEnter={() => onFieldHover?.(key)}
            onMouseLeave={() => onFieldHover?.(null)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all ${
              isActive
                ? `${colorClass} text-stone-900 ring-1 ring-white/20`
                : "border-stone-200 bg-stone-100 text-stone-600 hover:text-stone-800"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${colorClass.split(" ")[0]}`} />
            {FIELD_LABELS[key]} · {ext.confidence}%
          </button>
        );
      })}
    </div>
  );
}
