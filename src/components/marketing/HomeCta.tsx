import { PrimaryButton } from "@/components/lmnp/design-system";

export function HomeCta() {
  return (
    <section className="pb-32 pt-8 sm:pb-40 sm:pt-12">
      <div className="mx-auto max-w-2xl px-6 text-center">
        <h2
          className="text-[1.65rem] font-normal leading-snug text-stone-800 sm:text-3xl"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Votre déclaration LMNP n’a jamais été aussi simple.
        </h2>
        <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-stone-500">
          Créez votre dossier, déposez vos documents et laissez le système préparer le reste.
        </p>
        <div className="mt-10">
          <PrimaryButton href="/app">Commencer ma déclaration</PrimaryButton>
        </div>
        <p className="mt-6 text-[13px] text-stone-400">149 € TTC · EDI inclus</p>
      </div>
    </section>
  );
}
