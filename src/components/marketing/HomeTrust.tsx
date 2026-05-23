const points = [
  {
    title: "Dépôts sécurisés",
    description: "Vos documents sont transmis de façon chiffrée et stockés en Union européenne.",
  },
  {
    title: "Données privées",
    description: "Vos informations ne sont ni revendues ni utilisées à d’autres fins.",
  },
  {
    title: "Contrôle total",
    description: "Vous validez chaque montant avant la génération et l’envoi de la déclaration.",
  },
];

export function HomeTrust() {
  return (
    <section id="confiance" className="py-28 sm:py-36">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2
          className="text-[1.65rem] font-normal leading-snug text-stone-800 sm:text-3xl"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Vos données, traitées avec soin
        </h2>
        <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-stone-500">
          La sécurité ne devrait jamais être un argument marketing. Chez nous, c’est une évidence
          discrète.
        </p>
      </div>

      <ul className="mx-auto mt-16 grid max-w-4xl gap-12 px-6 sm:grid-cols-3 sm:gap-8">
        {points.map((item) => (
          <li key={item.title} className="text-center">
            <h3 className="text-[14px] font-medium text-stone-700">{item.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-stone-500">{item.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
