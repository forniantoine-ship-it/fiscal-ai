"use client";

import { useEffect, useState } from "react";
import type { ValidationItem } from "@/lib/lmnp/types";
import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { Input } from "@/design-system/components/Input";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      style={{ backgroundColor: `${colors.overlay.scrim}66` }}
    >
      <div role="dialog" aria-labelledby="reject-title" className="w-full max-w-md">
        <Card className="!p-6" style={{ boxShadow: shadows.modal.elevated, borderRadius: radius.xl }}>
        <h2 id="reject-title" style={{ ...typography.cardTitle.desktop, color: colors.text.primary }}>
          Rejeter cette proposition
        </h2>
        <p className="mt-1" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          {item.label}
        </p>

        <div
          className="mt-4 rounded-xl px-4 py-3"
          style={{ backgroundColor: colors.surface.secondary }}
        >
          <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            Montant proposé par l&apos;IA
          </p>
          <NormalizedValueDisplay value={item.proposedValue} size="sm" />
        </div>

        <p
          className="mt-3"
          style={{ ...typography.caption.desktop, color: colors.text.muted, lineHeight: typography.lineHeight.relaxed }}
        >
          Le champ ne sera pas enregistré dans votre dossier. Vous pourrez le saisir manuellement dans
          l&apos;onglet concerné ou importer un autre document.
        </p>

        {item.isRequired ? (
          <p
            className="mt-3 rounded-lg px-3 py-2"
            style={{
              ...typography.caption.desktop,
              color: colors.warning.DEFAULT,
              border: `1px solid ${colors.warning.border}`,
              backgroundColor: colors.warning.surface,
            }}
          >
            Ce montant est important pour votre dossier — le rejeter peut bloquer la clôture future.
          </p>
        ) : null}

        <label className="mt-4 block">
          <span style={{ ...typography.caption.desktop, color: colors.text.secondary }}>Motif (optionnel)</span>
          <Input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-2"
            placeholder="Ex. montant incorrect, document illisible"
          />
        </label>

        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              onConfirm(note || undefined);
              onClose();
            }}
            className="flex-1"
            style={{ color: colors.error.DEFAULT }}
          >
            Rejeter
          </Button>
        </div>
        </Card>
      </div>
    </div>
  );
}
