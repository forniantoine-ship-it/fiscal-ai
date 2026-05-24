import { Button } from "@/design-system/components/Button";

const stats = [
  { value: "2 400+", label: "Profils analysés" },
  { value: "18 %", label: "Économie moyenne" },
  { value: "100 %", label: "Conforme au CGI" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 sm:pt-36 sm:pb-28">
      <div className="gradient-mesh absolute inset-0 -z-10" />
      <div className="absolute left-1/2 top-0 -z-10 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-accent-subtle blur-3xl" />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-100 px-4 py-1.5 text-sm text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            Assistant fiscal IA — France 2026
          </div>

          <h1
            className="text-4xl font-normal leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            Réduisez vos impôts{" "}
            <span className="text-gradient">légalement</span>, avec l&apos;IA
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-stone-600 sm:text-xl">
            Fiscal AI analyse votre situation fiscale française, identifie les
            dispositifs conformes au Code général des impôts et vous propose un
            plan d&apos;optimisation personnalisé — sans zone grise.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button href="#contact">Obtenir mon diagnostic gratuit</Button>
            <Button variant="secondary" href="/dashboard">
              Mon dossier LMNP
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Button>
          </div>

          <p className="mt-4 text-xs text-stone-500">
            Sans engagement · Réponse sous 24 h · Données hébergées en UE
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-3 gap-4 sm:gap-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="glass rounded-2xl px-4 py-5 text-center sm:px-6 sm:py-6"
            >
              <p className="text-2xl font-bold text-accent sm:text-3xl">{stat.value}</p>
              <p className="mt-1 text-xs text-stone-600 sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-16 max-w-4xl">
          <div className="glass overflow-hidden rounded-2xl border border-stone-200 shadow-2xl shadow-stone-900/5">
            <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-100 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-red-500/80" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
              <span className="h-3 w-3 rounded-full bg-green-500/80" />
              <span className="ml-2 text-xs text-stone-500">fiscal-ai.app — Analyse fiscale</span>
            </div>
            <div className="grid gap-0 sm:grid-cols-2">
              <div className="border-b border-stone-200 p-6 sm:border-b-0 sm:border-r">
                <p className="text-xs font-medium uppercase tracking-wider text-stone-500">
                  Situation détectée
                </p>
                <ul className="mt-4 space-y-3 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-accent">✓</span>
                    TMI 30 % — Revenus fonciers + salaire
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-accent">✓</span>
                    PER non optimisé (plafond 12 900 €)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-accent">✓</span>
                    Déficit foncier possible : 8 200 €
                  </li>
                </ul>
              </div>
              <div className="bg-accent-subtle p-6">
                <p className="text-xs font-medium uppercase tracking-wider text-accent">
                  Économie estimée
                </p>
                <p className="mt-2 text-4xl font-bold">4 680 €</p>
                <p className="mt-1 text-sm text-stone-600">par an, légalement</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-emerald-400 to-amber-400" />
                </div>
                <p className="mt-2 text-xs text-stone-500">78 % du potentiel fiscal activé</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
