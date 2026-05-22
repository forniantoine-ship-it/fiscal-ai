import { PrimaryButton } from "@/components/lmnp/design-system";

export function HomeCta() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-2xl px-6 text-center">
        <h2
          className="text-2xl font-normal text-stone-800 sm:text-3xl"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Prêt à avancer sereinement ?
        </h2>
        <p className="mt-4 text-stone-500">
          Créez votre dossier, déposez vos documents et laissez le système faire le reste.
        </p>
        <div className="mt-8">
          <PrimaryButton href="/app">Démarrer gratuitement</PrimaryButton>
        </div>
      </div>
    </section>
  );
}
