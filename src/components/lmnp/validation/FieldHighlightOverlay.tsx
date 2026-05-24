"use client";

import type { Extraction, OcrFieldKey } from "@/lib/lmnp/types";

interface FieldHighlightOverlayProps {
  extractions: Extraction[];
  activeFieldKey?: OcrFieldKey | null;
  onFieldHover?: (fieldKey: OcrFieldKey | null) => void;
}

const FIELD_COLORS: Record<OcrFieldKey, { bg: string; border: string; label: string }> = {
  totalAmount: {
    bg: "bg-accent-muted",
    border: "border-accent/50",
    label: "Montant",
  },
  vatAmount: {
    bg: "bg-blue-400/25",
    border: "border-blue-400/80",
    label: "TVA",
  },
  supplierName: {
    bg: "bg-purple-400/25",
    border: "border-purple-400/80",
    label: "Fournisseur",
  },
  invoiceDate: {
    bg: "bg-amber-400/25",
    border: "border-amber-400/80",
    label: "Date",
  },
  address: {
    bg: "bg-pink-400/25",
    border: "border-pink-400/80",
    label: "Adresse",
  },
};

export function FieldHighlightOverlay({
  extractions,
  activeFieldKey,
  onFieldHover,
}: FieldHighlightOverlayProps) {
  const withRegions = extractions.filter((e) => e.ocrFieldKey && e.region);

  if (withRegions.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {withRegions.map((ext) => {
        if (!ext.ocrFieldKey || !ext.region) return null;
        const key = ext.ocrFieldKey;
        const colors = FIELD_COLORS[key];
        const isActive = activeFieldKey === key;
        const { x, y, width, height } = ext.region;

        return (
          <div
            key={ext.id}
            className="pointer-events-auto absolute transition-all duration-200"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: `${width}%`,
              height: `${height}%`,
            }}
            onMouseEnter={() => onFieldHover?.(key)}
            onMouseLeave={() => onFieldHover?.(null)}
          >
            <div
              className={`h-full w-full rounded border-2 ${colors.bg} ${colors.border} ${
                isActive ? "ring-2 ring-white/40" : "opacity-70 hover:opacity-100"
              }`}
            />
            <span
              className={`absolute -top-5 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-semibold ${colors.bg} ${colors.border} border text-stone-900`}
            >
              {colors.label} · {ext.confidence}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
