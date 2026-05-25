import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";

type TabPlaceholderProps = {
  eyebrow: string;
  title: string;
  description: string;
  ctaHref?: string;
  ctaLabel?: string;
};

export function TabPlaceholder({
  eyebrow,
  title,
  description,
  ctaHref = LMNP_ROUTES.documents,
  ctaLabel = "Continuer avec les documents",
}: TabPlaceholderProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <p style={{ ...typography.caption.desktop, color: colors.text.accent }}>
        {eyebrow}
      </p>
      <h1
        className="mt-3 text-3xl sm:text-4xl"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          color: colors.text.primary,
        }}
      >
        {title}
      </h1>
      <p className="mt-4" style={{ ...typography.body.desktop, color: colors.text.secondary, lineHeight: typography.lineHeight.relaxed }}>
        {description}
      </p>
      <Card className="mt-8" variant="muted" interactive>
        <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Cette section sera complétée automatiquement à partir de vos documents validés.
        </p>
        <div className="mt-6">
          <Button href={ctaHref}>{ctaLabel}</Button>
        </div>
      </Card>
    </div>
  );
}
