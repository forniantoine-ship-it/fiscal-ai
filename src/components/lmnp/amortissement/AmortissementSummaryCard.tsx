"use client";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  formatCurrency,
  type AmortissementVentilationData,
} from "@/lib/lmnp/services/amortissement-profile";

type AmortissementSummaryCardProps = {
  summary: AmortissementVentilationData["summary"];
  cardStyle: React.CSSProperties;
  onShowVentilation: () => void;
};

export function AmortissementSummaryCard({
  summary,
  cardStyle,
  onShowVentilation,
}: AmortissementSummaryCardProps) {
  const bullets = [
    `${summary.componentCount} composant${summary.componentCount > 1 ? "s" : ""} amortissable${summary.componentCount > 1 ? "s" : ""}`,
    `${formatCurrency(summary.travauxTotal)} de travaux`,
    `${formatCurrency(summary.mobilierTotal)} de mobilier`,
    `${summary.averageDurationYears} ans de durée moyenne`,
  ];

  return (
    <section
      className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ ...cardStyle, textAlign: "center" }}
    >
      <p
        style={{
          ...typography.caption.desktop,
          color: colors.text.accent,
          letterSpacing: typography.letterSpacing.label,
        }}
      >
        Synthèse intelligente
      </p>
      <p
        className="mt-3"
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize.xl,
          color: colors.text.primary,
        }}
      >
        Le logiciel a identifié :
      </p>
      <ul className="mx-auto mt-4 max-w-md space-y-2 text-left">
        {bullets.map((item) => (
          <li key={item} style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            · {item}
          </li>
        ))}
      </ul>
      <p className="mt-5" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
        Votre ventilation comptable a été préparée automatiquement.
      </p>
      <div className="mt-8 flex justify-center">
        <Button variant="secondary" onClick={onShowVentilation}>
          Voir la ventilation détaillée
        </Button>
      </div>
    </section>
  );
}
