"use client";

import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

type ExistingActivityAnswer = "yes" | "no" | null;

type AmortissementHeroProps = {
  existingActivity: ExistingActivityAnswer;
  onExistingActivityChange: (value: "yes" | "no") => void;
  totalUploadedCount?: number;
  disabled?: boolean;
};

const HERO_BADGE = "Amortissements";
const HERO_TITLE = "Préparez vos amortissements simplement";
const HERO_EXPLANATION =
  "Le logiciel analyse vos documents et prépare automatiquement la ventilation comptable de votre bien.\nVous n'avez pas besoin de maîtriser les règles fiscales — l'IA s'en charge pour vous.";

export function AmortissementHero({
  existingActivity,
  onExistingActivityChange,
  totalUploadedCount = 0,
  disabled = false,
}: AmortissementHeroProps) {
  const answered = existingActivity !== null;

  return (
    <section
      className="relative mx-auto max-w-3xl overflow-hidden text-center"
      style={{
        borderRadius: radius.lg,
        border: `1px solid ${colors.border.subtle}`,
        boxShadow: shadows.card.default,
        padding: `${spacing.card.sm} ${spacing.card.md}`,
        backgroundImage: [
          `radial-gradient(ellipse 88% 52% at 50% -8%, ${colors.orange[100]} 0%, transparent 62%)`,
          gradients.card.elevated,
        ].join(", "),
      }}
    >
      <div className="relative flex flex-wrap items-center justify-center gap-2">
        <span
          style={{
            ...typography.caption.desktop,
            color: colors.text.accent,
            letterSpacing: typography.letterSpacing.label,
            padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
            borderRadius: radius.full,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.selected,
          }}
        >
          {HERO_BADGE}
        </span>
        {totalUploadedCount > 0 ? (
          <span
            className="inline-flex items-center gap-2"
            style={{
              ...typography.caption.desktop,
              color: colors.success.DEFAULT,
              padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
              borderRadius: radius.full,
              border: `1px solid ${colors.success.muted}`,
              backgroundColor: colors.surface.primary,
            }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: colors.success.DEFAULT }}
            />
            {totalUploadedCount === 1
              ? "1 document reçu"
              : `${totalUploadedCount} documents reçus`}
          </span>
        ) : null}
      </div>

      <h1
        className="relative mx-auto mt-4 max-w-xl text-[1.375rem] sm:text-[1.625rem]"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          lineHeight: typography.lineHeight.heading,
          letterSpacing: typography.letterSpacing.heading,
          color: colors.text.primary,
        }}
      >
        {HERO_TITLE}
      </h1>
      <p
        className="relative mx-auto mt-2.5 max-w-lg whitespace-pre-line"
        style={{
          ...typography.body.desktop,
          fontSize: typography.fontSize.sm,
          color: colors.text.secondary,
          lineHeight: typography.lineHeight.ui,
        }}
      >
        {HERO_EXPLANATION}
      </p>

      {!answered ? (
        <div className="relative mx-auto mt-8 max-w-md">
          <p
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize.lg,
              color: colors.text.primary,
            }}
          >
            Avez-vous déjà déclaré cette activité LMNP ?
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <ChoiceButton
              label="Oui"
              selected={existingActivity === "yes"}
              onClick={() => onExistingActivityChange("yes")}
              disabled={disabled}
            />
            <ChoiceButton
              label="Non"
              selected={existingActivity === "no"}
              onClick={() => onExistingActivityChange("no")}
              disabled={disabled}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ChoiceButton({
  label,
  selected,
  onClick,
  disabled,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...typography.body.desktop,
        minWidth: "7rem",
        padding: `${spacing.scale[3]} ${spacing.scale[5]}`,
        borderRadius: radius.full,
        border: `1px solid ${selected ? colors.orange[300] : colors.border.subtle}`,
        backgroundColor: selected ? colors.orange[50] : colors.surface.primary,
        color: selected ? colors.text.primary : colors.text.secondary,
        boxShadow: selected ? shadows.card.default : "none",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}
