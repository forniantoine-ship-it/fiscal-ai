"use client";

interface WelcomeStepProps {
  onNext: () => void;
}

const features = [
  {
    title: "Déclaration LMNP simplifiée",
    description: "Formulaires 2031 et annexes 2033 pré-remplis selon la réglementation 2025.",
    icon: "📋",
  },
  {
    title: "OCR intelligent",
    description: "Extraction automatique des montants depuis vos baux, quittances et factures.",
    icon: "🔍",
  },
  {
    title: "Optimisation fiscale",
    description: "Comparaison micro-BIC vs régime réel avec simulation d'amortissement.",
    icon: "📊",
  },
  {
    title: "Conformité garantie",
    description: "Vérification CGI, seuils et catégories de revenus BIC non professionnels.",
    icon: "✓",
  },
];

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="space-y-8">
      <div>
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Déclaration LMNP · Exercice 2025
        </div>
        <h2
          className="text-2xl font-normal tracking-tight sm:text-3xl"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Votre déclaration locative meublée,{" "}
          <span className="text-gradient">guidée par l&apos;IA</span>
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-600 sm:text-base">
          Ce parcours vous accompagne étape par étape pour constituer votre liasse fiscale LMNP :
          collecte des pièces, analyse OCR, saisie du bien et validation avant export.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {features.map((feature) => (
          <article
            key={feature.title}
            className="glass group rounded-xl p-4 transition-colors hover:border-accent/20"
          >
            <span className="text-2xl" role="img" aria-hidden>
              {feature.icon}
            </span>
            <h3 className="mt-3 text-sm font-semibold text-stone-900">{feature.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">{feature.description}</p>
          </article>
        ))}
      </div>

      <div className="glass rounded-xl border border-accent/20 bg-accent/5 p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-accent">
          Durée estimée
        </p>
        <p className="mt-1 text-sm text-stone-700">
          Environ <strong className="text-accent">12 minutes</strong> avec vos documents à portée
          de main. L&apos;assistant IA reste disponible à chaque étape.
        </p>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-stone-900/5 transition-all hover:opacity-90 sm:w-auto"
      >
        Commencer ma déclaration
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
      </button>
    </div>
  );
}
