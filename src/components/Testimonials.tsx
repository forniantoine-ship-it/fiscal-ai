import { SectionHeading } from "./ui/SectionHeading";

const testimonials = [
  {
    quote:
      "J'ai économisé 6 200 € sur ma déclaration 2025 grâce au PER et au déficit foncier que je ne connaissais pas. Tout est documenté pour l'administration.",
    name: "Marie L.",
    role: "Cadre supérieure, Lyon",
    savings: "6 200 € / an",
  },
  {
    quote:
      "En tant qu'indépendant, je pensais tout optimiser. Fiscal AI a trouvé des leviers sur ma holding et mes frais réels. L'expert a validé chaque ligne.",
    name: "Thomas B.",
    role: "Consultant IT, Paris",
    savings: "4 150 € / an",
  },
  {
    quote:
      "Interface claire, réponses en 24 h, et surtout : zéro zone grise. Mon comptable a validé le rapport sans modification. Je recommande.",
    name: "Sophie M.",
    role: "Investisseuse immobilière, Bordeaux",
    savings: "9 800 € / an",
  },
];

export function Testimonials() {
  return (
    <section id="temoignages" className="border-t border-white/5 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="Témoignages"
          title="Ils ont optimisé leur fiscalité en toute légalité"
          description="Plus de 2 400 contribuables français nous font confiance pour réduire leurs impôts sans prendre de risques."
        />

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <article
              key={t.name}
              className="flex flex-col rounded-2xl border border-white/5 bg-zinc-900/60 p-8"
            >
              <div className="mb-4 flex gap-1 text-amber-400">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg key={i} className="h-4 w-4 fill-current" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <blockquote className="flex-1 text-sm leading-relaxed text-zinc-300">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <div className="mt-6 border-t border-white/5 pt-6">
                <p className="font-semibold">{t.name}</p>
                <p className="text-sm text-zinc-500">{t.role}</p>
                <p className="mt-2 text-sm font-medium text-emerald-400">{t.savings}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
