import { Button } from "@/design-system/components/Button";
import { ProgressBar } from "@/design-system/components/ProgressBar";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

type DashboardHeroProps = {
  year: number;
  progress: number;
  progressLabel?: string;
  saveLabel?: string | null;
  saveActive?: boolean;
  primaryLabel: string;
  primaryHref?: string;
  onPrimaryClick?: () => void;
};

const HERO_TITLE = "Votre déclaration LMNP";
const HERO_EXPLANATION = [
  "Déposez les documents demandés par l'IA.",
  "L'IA extrait automatiquement les données importantes.",
  "Vous n'avez plus qu'à corriger ou valider.",
].join("\n");

export function DashboardHero({
  year,
  progress,
  progressLabel = "Avancement du dossier",
  saveLabel,
  saveActive = false,
  primaryLabel,
  primaryHref,
  onPrimaryClick,
}: DashboardHeroProps) {
  return (
    <section
      className="relative mx-auto max-w-3xl overflow-hidden text-center"
      style={{
        borderRadius: radius.xl,
        border: `1px solid ${colors.border.selected}`,
        boxShadow: `${shadows.hero.floating}, 0 0 0 1px ${colors.orange[50]}`,
        padding: spacing.card.lg,
        backgroundImage: [
          `radial-gradient(ellipse 92% 68% at 50% 0%, ${colors.orange[100]} 0%, ${colors.orange[50]} 38%, transparent 72%)`,
          `radial-gradient(ellipse 62% 48% at 0% 100%, ${colors.background.landingGlowSoft} 0%, transparent 58%)`,
          `radial-gradient(ellipse 62% 48% at 100% 100%, ${colors.orange[100]} 0%, transparent 58%)`,
          gradients.card.elevated,
        ].join(", "),
      }}
    >
      <div className="relative flex flex-wrap items-center justify-center gap-3">
        <YearBadge year={year} />
        {saveLabel ? <SavePill label={saveLabel} active={saveActive} /> : null}
      </div>

      <h1
        className="relative mx-auto mt-8 max-w-2xl text-3xl sm:text-4xl lg:text-[3rem]"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          lineHeight: typography.lineHeight.display,
          letterSpacing: typography.letterSpacing.display,
          color: colors.text.primary,
        }}
      >
        {HERO_TITLE}
      </h1>
      <p
        className="relative mx-auto mt-5 max-w-xl whitespace-pre-line"
        style={{
          ...typography.body.desktop,
          color: colors.text.secondary,
          lineHeight: typography.lineHeight.relaxed,
        }}
      >
        {HERO_EXPLANATION}
      </p>

      <div className="relative mx-auto mt-10 max-w-md text-left">
        <ProgressBar value={progress} label={progressLabel} />
      </div>

      <div className="relative mt-10 flex justify-center">
        {onPrimaryClick ? (
          <Button onClick={onPrimaryClick}>{primaryLabel}</Button>
        ) : (
          <Button href={primaryHref}>{primaryLabel}</Button>
        )}
      </div>
    </section>
  );
}

export function YearBadge({ year }: { year: number }) {
  return (
    <span
      style={{
        ...typography.caption.desktop,
        color: colors.text.accent,
        letterSpacing: typography.letterSpacing.label,
        padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
        borderRadius: radius.full,
        border: `1px solid ${colors.border.selected}`,
        backgroundColor: colors.surface.selected,
      }}
    >
      Exercice LMNP {year}
    </span>
  );
}

function SavePill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-2"
      style={{
        ...typography.caption.desktop,
        color: colors.text.secondary,
        padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
        borderRadius: radius.full,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.primary,
      }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{
          backgroundColor: active ? colors.orange[500] : colors.success.DEFAULT,
          animation: active ? motions.analyzing.pulse : undefined,
        }}
      />
      {label}
    </span>
  );
}
