"use client";

import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";
import { GENERATION_PRICE_TTC } from "@/lib/lmnp/services/validation-profile";

type ValidationPricingBlockProps = {
  cardStyle: React.CSSProperties;
};

export function ValidationPricingBlock({ cardStyle }: ValidationPricingBlockProps) {
  return (
    <section
      className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ ...cardStyle, textAlign: "center" }}
    >
      <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
        Liasse fiscale et aide 2042-C-PRO
      </p>
      <p
        className="mt-2 tabular-nums"
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize["2xl"],
          color: colors.text.primary,
        }}
      >
        {GENERATION_PRICE_TTC} € TTC
      </p>
      <p className="mx-auto mt-3 max-w-sm" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
        Un paiement par exercice fiscal, régénérations et téléchargements illimités. Vous déposez vous-même votre
        déclaration.
      </p>
    </section>
  );
}
