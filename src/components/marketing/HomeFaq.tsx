"use client";

import { useState } from "react";

const faqs = [
  {
    q: "Dois-je connaître la comptabilité LMNP ?",
    a: "Non. Le parcours vous guide et pré-remplit les montants à partir de vos documents. Vous confirmez, sans calculs manuels.",
  },
  {
    q: "Quels documents dois-je fournir ?",
    a: "Baux, quittances, relevés bancaires, taxe foncière, assurance, charges, factures d’ameublement, attestations d’emprunt… Le parcours indique précisément ce qui est attendu.",
  },
  {
    q: "LMNP et LMP sont-ils pris en charge ?",
    a: "Oui, les deux régimes sont couverts. Le parcours s’adapte à votre situation locative.",
  },
  {
    q: "La télétransmission est-elle incluse ?",
    a: "Oui. La génération de la liasse, le PDF et l’envoi EDI vers l’administration sont inclus dans le tarif unique de 149 € TTC.",
  },
  {
    q: "Mes données sont-elles en sécurité ?",
    a: "Vos documents sont chiffrés, hébergés en Union européenne et ne sont jamais revendus. Vous gardez le contrôle jusqu’à la validation finale.",
  },
  {
    q: "Puis-je reprendre mon dossier l’année prochaine ?",
    a: "Oui. Votre historique et vos amortissements sont conservés pour simplifier les déclarations suivantes.",
  },
];

export function HomeFaq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="py-28 sm:py-36">
      <div className="mx-auto max-w-xl px-6">
        <h2
          className="text-center text-[1.65rem] font-normal text-stone-800 sm:text-3xl"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Questions fréquentes
        </h2>
        <p className="mx-auto mt-5 max-w-sm text-center text-[15px] leading-relaxed text-stone-500">
          Les réponses essentielles, sans jargon.
        </p>

        <ul className="mt-14 divide-y divide-stone-200/70">
          {faqs.map((faq, i) => {
            const isOpen = open === i;
            return (
              <li key={faq.q}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-6 py-5 text-left text-[15px] text-stone-700 transition-colors hover:text-stone-800"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span>{faq.q}</span>
                  <span className="mt-0.5 shrink-0 text-[13px] text-stone-400" aria-hidden>
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen && (
                  <p className="pb-5 text-[14px] leading-relaxed text-stone-500">{faq.a}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
