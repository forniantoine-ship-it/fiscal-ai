const STEPS = [
  {
    title: "Déposez vos documents",
    description: "Baux, quittances, relevés, factures — le parcours vous indique quoi fournir.",
  },
  {
    title: "L’IA prépare votre dossier",
    description: "Les montants sont extraits et classés automatiquement, sans jargon comptable.",
  },
  {
    title: "Vous validez l’essentiel",
    description: "Quelques confirmations suffisent. Vous gardez le contrôle, sans calculs manuels.",
  },
  {
    title: "Générez votre déclaration",
    description: "Liasse prête, PDF inclus, télétransmission EDI vers l’administration.",
  },
];

export function HomeHowItWorks() {
  return (
    <section id="comment-ca-marche" className="py-28 sm:py-36">
      <div className="mx-auto max-w-2xl px-6">
        <h2
          className="text-center text-[1.65rem] font-normal leading-snug text-stone-800 sm:text-3xl"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Quatre étapes. Rien de plus.
        </h2>
        <p className="mx-auto mt-5 max-w-md text-center text-[15px] leading-relaxed text-stone-500">
          Un parcours document par document, pensé pour ceux qui ne veulent pas apprendre la
          comptabilité.
        </p>

        <ol className="mt-16 space-y-12 sm:space-y-14">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-6 sm:gap-8">
              <span
                className="mt-0.5 w-6 shrink-0 text-[13px] tabular-nums text-stone-400/80"
                aria-hidden
              >
                {index + 1}
              </span>
              <div>
                <h3 className="text-[16px] font-medium text-stone-700">{step.title}</h3>
                <p className="mt-2 max-w-md text-[15px] leading-relaxed text-stone-500">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
