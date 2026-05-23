const contrasts = [
  {
    title: "Plus simple que les logiciels LMNP",
    description:
      "Pas de menus comptables ni de tableaux à décrypter. Un parcours unique, étape par étape.",
  },
  {
    title: "Plus accessible qu’un expert-comptable",
    description:
      "149 € pour l’année, tout compris. Vous gardez la main sur vos documents et votre calendrier.",
  },
  {
    title: "Plus serein que les feuilles Excel",
    description:
      "Amortissements, charges, loyers : le dossier se construit seul à partir de vos pièces.",
  },
];

export function HomeDifferentiation() {
  return (
    <section className="py-28 sm:py-36">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2
          className="text-[1.65rem] font-normal leading-snug text-stone-800 sm:text-3xl"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Une autre façon de faire sa déclaration
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-stone-500">
          Fiscal AI ne remplace pas votre réflexion — il enlève la complexité inutile.
        </p>
      </div>

      <ul className="mx-auto mt-16 max-w-4xl space-y-14 px-6 sm:space-y-16">
        {contrasts.map((item) => (
          <li key={item.title} className="mx-auto max-w-xl text-center">
            <h3 className="text-[15px] font-medium text-stone-700">{item.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-stone-500">{item.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
