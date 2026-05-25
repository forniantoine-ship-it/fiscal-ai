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
};

export function ValidationCheckoutOverlay({
  open,
  fiscalYear,
  onClose,
  onConfirmPayment,
}: ValidationCheckoutOverlayProps) {
  const [processing, setProcessing] = useState(false);

  if (!open) return null;

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
          Finaliser la génération
        </p>
        <p className="mt-2 text-center" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          LMNP {fiscalYear} — génération et télétransmission EDI
        </p>

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
