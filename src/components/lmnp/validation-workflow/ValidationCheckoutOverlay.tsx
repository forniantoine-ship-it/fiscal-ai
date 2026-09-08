"use client";

import { useState } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { GENERATION_PRICE_TTC } from "@/lib/lmnp/services/validation-profile";

type ValidationCheckoutOverlayProps = {
  open: boolean;
  fiscalYear: number;
  onClose: () => void;
  onConfirmPayment: () => void;
  /**
   * P1 — reflète le `checkoutMode` de ValidationDocumentStep.tsx (logique
   * inchangée). "generate" (défaut) : paiement suivi d'une génération
   * immédiate, wording existant. "pay-only" : SIREN/SIRET pas encore
   * obtenu via l'INPI, la génération Cerfa est différée — le wording ne
   * doit jamais parler de génération ni de télétransmission EDI à ce
   * stade, seulement de validation/paiement du dossier côté Fiscal AI.
   */
  mode?: "generate" | "pay-only";
};

export const CHECKOUT_COPY = {
  generate: {
    title: "Finaliser la génération",
    subtitle: (fiscalYear: number) => `LMNP ${fiscalYear} — génération et télétransmission EDI`,
    explanation: undefined as string | undefined,
  },
  "pay-only": {
    title: "Finaliser mon dossier",
    subtitle: (fiscalYear: number) => `LMNP ${fiscalYear} — validation et paiement de votre dossier`,
    explanation:
      "Votre paiement valide et enregistre votre dossier fiscal auprès de Fiscal AI. Votre déclaration officielle sera générée dès que les informations INPI (SIREN/SIRET) seront disponibles.",
  },
} as const;

export function ValidationCheckoutOverlay({
  open,
  fiscalYear,
  onClose,
  onConfirmPayment,
  mode = "generate",
}: ValidationCheckoutOverlayProps) {
  const [processing, setProcessing] = useState(false);

  if (!open) return null;

  const copy = CHECKOUT_COPY[mode];

  function handlePay() {
    setProcessing(true);
    window.setTimeout(() => {
      setProcessing(false);
      onConfirmPayment();
    }, 900);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(28, 25, 23, 0.24)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="validation-checkout-title"
    >
      <section
        className="w-full max-w-md animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
        style={{
          borderRadius: radius.lg,
          border: `1px solid ${colors.border.subtle}`,
          backgroundImage: [
            `radial-gradient(ellipse 88% 52% at 50% -8%, ${colors.orange[100]} 0%, transparent 62%)`,
            gradients.card.elevated,
          ].join(", "),
          boxShadow: shadows.card.hover,
          padding: spacing.card.md,
        }}
      >
        <p
          id="validation-checkout-title"
          className="text-center"
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize.xl,
            color: colors.text.primary,
          }}
        >
          {copy.title}
        </p>
        <p className="mt-2 text-center" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          {copy.subtitle(fiscalYear)}
        </p>
        {copy.explanation ? (
          <p className="mt-2 text-center" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            {copy.explanation}
          </p>
        ) : null}

        <div
          className="mt-6 text-center"
          style={{
            borderRadius: radius.md,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.primary,
            padding: spacing.scale[5],
          }}
        >
          <p className="tabular-nums" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            Total
          </p>
          <p
            className="mt-1 tabular-nums"
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize["2xl"],
              color: colors.text.primary,
            }}
          >
            {GENERATION_PRICE_TTC} € TTC
          </p>
        </div>

        <div className="mt-6 flex flex-col items-center gap-3">
          <Button onClick={handlePay} disabled={processing}>
            {processing ? "Traitement…" : "Confirmer"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            style={{ ...typography.caption.desktop, color: colors.text.muted }}
          >
            Retour
          </button>
        </div>
      </section>
    </div>
  );
}
