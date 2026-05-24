import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

export function CTABanner() {
  return (
    <section style={{ paddingBlock: spacing.scale[12] }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Card
          className="relative overflow-hidden text-center !p-0"
          style={{
            borderRadius: radius.xl,
            border: `1px solid ${colors.border.selected}`,
            backgroundImage: [
              `radial-gradient(ellipse 60% 50% at 100% 0%, ${colors.orange[100]} 0%, transparent 70%)`,
              `radial-gradient(ellipse 50% 45% at 0% 100%, ${colors.background.landingGlowSoft} 0%, transparent 68%)`,
              `linear-gradient(135deg, ${colors.surface.primary} 0%, ${colors.orange[50]} 100%)`,
            ].join(", "),
          }}
        >
          <div style={{ padding: `${spacing.scale[12]} ${spacing.scale[8]}` }}>
            <h2
              className="text-3xl sm:text-4xl"
              style={{
                fontFamily: typography.fontFamily.display,
                fontWeight: typography.fontWeight.regular,
                color: colors.text.primary,
              }}
            >
              Prêt à préparer votre déclaration LMNP ?
            </h2>
            <p
              className="mx-auto mt-4 max-w-xl"
              style={{ ...typography.body.desktop, color: colors.text.secondary }}
            >
              Déposez vos documents, laissez l&apos;IA préparer votre liasse et validez
              simplement avant télétransmission.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button href="/dashboard">Commencer maintenant</Button>
              <Button variant="secondary" href="#faq">
                En savoir plus
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
