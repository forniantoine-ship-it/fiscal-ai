import { HomeProductMock } from "./HomeProductMock";

const highlights = [
  {
    title: "Parcours guidé",
    description: "Chaque étape est claire. Vous savez toujours quoi faire ensuite.",
  },
  {
    title: "Extraction discrète",
    description: "Les montants sont détectés à partir de vos documents, sans saisie fastidieuse.",
  },
  {
    title: "Validation rassurante",
    description: "Vous confirmez l’essentiel avant la génération de la déclaration.",
  },
];

export function HomeProductPreview() {
  return (
    <section id="produit" className="py-28 sm:py-36">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="text-[1.65rem] font-normal leading-snug text-stone-800 sm:text-3xl"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            L’interface fait le travail pour vous
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-stone-500">
            Pas de tableau de bord comptable. Un espace calme, centré sur vos documents et votre
            déclaration.
          </p>
        </div>

        <div className="mt-16 sm:mt-20">
          <HomeProductMock />
        </div>

        <ul className="mt-20 grid gap-12 sm:grid-cols-3 sm:gap-10">
          {highlights.map((item) => (
            <li key={item.title}>
              <h3 className="text-[15px] font-medium text-stone-700">{item.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-stone-500">{item.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
