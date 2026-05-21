"use client";

import { useEffect, useState } from "react";
import type { NormalizedValue, ValidationItem } from "@/lib/lmnp/types";
import { formatMoney, moneyFromInput } from "@/lib/lmnp/types/values";

interface CorrectionModalProps {
  item: ValidationItem | null;
  onClose: () => void;
  onSave: (finalValue: NormalizedValue, note?: string) => void;
}

export function CorrectionModal({ item, onClose, onSave }: CorrectionModalProps) {
  const [input, setInput] = useState("");
  const [note, setNote] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    if (item.proposedValue.type === "money") {
      setInput((item.proposedValue.amountCents / 100).toFixed(2).replace(".", ","));
    } else if (item.proposedValue.type === "text") {
      setInput(item.proposedValue.text);
    }
    setNote("");
    setInputError(null);
  }, [item]);

  if (!item) return null;

  const isMoney = item.proposedValue.type === "money";

  const handleSave = () => {
    if (isMoney) {
      const value = moneyFromInput(input);
      if (!value) {
        setInputError("Montant invalide — utilisez par ex. 1 234,56");
        return;
      }
      onSave(value, note || undefined);
    } else if (item.proposedValue.type === "text") {
      if (!input.trim()) {
        setInputError("Ce champ ne peut pas être vide");
        return;
      }
      onSave({ type: "text", text: input }, note || undefined);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        className="glass w-full max-w-md rounded-2xl p-6 shadow-xl"
        role="dialog"
        aria-labelledby="correction-title"
      >
        <h2 id="correction-title" className="text-lg font-semibold text-stone-900">
          Modifier : {item.label}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Proposition IA :{" "}
          {item.proposedValue.type === "money"
            ? formatMoney(item.proposedValue)
            : item.proposedValue.type === "text"
              ? item.proposedValue.text
              : "—"}
          {item.documentFileName && ` · ${item.documentFileName}`}
        </p>

        <label className="mt-4 block text-sm font-medium text-stone-700">
          Votre valeur
          <input
            type={isMoney ? "text" : "text"}
            inputMode={isMoney ? "decimal" : "text"}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setInputError(null);
            }}
            className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-100 px-4 py-3 text-stone-900 outline-none focus:border-accent/40"
            placeholder={isMoney ? "0,00" : ""}
          />
        </label>

        {inputError && (
          <p className="mt-2 text-xs text-red-400">{inputError}</p>
        )}

        <label className="mt-3 block text-sm font-medium text-stone-700">
          Note (optionnel)
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-100 px-4 py-2 text-sm text-stone-900 outline-none focus:border-accent/40"
            placeholder="Ex. remboursement partiel"
          />
        </label>

        <p className="mt-3 rounded-lg bg-stone-100/80 p-3 text-xs text-stone-500">
          Cette valeur sera enregistrée dans l&apos;onglet métier correspondant, marquée « Validé par
          IA + vous ».
        </p>

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
            onClick={handleSave}
            className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
