import { SectionHeading } from "@/design-system/components/Section";
import { Button } from "@/design-system/components/Button";

const steps = [
  {
    step: "01",
    title: "Analyse de votre profil",
    description:
      "Importez vos déclarations, bulletins et patrimoine. Notre IA cartographie vos revenus, charges et TMI en quelques minutes.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    step: "02",
    title: "Identification légale des leviers",
    description:
      "PER, déficit foncier, Pinel, holding familiale, frais réels… L'IA croise votre situation avec le CGI et la jurisprudence à jour.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    step: "03",
    title: "Plan d'optimisation validé",
    description:
      "Recevez un rapport actionnable, chiffré et priorisé. Un expert-comptable partenaire valide chaque recommandation avant mise en œuvre.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

const legalPoints = [
  "Conformité stricte au Code général des impôts (CGI)",
  "Aucune fraude, montage abusif ou dissimulation",
  "Traçabilité complète pour un contrôle fiscal serein",
  "Validation humaine par des experts fiscalistes agréés",
];

export function HowItWorks() {
  return (
    <section id="fonctionnement" className="border-t border-stone-200 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="Comment ça marche"
          title="L'IA au service d'une optimisation 100 % légale"
          description="Nous ne promettons pas l'impossible. Nous activons chaque dispositif fiscal auquel vous avez droit, de manière transparente et documentée."
        />

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {steps.map((item) => (
            <div
              key={item.step}
              className="group relative rounded-2xl border border-stone-200 bg-zinc-900/80 p-8 transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/5"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-accent transition-colors group-hover:bg-emerald-500/25">
                {item.icon}
              </div>
              <span className="text-xs font-bold tracking-widest text-accent/80">
                ÉTAPE {item.step}
              </span>
              <h3 className="mt-2 text-xl font-semibold">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-stone-600">{item.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 lg:grid-cols-2 lg:p-12">
          <div>
            <h3
              className="text-2xl font-normal sm:text-3xl"
              style={{ fontFamily: "var(--font-display), Georgia, serif" }}
            >
              Pourquoi c&apos;est légal ?
            </h3>
            <p className="mt-4 leading-relaxed text-stone-600">
              L&apos;optimisation fiscale consiste à utiliser les niches et mécanismes prévus par
              la loi — pas à les contourner. Fiscal AI se limite aux dispositifs reconnus par
              l&apos;administration fiscale française.
            </p>
            <Button href="#contact" className="mt-6">
              Demander mon analyse gratuite
            </Button>
          </div>
          <ul className="space-y-4">
            {legalPoints.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm sm:text-base">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs text-accent">
                  ✓
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
