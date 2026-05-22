const STEPS = [
  "Déposez vos documents",
  "L’IA pré-remplit les données",
  "Vous vérifiez et confirmez",
  "La déclaration est télétransmise",
];

export function DeclarationHowItWorks() {
  return (
    <ol className="mx-auto mt-10 max-w-sm space-y-5 text-left">
      {STEPS.map((text, index) => (
        <li key={text} className="flex gap-4">
          <span className="mt-0.5 w-5 shrink-0 text-[12px] tabular-nums text-stone-400/70">
            {index + 1}
          </span>
          <span className="text-[14px] leading-relaxed text-stone-500">{text}</span>
        </li>
      ))}
    </ol>
  );
}
