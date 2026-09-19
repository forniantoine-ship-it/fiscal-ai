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
  /**
   * Payment V1 — démarre le VRAI paiement (Stripe Checkout hébergé) : redirige
   * le navigateur, ou lève un message clair. Ce composant ne marque jamais un
   * paiement comme réussi : seul le serveur (webhook Stripe) accorde le droit.
   */
  onPay: () => Promise<void>;
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
    subtitle: (fiscalYear: number) => `LMNP ${fiscalYear} — génération de votre liasse fiscale et aide 2042-C-PRO`,
    explanation: undefined as string | undefined,
  },
  "pay-only": {
    title: "Finaliser mon dossier",
    subtitle: (fiscalYear: number) => `LMNP ${fiscalYear} — validation et paiement de votre dossier`,
    explanation:
      "Votre paiement valide et enregistre votre dossier fiscal auprès de Fiscal AI. Votre déclaration officielle sera générée dès que les informations INPI (SIREN/SIRET) seront disponibles.",
  },
} as const;

/** Notes affichées avant tout paiement, dans les deux modes. */
export const CHECKOUT_NOTES = {
  secure: "Paiement sécurisé par Stripe : vous serez redirigé vers sa page de paiement.",
  entitlement:
    "Ce paiement couvre cet exercice fiscal : régénérations et téléchargements illimités, sans nouveau paiement.",
  responsibility: "Fiscal AI prépare vos documents ; vous déposez vous-même votre déclaration.",
  // V1 : le dossier est enregistré dans le navigateur (pas de synchronisation cloud).
  dataLoss:
    "Votre dossier est actuellement enregistré sur cet appareil. Utilisez le même navigateur jusqu'à la finalisation de votre déclaration.",
} as const;

export function ValidationCheckoutOverlay(props: ValidationCheckoutOverlayProps) {
  // L'état (traitement / erreur) vit dans le composant interne : fermer l'overlay le démonte, donc le réinitialise.
  if (!props.open) return null;
  return <CheckoutDialog {...props} />;
}

function CheckoutDialog({ fiscalYear, onClose, onPay, mode = "generate" }: ValidationCheckoutOverlayProps) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const copy = CHECKOUT_COPY[mode];

  async function handlePay() {
    setProcessing(true);
    setError(undefined);
    try {
      // Redirige vers Stripe : la page se décharge, l'état « traitement » reste jusqu'au départ.
      await onPay();
    } catch (err) {
      setError(
        err && typeof err === "object" && "message" in err && typeof err.message === "string"
          ? err.message
          : "Le paiement n'a pas pu être démarré. Réessayez dans quelques instants.",
      );
      setProcessing(false);
    }
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

        <div className="mt-4 space-y-2 text-center" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          <p>{CHECKOUT_NOTES.entitlement}</p>
          <p>{CHECKOUT_NOTES.responsibility}</p>
          <p>{CHECKOUT_NOTES.secure}</p>
          <p style={{ color: colors.text.secondary }}>{CHECKOUT_NOTES.dataLoss}</p>
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-center" style={{ ...typography.caption.desktop, color: colors.error.DEFAULT }}>
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col items-center gap-3">
          <Button onClick={() => void handlePay()} disabled={processing}>
            {processing ? "Redirection vers le paiement…" : `Payer ${GENERATION_PRICE_TTC} € TTC`}
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
