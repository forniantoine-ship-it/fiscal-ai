import { PrimaryButton, SecondaryButton } from "@/components/lmnp/design-system";
import { HomeProductMock } from "./HomeProductMock";

export function HomeHero() {
  return (
    <section className="pt-28 pb-20 sm:pt-36 sm:pb-28">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h1
          className="text-[2rem] font-normal leading-[1.15] tracking-tight text-stone-800 sm:text-[2.75rem] lg:text-[3.1rem]"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Votre déclaration LMNP.
          <br />
          Enfin simple.
        </h1>
        <p className="mx-auto mt-7 max-w-lg text-[17px] leading-[1.65] text-stone-500 sm:text-lg">
          Déposez vos documents. L’IA prépare votre dossier. Vous validez l’essentiel — la
          déclaration se génère automatiquement, jusqu’à la télétransmission.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <PrimaryButton href="/app">Commencer ma déclaration</PrimaryButton>
          <SecondaryButton href="#produit">Voir la démonstration</SecondaryButton>
        </div>

        <p className="mt-8 text-[15px] text-stone-600">
          <span
            className="text-[1.35rem] text-stone-800"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            149 €
          </span>{" "}
          <span className="text-stone-500">TTC · télétransmission EDI incluse</span>
        </p>
      </div>

      <div className="mx-auto mt-20 max-w-4xl px-6 sm:mt-24">
        <HomeProductMock compact />
      </div>
    </section>
  );
}
