const items = [
  {
    title: "Extraction IA",
    description: "Loyers, charges, crédit : les montants sont détectés automatiquement.",
  },
  {
    title: "Amortissements",
    description: "Calculs intégrés à partir de vos factures et actes.",
  },
  {
    title: "Télétransmission",
    description: "Envoi sécurisé de votre liasse à l’administration.",
  },
  {
    title: "Accompagnement",
    description: "Une équipe disponible si une étape vous semble floue.",
  },
  {
    title: "Signature électronique",
    description: "Signez votre déclaration en quelques clics.",
  },
];

export function ReassuranceGrid() {
  return (
    <section id="comment-ca-marche" className="border-t border-stone-200/80 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <h2
          className="text-center text-2xl font-normal text-stone-800 sm:text-3xl"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Tout est pensé pour vous simplifier la vie
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-stone-500">
          Pas de logiciel comptable à apprendre. Une seule chose à la fois.
        </p>
        <ul className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.title} className="text-center sm:text-left">
              <h3 className="text-[15px] font-medium text-stone-700">{item.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-stone-500">{item.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
