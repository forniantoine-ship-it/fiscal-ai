"use client";

import { useEffect, useState } from "react";
import type { LedgerEntry } from "@/lib/lmnp/types";
import type { NormalizedValue } from "@/lib/lmnp/types/values";
import { formatMoney, moneyFromInput } from "@/lib/lmnp/types/values";
import { formatLedgerSourceLine } from "@/lib/lmnp/validation/ledger-display";

interface LedgerEditModalProps {
  entry: LedgerEntry | null;
  documentFileName?: string;
  onClose: () => void;
  onSave: (value: NormalizedValue, note?: string) => void;
}

export function LedgerEditModal({ entry, documentFileName, onClose, onSave }: LedgerEditModalProps) {
  const [input, setInput] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!entry) return;
    if (entry.value.type === "money") {
      setInput((entry.value.amountCents / 100).toFixed(2).replace(".", ","));
    } else if (entry.value.type === "text") {
      setInput(entry.value.text);
    } else {
      setInput("");
    }
    setNote(entry.editNote ?? "");
  }, [entry]);

  if (!entry) return null;

  const isMoney = entry.value.type === "money";
  const canEdit = isMoney || entry.value.type === "text";

  const handleSave = () => {
    if (isMoney) {
      const value = moneyFromInput(input);
      if (!value) return;
      onSave(value, note || undefined);
    } else if (entry.value.type === "text") {
      onSave({ type: "text", text: input }, note || undefined);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="glass w-full max-w-md rounded-2xl p-6 shadow-xl" role="dialog">
        <h2 className="text-lg font-semibold text-stone-900">
          Modifier : {entry.label ?? "Ligne comptable"}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          {formatLedgerSourceLine({
            documentType: entry.sourceDocumentType,
            fileName: documentFileName,
          })}
        </p>

        {canEdit ? (
          <>
            <label className="mt-4 block text-sm font-medium text-stone-700">
              Montant ou valeur
              <input
                type="text"
                inputMode={isMoney ? "decimal" : "text"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-100 px-4 py-3 text-stone-900 outline-none focus:border-accent/40"
                placeholder={isMoney ? "0,00" : ""}
              />
            </label>

            <label className="mt-3 block text-sm font-medium text-stone-700">
              Note (optionnel)
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-100 px-4 py-2 text-sm text-stone-900 outline-none focus:border-accent/40"
                placeholder="Ex. ajustement après vérification"
              />
            </label>
          </>
        ) : (
          <p className="mt-4 text-sm text-stone-500">
            Ce type de valeur ne peut pas être modifié ici. Retournez dans Validation si besoin.
          </p>
        )}

        <p className="mt-3 rounded-lg bg-stone-100/80 p-3 text-xs text-stone-500">
          La modification sera enregistrée dans votre onglet métier et marquée « Modifié par vous ».
        </p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-stone-200 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            Annuler
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Enregistrer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
