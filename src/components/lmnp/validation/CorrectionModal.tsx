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

  useEffect(() => {
    if (!item) return;
    if (item.proposedValue.type === "money") {
      setInput((item.proposedValue.amountCents / 100).toFixed(2).replace(".", ","));
    } else if (item.proposedValue.type === "text") {
      setInput(item.proposedValue.text);
    }
    setNote("");
  }, [item]);

  if (!item) return null;

  const isMoney = item.proposedValue.type === "money";

  const handleSave = () => {
    if (isMoney) {
      const value = moneyFromInput(input);
      if (!value) return;
      onSave(value, note || undefined);
    } else if (item.proposedValue.type === "text") {
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
        <h2 id="correction-title" className="text-lg font-semibold text-zinc-100">
          Modifier : {item.label}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Proposition IA :{" "}
          {item.proposedValue.type === "money"
            ? formatMoney(item.proposedValue)
            : item.proposedValue.type === "text"
              ? item.proposedValue.text
              : "—"}
          {item.documentFileName && ` · ${item.documentFileName}`}
        </p>

        <label className="mt-4 block text-sm font-medium text-zinc-300">
          Votre valeur
          <input
            type={isMoney ? "text" : "text"}
            inputMode={isMoney ? "decimal" : "text"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-100 outline-none focus:border-emerald-500/50"
            placeholder={isMoney ? "0,00" : ""}
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-zinc-300">
          Note (optionnel)
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
            placeholder="Ex. remboursement partiel"
          />
        </label>

        <p className="mt-3 rounded-lg bg-white/[0.03] p-3 text-xs text-zinc-500">
          Cette valeur sera marquée « Validée par vous » et utilisée dans votre dossier.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-white/10 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/5"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-full bg-emerald-500 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
