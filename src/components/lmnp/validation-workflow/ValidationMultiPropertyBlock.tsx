"use client";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";

type ValidationMultiPropertyBlockProps = {
  cardStyle: React.CSSProperties;
};

export function ValidationMultiPropertyBlock({ cardStyle }: ValidationMultiPropertyBlockProps) {
  return (
    <section
      className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ ...cardStyle, textAlign: "center" }}
    >
      <p
        className="mx-auto max-w-md"
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize.lg,
          color: colors.text.primary,
        }}
      >
        Votre dossier nécessite un accompagnement personnalisé.
      </p>
      <div className="mt-6 flex justify-center">
        <Button variant="secondary" href="mailto:contact@fiscal-ai.fr?subject=Devis%20LMNP%20multi-biens">
          Demander un devis
        </Button>
      </div>
    </section>
  );
}
