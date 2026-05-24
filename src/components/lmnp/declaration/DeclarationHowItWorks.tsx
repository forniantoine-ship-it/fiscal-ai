import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";

const STEPS = [
  "Déposez vos documents",
  "L'IA pré-remplit les données",
  "Vous vérifiez et confirmez",
  "La déclaration est télétransmise",
];

export function DeclarationHowItWorks() {
  return (
    <ol className="mx-auto mt-10 max-w-sm space-y-5 text-left">
      {STEPS.map((text, index) => (
        <li key={text} className="flex gap-4">
          <span
            className="mt-0.5 w-5 shrink-0 tabular-nums"
            style={{
              ...typography.caption.desktop,
              color: colors.text.muted,
            }}
          >
            {index + 1}
          </span>
          <span
            style={{
              ...typography.body.desktop,
              color: colors.text.secondary,
            }}
          >
            {text}
          </span>
        </li>
      ))}
    </ol>
  );
}
