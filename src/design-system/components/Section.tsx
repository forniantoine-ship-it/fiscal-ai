import { colors } from "@/design-system/theme/colors";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

export type SectionHeadingProps = {
  label: string;
  title: string;
  description?: string;
  align?: "left" | "center";
};

export function SectionHeading({
  label,
  title,
  description,
  align = "center",
}: SectionHeadingProps) {
  const alignClass = align === "center" ? "text-center mx-auto" : "text-left";

  return (
    <div className={`max-w-2xl ${alignClass}`}>
      <p
        style={{
          ...typography.caption.desktop,
          color: colors.text.accent,
          letterSpacing: typography.letterSpacing.label,
          textTransform: "uppercase",
          marginBottom: spacing.scale[3],
          fontWeight: typography.fontWeight.medium,
        }}
      >
        {label}
      </p>
      <h2
        className="text-3xl sm:text-4xl lg:text-5xl"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          lineHeight: typography.lineHeight.title,
          letterSpacing: typography.letterSpacing.title,
          color: colors.text.primary,
        }}
      >
        {title}
      </h2>
      {description ? (
        <p
          className="mt-4 text-base sm:text-lg"
          style={{
            ...typography.body.desktop,
            color: colors.text.secondary,
          }}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

export default SectionHeading;
