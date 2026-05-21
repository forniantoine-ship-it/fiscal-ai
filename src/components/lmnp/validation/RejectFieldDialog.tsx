"use client";

import { useEffect, useState } from "react";
import type { ValidationItem } from "@/lib/lmnp/types";
import { NormalizedValueDisplay } from "./NormalizedValueDisplay";

interface RejectFieldDialogProps {
  item: ValidationItem | null;
  onClose: () => void;
  onConfirm: (note?: string) => void;
}

export function RejectFieldDialog({ item, onClose, onConfirm }: RejectFieldDialogProps) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (item) setNote("");
  }, [item]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        className="glass w-full max-w-md rounded-2xl p-6 shadow-xl"
        role="dialog"
        aria-labelledby="reject-title"
      >
        <h2 id="reject-title" className="text-lg font-semibold text-stone-900">
          Rejeter cette proposition
        </h2>
        <p className="mt-1 text-sm text-stone-500">{item.label}</p>

        <div className="mt-4 rounded-xl bg-stone-100/80 px-4 py-3">
          <p className="text-xs text-stone-500">Montant proposé par l&apos;IA</p>
          <NormalizedValueDisplay value={item.proposedValue} size="sm" />
        </div>

        <p className="mt-3 text-xs leading-relaxed text-stone-500">
          Le champ ne sera pas enregistré dans votre dossier. Vous pourrez le saisir manuellement
          dans l&apos;onglet concerné ou importer un autre document.
        </p>

        {item.isRequired && (
          <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Ce montant est important pour votre dossier — le rejeter peut bloquer la clôture
            future.
          </p>
        )}

        <label className="mt-4 block text-sm font-medium text-stone-700">
          Motif (optionnel)
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-100 px-4 py-2 text-sm text-stone-900 outline-none focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20"
            placeholder="Ex. montant incorrect, document illisible"
          />
        </label>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-stone-200 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(note || undefined);
              onClose();
            }}
            className="flex-1 rounded-full bg-red-500/20 py-2.5 text-sm font-semibold text-red-300 ring-1 ring-red-500/30 hover:bg-red-500/30"
          >
            Rejeter
          </button>
        </div>
      </div>
    </div>
  );
}
