"use client";

import { useState } from "react";

const faqs = [
  {
    q: "Dois-je connaître la comptabilité LMNP ?",
    a: "Non. Le parcours prépare les montants à partir de vos documents. Vous confirmez l’essentiel — sans calculs.",
  },
  {
    q: "Quels documents dois-je fournir ?",
    a: "Baux, quittances, relevés, taxe foncière, assurance, charges, factures d’ameublement, attestations d’emprunt… Chaque étape précise ce qui est attendu.",
  },
  {
    q: "LMNP et LMP sont-ils pris en charge ?",
    a: "Oui. Le parcours s’adapte à votre régime locatif.",
  },
  {
    q: "La télétransmission est-elle incluse ?",
    a: "Oui — liasse, PDF et envoi EDI sont compris dans les 149 € TTC.",
  },
  {
    q: "Mes données sont-elles protégées ?",
    a: "Documents chiffrés, hébergement en Union européenne, aucune revente.",
  },
];

export function LandingFaq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <ul className="mt-10 divide-y divide-stone-300/40">
      {faqs.map((faq, i) => {
        const isOpen = open === i;
        return (
          <li key={faq.q}>
            <button
              type="button"
              className="flex w-full items-start justify-between gap-6 py-5 text-left"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
            >
              <span className="text-[15px] leading-snug text-stone-700">{faq.q}</span>
              <span className="mt-0.5 shrink-0 text-[12px] text-stone-400">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen ? (
              <p className="pb-6 text-[15px] leading-[1.75] text-stone-500">{faq.a}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
