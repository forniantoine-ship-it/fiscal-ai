import { PrimaryButton, SecondaryButton } from "@/components/lmnp/design-system";

export function HomeHero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32">
      <div className="gradient-mesh absolute inset-0 -z-10" />
      <div className="mx-auto max-w-3xl px-6 text-center">
        <p className="text-[12px] tracking-wide text-stone-500">Déclaration LMNP simplifiée</p>
        <h1
          className="mt-6 text-4xl font-normal leading-[1.12] tracking-tight text-stone-800 sm:text-5xl lg:text-[3.25rem]"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Déposez vos documents,
          <br />
          votre liasse est générée
        </h1>
        <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-stone-500">
          Fiscal AI analyse vos pièces, pré-remplit votre déclaration et vous guide jusqu’à la
          télétransmission — sans jargon, sans stress.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryButton href="/app">Commencer ma déclaration</PrimaryButton>
          <SecondaryButton href="#comment-ca-marche">Voir comment ça marche</SecondaryButton>
        </div>
        <p className="mt-5 text-[11px] text-stone-400">
          Sans engagement · Données hébergées en UE · Accompagnement humain si besoin
        </p>
      </div>
    </section>
  );
}
