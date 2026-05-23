import { LightCard, PrimaryButton } from "@/components/lmnp/design-system";

const INCLUDED = [
  "Génération de la déclaration LMNP",
  "Calcul des amortissements",
  "Télétransmission EDI incluse",
  "Export PDF de votre liasse",
];

export function HomePricing() {
  return (
    <section id="tarif" className="py-28 sm:py-36">
      <div className="mx-auto max-w-lg px-6">
        <div className="text-center">
          <h2
            className="text-[1.65rem] font-normal leading-snug text-stone-800 sm:text-3xl"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            Un tarif. Tout compris.
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-stone-500">
            Paiement annuel unique — sans abonnement, sans surprise.
          </p>
        </div>

        <LightCard className="mt-14 px-8 py-10 text-center sm:px-10 sm:py-12">
          <p className="text-[13px] text-stone-500">Par déclaration · par bien</p>
          <p className="mt-4">
            <span
              className="text-[3rem] font-normal leading-none text-stone-800 sm:text-[3.25rem]"
              style={{ fontFamily: "var(--font-display), Georgia, serif" }}
            >
              149 €
            </span>
            <span className="ml-1 text-[15px] text-stone-500">TTC</span>
          </p>
          <p className="mt-3 text-[14px] text-stone-500">Télétransmission EDI incluse</p>

          <ul className="mt-10 space-y-3 text-left">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-stone-600">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-stone-400" aria-hidden />
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-10">
            <PrimaryButton href="/app" className="w-full sm:w-auto">
              Commencer ma déclaration
            </PrimaryButton>
          </div>
        </LightCard>

        <p className="mt-8 text-center text-[13px] leading-relaxed text-stone-400">
          Plusieurs biens locatifs ?{" "}
          <a href="mailto:contact@fiscal-ai.fr" className="text-stone-500 underline-offset-2 hover:text-stone-700 hover:underline">
            Contactez-nous
          </a>{" "}
          pour un devis personnalisé.
        </p>
      </div>
    </section>
  );
}
