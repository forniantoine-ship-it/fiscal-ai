"use client";

import { useEffect, useState } from "react";
import type { NormalizedValue, ValidationItem } from "@/lib/lmnp/types";
import { formatMoney, moneyFromInput } from "@/lib/lmnp/types/values";
import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { Input } from "@/design-system/components/Input";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      style={{ backgroundColor: `${colors.overlay.scrim}66` }}
    >
      <div role="dialog" aria-labelledby="correction-title" className="w-full max-w-md">
        <Card className="!p-6" style={{ boxShadow: shadows.modal.elevated, borderRadius: radius.xl }}>
        <h2
          id="correction-title"
          style={{ ...typography.cardTitle.desktop, color: colors.text.primary }}
        >
          Modifier : {item.label}
        </h2>
        <p className="mt-1" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Proposition IA :{" "}
          {item.proposedValue.type === "money"
            ? formatMoney(item.proposedValue)
            : item.proposedValue.type === "text"
              ? item.proposedValue.text
              : "—"}
          {item.documentFileName && ` · ${item.documentFileName}`}
        </p>

        <label className="mt-4 block">
          <span style={{ ...typography.caption.desktop, color: colors.text.secondary }}>Votre valeur</span>
          <Input
            type="text"
            inputMode={isMoney ? "decimal" : "text"}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setInputError(null);
            }}
            className="mt-2"
            placeholder={isMoney ? "0,00" : ""}
          />
        </label>

        {inputError ? (
          <p className="mt-2" style={{ ...typography.caption.desktop, color: colors.error.DEFAULT }}>
            {inputError}
          </p>
        ) : null}

        <label className="mt-3 block">
          <span style={{ ...typography.caption.desktop, color: colors.text.secondary }}>Note (optionnel)</span>
          <Input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-2"
            placeholder="Ex. remboursement partiel"
          />
        </label>

        <p
          className="mt-3 rounded-xl p-3"
          style={{
            ...typography.caption.desktop,
            color: colors.text.muted,
            backgroundColor: colors.surface.secondary,
          }}
        >
          Cette valeur sera enregistrée dans l&apos;onglet métier correspondant, marquée « Validé par IA + vous ».
        </p>

        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button onClick={handleSave} className="flex-1">
            Enregistrer
          </Button>
        </div>
        </Card>
      </div>
    </div>
  );
}
