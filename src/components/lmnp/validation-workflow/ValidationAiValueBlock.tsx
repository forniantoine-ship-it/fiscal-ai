"use client";

import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";

type ValidationAiValueBlockProps = {
  cardStyle: React.CSSProperties;
};

const AI_VALUE_TEXT =
  "L'IA a automatiquement analysé vos documents, classé vos dépenses et préparé les amortissements nécessaires à votre déclaration LMNP.";

export function ValidationAiValueBlock({ cardStyle }: ValidationAiValueBlockProps) {
  return (
    <section
      className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ ...cardStyle, textAlign: "center" }}
    >
      <p
        className="mx-auto max-w-lg"
        style={{
          ...typography.body.desktop,
          color: colors.text.secondary,
          lineHeight: typography.lineHeight.relaxed,
        }}
      >
        {AI_VALUE_TEXT}
      </p>
    </section>
  );
}
